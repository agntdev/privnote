import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { getDomainStore } from "../store.js";
import { encryptNote, verifyPin } from "../crypto.js";

const composer = new Composer<Ctx>();

// ── Main menu button ─────────────────────────────────────────

registerMainMenuItem({ label: "📝 Add note", data: "add:start", order: 20 });

// ── Entry: button or /add command ────────────────────────────

composer.callbackQuery("add:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await startAdd(ctx);
});

composer.command("add", async (ctx) => {
  await startAdd(ctx);
});

async function startAdd(ctx: Ctx) {
  const store = getDomainStore();
  if (!store.hasCredential(ctx.from!.id)) {
    await ctx.reply("You need to set a PIN first. Tap 🔑 Set PIN in the menu.");
    return;
  }
  ctx.session.step = "awaiting_note_title";
  await ctx.reply("Give your note a title.", {
    reply_markup: { force_reply: true, input_field_placeholder: "Note title…" },
  });
}

// ── Step: awaiting_note_title ────────────────────────────────

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_note_title") return next();
  const title = ctx.message.text.trim();
  if (title.length < 1) {
    await ctx.reply("Title can't be empty. Try again.", {
      reply_markup: { force_reply: true, input_field_placeholder: "Note title…" },
    });
    return;
  }
  ctx.session.addTitle = title;
  ctx.session.step = "awaiting_note_body";
  await ctx.reply("Now send the note content.", {
    reply_markup: { force_reply: true, input_field_placeholder: "Note body…" },
  });
});

// ── Step: awaiting_note_body ─────────────────────────────────

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_note_body") return next();
  const body = ctx.message.text.trim();
  if (body.length < 1) {
    await ctx.reply("Note can't be empty. Try again.", {
      reply_markup: { force_reply: true, input_field_placeholder: "Note body…" },
    });
    return;
  }
  ctx.session.addBody = body;
  ctx.session.step = "awaiting_note_pin";
  await ctx.reply("Enter your PIN to encrypt and save this note.", {
    reply_markup: { force_reply: true, input_field_placeholder: "Your PIN…" },
  });
});

// ── Step: awaiting_note_pin ──────────────────────────────────

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_note_pin") return next();
  const pin = ctx.message.text.trim();
  const cred = getDomainStore().getCredential(ctx.from!.id);
  if (!cred) {
    ctx.session.step = "idle";
    ctx.session.addTitle = undefined;
    ctx.session.addBody = undefined;
    await ctx.reply("No PIN set. Tap 🔑 Set PIN first.");
    return;
  }

  if (!verifyPin(pin, cred)) {
    await ctx.reply("Wrong PIN. Try again.", {
      reply_markup: { force_reply: true, input_field_placeholder: "Your PIN…" },
    });
    return;
  }

  const encrypted = encryptNote(ctx.session.addBody!, pin);
  getDomainStore().createNote(ctx.from!.id, ctx.session.addTitle!, encrypted);

  ctx.session.step = "idle";
  ctx.session.addTitle = undefined;
  ctx.session.addBody = undefined;

  await ctx.reply("✅ Note saved!");
});

export default composer;
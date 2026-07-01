import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { confirmKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { resetDomainStore, getDomainStore } from "../store.js";
import { createPinVerifier, verifyPin } from "../crypto.js";

const composer = new Composer<Ctx>();

// ── Main menu button ─────────────────────────────────────────

registerMainMenuItem({ label: "🔑 Set PIN", data: "setpin:start", order: 10 });

// ── Entry: button or /setpin command ─────────────────────────

composer.callbackQuery("setpin:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await startSetPin(ctx);
});

composer.command("setpin", async (ctx) => {
  await startSetPin(ctx);
});

async function startSetPin(ctx: Ctx) {
  const store = getDomainStore();
  if (store.hasCredential(ctx.from!.id)) {
    ctx.session.step = "awaiting_new_pin";
    await ctx.reply(
      "You already have a PIN set. To change it, enter your new PIN first.",
      { reply_markup: { force_reply: true, input_field_placeholder: "Enter new PIN…" } },
    );
  } else {
    ctx.session.step = "awaiting_new_pin";
    await ctx.reply(
      "Set a PIN to protect your notes. Enter a PIN you'll remember.",
      { reply_markup: { force_reply: true, input_field_placeholder: "Enter PIN…" } },
    );
  }
}

// ── Step: awaiting_new_pin ───────────────────────────────────

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_new_pin") return next();
  const pin = ctx.message.text.trim();
  if (pin.length < 4) {
    await ctx.reply("PIN must be at least 4 characters. Try again.", {
      reply_markup: { force_reply: true, input_field_placeholder: "Enter PIN (min 4 chars)…" },
    });
    return;
  }
  if (pin.length > 64) {
    await ctx.reply("PIN is too long (max 64 characters). Try again.", {
      reply_markup: { force_reply: true, input_field_placeholder: "Enter PIN…" },
    });
    return;
  }
  ctx.session.step = "awaiting_new_pin_confirm";
  // Store temporarily in a new field or use a temp variable
  // We'll store it in session since it's ephemeral
  ctx.session.addTitle = pin; // reuse addTitle as temp storage
  await ctx.reply("Now enter the same PIN again to confirm.", {
    reply_markup: { force_reply: true, input_field_placeholder: "Confirm PIN…" },
  });
});

// ── Step: awaiting_new_pin_confirm ───────────────────────────

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_new_pin_confirm") return next();
  const confirm = ctx.message.text.trim();
  const original = ctx.session.addTitle;
  if (confirm !== original) {
    ctx.session.step = "awaiting_new_pin";
    ctx.session.addTitle = undefined;
    await ctx.reply("PINs don't match. Start over — enter a new PIN.", {
      reply_markup: { force_reply: true, input_field_placeholder: "Enter PIN…" },
    });
    return;
  }

  const verifier = createPinVerifier(confirm);
  getDomainStore().setCredential(ctx.from!.id, verifier);
  getDomainStore().upsertUser(ctx.from!.id);

  ctx.session.step = "idle";
  ctx.session.addTitle = undefined;
  await ctx.reply("✅ PIN set successfully. Your notes are now protected.");
});

export default composer;
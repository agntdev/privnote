import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getDomainStore } from "../store.js";
import { verifyPin, decryptNote } from "../crypto.js";
import { deletePinMessage } from "../pin-utils.js";

const composer = new Composer<Ctx>();

// ── Entry: tap a note title in the list ──────────────────────
// callback data: view:<note_id>

composer.callbackQuery(/^view:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const noteId = ctx.callbackQuery.data.split(":")[1];
  const store = getDomainStore();
  const note = store.getNote(noteId);
  if (!note || note.userId !== ctx.from!.id) {
    await ctx.reply("Note not found.");
    return;
  }
  ctx.session.viewNoteId = noteId;
  ctx.session.step = "awaiting_pin_for_view";
  await ctx.reply("Enter your PIN to view this note. Your PIN message will be removed after submission.", {
    reply_markup: { force_reply: true, input_field_placeholder: "Your PIN…" },
  });
});

// ── Step: awaiting_pin_for_view ──────────────────────────────

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_pin_for_view") return next();
  const pin = ctx.message.text.trim();
  const store = getDomainStore();
  const cred = store.getCredential(ctx.from!.id);
  if (!cred || !verifyPin(pin, cred)) {
    // Delete the wrong PIN message too
    await deletePinMessage(ctx);
    await ctx.reply("Wrong PIN. Try again.", {
      reply_markup: { force_reply: true, input_field_placeholder: "Your PIN…" },
    });
    return;
  }

  // Remove the PIN message from chat history
  await deletePinMessage(ctx);

  const noteId = ctx.session.viewNoteId;
  const note = store.getNote(noteId!);
  if (!note) {
    ctx.session.step = "idle";
    ctx.session.viewNoteId = undefined;
    await ctx.reply("Note not found.");
    return;
  }

  const decrypted = decryptNote(note.encrypted, pin);
  if (!decrypted) {
    ctx.session.step = "idle";
    ctx.session.viewNoteId = undefined;
    await ctx.reply("Couldn't decrypt this note. It may be corrupted.");
    return;
  }

  ctx.session.step = "idle";
  ctx.session.viewNoteId = undefined;

  const keyboard = inlineKeyboard([
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);

  await ctx.reply(`📄 ${note.title}\n\n${decrypted}`, { reply_markup: keyboard });
});

export default composer;
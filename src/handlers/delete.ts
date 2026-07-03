import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { confirmKeyboard, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getDomainStore } from "../store.js";
import { verifyPin } from "../crypto.js";
import { deletePinMessage } from "../pin-utils.js";

const composer = new Composer<Ctx>();

// ── Callback: user taps "Delete" button after viewing a note ─
// callback data: delete:confirm:<noteId>

composer.callbackQuery(/^delete:confirm:/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const noteId = ctx.callbackQuery.data.split(":")[2];
  const store = getDomainStore();
  const note = store.getNote(noteId);
  if (!note || note.userId !== ctx.from!.id) {
    await ctx.editMessageText("Note not found.");
    return;
  }
  ctx.session.deleteNoteId = noteId;
  await ctx.editMessageText(`Delete "${note.title}"? This can't be undone.`, {
    reply_markup: confirmKeyboard("delete"),
  });
});

// ── Confirmation: yes / no ───────────────────────────────────

composer.callbackQuery(/^delete:(yes|no)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const [, action] = ctx.callbackQuery.data.split(":");

  if (action === "yes") {
    ctx.session.step = "awaiting_pin_for_delete";
    await ctx.editMessageText("Enter your PIN to confirm deletion. Your PIN message will be removed after submission.");
    await ctx.reply("Type your PIN:", {
      reply_markup: { force_reply: true, input_field_placeholder: "Your PIN…" },
    });
  } else {
    ctx.session.deleteNoteId = undefined;
    await ctx.editMessageText("Deletion cancelled.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
  }
});

// ── Step: awaiting_pin_for_delete ────────────────────────────

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_pin_for_delete") return next();
  const pin = ctx.message.text.trim();
  const store = getDomainStore();
  const cred = store.getCredential(ctx.from!.id);
  if (!cred || !verifyPin(pin, cred)) {
    await deletePinMessage(ctx);
    await ctx.reply("Wrong PIN. Try again.", {
      reply_markup: { force_reply: true, input_field_placeholder: "Your PIN…" },
    });
    return;
  }

  await deletePinMessage(ctx);

  const noteId = ctx.session.deleteNoteId;
  if (!noteId) {
    ctx.session.step = "idle";
    await ctx.reply("Nothing to delete.");
    return;
  }

  const deleted = store.deleteNote(noteId, ctx.from!.id);
  ctx.session.step = "idle";
  ctx.session.deleteNoteId = undefined;

  if (deleted) {
    await ctx.reply("🗑 Note deleted.");
  } else {
    await ctx.reply("Note not found.");
  }
});

// ── /delete <note-id> command ────────────────────────────────

composer.command("delete", async (ctx) => {
  const text = ctx.message?.text?.trim();
  if (!text) {
    await ctx.reply("Usage: /delete <note-id>");
    return;
  }
  const parts = text.split(/\s+/);
  const noteId = parts[1];
  if (!noteId) {
    await ctx.reply("Usage: /delete <note-id>");
    return;
  }

  const store = getDomainStore();
  const note = store.getNote(noteId);
  if (!note || note.userId !== ctx.from!.id) {
    await ctx.reply("Note not found.");
    return;
  }

  ctx.session.deleteNoteId = noteId;
  await ctx.reply(`Delete "${note.title}"? This can't be undone.`, {
    reply_markup: confirmKeyboard("delete"),
  });
});

export default composer;
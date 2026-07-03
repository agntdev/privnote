import { Composer, InputFile } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { getDomainStore } from "../store.js";
import { verifyPin, decryptNote, deriveEncryptionKey } from "../crypto.js";
import { clock } from "../clock.js";
import { deletePinMessage } from "../pin-utils.js";

const composer = new Composer<Ctx>();

// ── Main menu button ─────────────────────────────────────────

registerMainMenuItem({ label: "📤 Export notes", data: "export:start", order: 40 });

// ── Entry: button ────────────────────────────────────────────

composer.callbackQuery("export:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getDomainStore();
  if (!store.hasCredential(ctx.from!.id)) {
    await ctx.editMessageText("You need to set a PIN first. Tap 🔑 Set PIN in the menu.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }
  if (store.noteCount(ctx.from!.id) === 0) {
    await ctx.editMessageText("No notes to export — tap 📝 Add note to create one.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  ctx.session.step = "awaiting_pin_for_export";
  await ctx.editMessageText("Enter your PIN to export all notes. Your PIN message will be removed after submission.");
  await ctx.reply("Type your PIN:", {
    reply_markup: { force_reply: true, input_field_placeholder: "Your PIN…" },
  });
});

// ── Step: awaiting_pin_for_export ────────────────────────────

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_pin_for_export") return next();
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
  ctx.session.step = "idle";

  // Derive encryption key once for all notes
  const user = store.getUser(ctx.from!.id);
  if (!user || !user.keySalt) {
    await ctx.reply("Encryption key not configured. Set your PIN again.");
    return;
  }
  const keySalt = Buffer.from(user.keySalt, "base64");
  const key = await deriveEncryptionKey(pin, keySalt);

  const noteIds = store.listNoteIds(ctx.from!.id);
  const today = clock.now().toISOString().split("T")[0];
  const lines: string[] = [`Private Notes Export — ${today}`, ""];

  for (const id of noteIds) {
    const note = store.getNote(id);
    if (!note) continue;
    const decrypted = decryptNote(note.encrypted, key);
    lines.push(`[${note.id}] ${note.title}`);
    lines.push("-".repeat(40));
    lines.push(decrypted ?? "[could not decrypt]");
    lines.push("", "");
  }

  const content = lines.join("\n");
  const buffer = Buffer.from(content, "utf-8");

  await ctx.replyWithDocument(new InputFile(buffer, "notes-export.txt"));
});

export default composer;
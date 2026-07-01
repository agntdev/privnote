import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
  registerMainMenuItem,
  paginate,
} from "../toolkit/index.js";
import { getDomainStore } from "../store.js";

const composer = new Composer<Ctx>();

// ── Main menu button ─────────────────────────────────────────

registerMainMenuItem({ label: "📋 My notes", data: "list:page:0", order: 30 });

// ── Entry: button or /list command ───────────────────────────

composer.callbackQuery(/^list:(page|prev|next):/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const parts = ctx.callbackQuery.data.split(":");
  // data formats: list:page:N, list:prev:N, list:next:N
  const page = parseInt(parts[parts.length - 1], 10) || 0;
  await showNotes(ctx, page, false);
});

composer.command("list", async (ctx) => {
  await showNotes(ctx, 0, true);
});

async function showNotes(ctx: Ctx, page: number, isNewMessage: boolean) {
  const store = getDomainStore();
  const noteIds = store.listNoteIds(ctx.from!.id);

  if (noteIds.length === 0) {
    const text = "No notes yet — tap 📝 Add note to create one.";
    if (isNewMessage) {
      await ctx.reply(text);
    } else {
      await ctx.editMessageText(text, { reply_markup: { inline_keyboard: [] } });
    }
    return;
  }

  // Build note items for pagination
  const items = noteIds.map((id) => {
    const note = store.getNote(id);
    return { id, title: note?.title ?? "Untitled" };
  });

  const { pageItems, controls, totalPages, page: actualPage } = paginate(items, {
    page,
    perPage: 5,
    callbackPrefix: "list",
  });

  const rows = pageItems.map((item) => [
    inlineButton(item.title, `view:${item.id}`),
  ]);

  const keyboard = inlineKeyboard([
    ...rows,
    ...controls.inline_keyboard,
  ]);

  const text =
    totalPages > 1
      ? `Your notes (page ${actualPage + 1}/${totalPages}):`
      : "Your notes:";

  if (isNewMessage) {
    await ctx.reply(text, { reply_markup: keyboard });
  } else {
    await ctx.editMessageText(text, { reply_markup: keyboard });
  }
}

export default composer;
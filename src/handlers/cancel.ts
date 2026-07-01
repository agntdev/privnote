import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

composer.command("cancel", async (ctx) => {
  ctx.session.step = "idle";
  ctx.session.addTitle = undefined;
  ctx.session.addBody = undefined;
  ctx.session.viewNoteId = undefined;
  ctx.session.deleteNoteId = undefined;
  await ctx.reply("Cancelled. Tap /start to begin again.", {
    reply_markup: { remove_keyboard: true },
  });
});

export default composer;
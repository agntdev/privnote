import { Composer } from "grammy";
import { readdirSync } from "node:fs";
import { createBot, type BotContext } from "./toolkit/index.js";
import { resetDomainStore } from "./store.js";
import { _resetMainMenu } from "./toolkit/ui/menu.js";

// Per-chat session state (ephemeral conversation state — NOT durable data).
// Durable domain data (users, notes, credentials) goes in `src/store.ts`.
export type Step =
  | "idle"
  | "awaiting_new_pin"
  | "awaiting_new_pin_confirm"
  | "awaiting_note_title"
  | "awaiting_note_body"
  | "awaiting_note_pin"
  | "awaiting_pin_for_view"
  | "awaiting_pin_for_export"
  | "awaiting_pin_for_delete"
  | "awaiting_delete_confirm";

export interface Session {
  step: Step;
  /** Temporary flow data (reset between flows). */
  addTitle?: string;
  addBody?: string;
  viewNoteId?: string;
  deleteNoteId?: string;
}

export type Ctx = BotContext<Session>;

/**
 * buildBot — assembles the bot, AUTO-LOADS every feature handler from
 * src/handlers/, then registers the global fallback. Does NOT start the bot.
 * Add a feature by creating src/handlers/<name>.ts that default-exports a grammY
 * Composer — NEVER edit this file (concurrent feature PRs would conflict).
 */
export async function buildBot(token: string) {
  // Reset global singletons so each fresh bot starts clean for test isolation
  resetDomainStore();
  _resetMainMenu();

  const bot = createBot<Session>(token, {
    initial: () => ({ step: "idle" }),
  });

  const dir = new URL("./handlers/", import.meta.url);
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter(
      (f) =>
        (f.endsWith(".js") || f.endsWith(".ts")) &&
        !f.endsWith(".d.ts") &&
        !f.includes(".test.") &&
        !f.includes(".spec."),
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    files = [];
  }
  for (const file of files.sort()) {
    const mod = (await import(new URL(file, dir).href)) as { default?: Composer<Ctx> };
    if (!mod.default) {
      throw new Error(`handler ${file} must default-export a grammY Composer`);
    }
    bot.use(mod.default);
  }

  bot.on("message", (ctx) => ctx.reply("Sorry, I didn't understand that. Try /help."));

  return bot;
}

import { buildBot } from "./bot.js";
import { resetDomainStore } from "./store.js";

// The Tests-gate harness imports THIS module and calls makeBot() with no args,
// replaying dialog specs tokenlessly (it fakes the Bot API transport — no real
// Telegram call is made). The token is a placeholder for replay. The agntdev-ci
// orchestrator points AGNTDEV_BOT_MODULE at the compiled dist/harness-entry.js.
export async function makeBot() {
  resetDomainStore();
  return buildBot(process.env.BOT_TOKEN ?? "harness-test-token");
}

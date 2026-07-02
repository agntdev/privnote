// Shared PIN message deletion utility.
// After a user submits a PIN, call deletePinMessage(ctx) to remove the
// PIN-containing message from chat history. Tries once, retries once.
// Never exposes the PIN in fallback messages or logs.

import type { Ctx } from "./bot.js";

/**
 * Delete the user's current message (the one being processed) from chat history.
 * Used to remove PIN-containing messages immediately after processing.
 * Tries once, retries once on failure. Never exposes the PIN in fallback messages.
 * Safe to call when ctx.message is undefined (e.g. callback queries).
 */
export async function deletePinMessage(ctx: Ctx): Promise<void> {
  const msg = ctx.message;
  if (!msg) return;
  try {
    await ctx.api.deleteMessage(msg.chat.id, msg.message_id);
  } catch {
    // Retry once
    try {
      await ctx.api.deleteMessage(msg.chat.id, msg.message_id);
    } catch {
      // Silently ignore — deletion is best-effort; never log the PIN or
      // expose it in a fallback message.
    }
  }
}

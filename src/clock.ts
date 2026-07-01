// Injectable clock seam — the ONE place time-based decisions route through.
// Override `now` in tests to control what "today", "now", "expired" means.
// (Do NOT call new Date() / Date.now() anywhere else in the bot.)

export interface Clock {
  now(): Date;
  nowMs(): number;
}

const live: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now(),
};

/** The current clock. Swap in tests: `clock.now = () => new Date("2026-01-01")`. */
export const clock: Clock = live;

/** Reset to the live clock (teardown). */
export function resetClock(): void {
  Object.assign(clock, live);
}

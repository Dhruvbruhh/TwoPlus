/**
 * The member's calendar day must be device-local, not UTC.
 *
 * Regression: every day-keyed log used `toISOString().slice(0, 10)`, the UTC
 * date. For the gym's IST timezone (UTC+5:30) anything logged between 00:00
 * and 05:30 local filed under the previous day: the water ring reset at 5:30
 * AM and late meals landed in yesterday's diary. Run with:
 * npx tsx --test tests/*.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { dayKey } from "../src/lib/format";
import { progressionFrom } from "../src/lib/progression";

test("dayKey: uses local calendar fields, not UTC", () => {
  // 2026-11-16 01:20 IST == 2026-11-15 19:50 UTC. The old code said the 15th.
  const istEarlyMorning = new Date("2026-11-16T01:20:00+05:30");
  assert.equal(dayKey(istEarlyMorning), "2026-11-16");
});

test("dayKey: matches toISOString for pure UTC-midnight dates", () => {
  const utcNoon = new Date("2026-11-16T12:00:00Z");
  assert.equal(dayKey(utcNoon), utcNoon.toISOString().slice(0, 10));
});

test("dayKey: zero-pads month and day", () => {
  assert.equal(dayKey(new Date(2026, 0, 4, 9, 0, 0)), "2026-01-04");
});

test("progression: a future day under UTC keying still earns nothing", () => {
  const p = progressionFrom({
    completedSessionDays: ["2026-11-16"],
    visitDays: [],
    today: "2026-11-16",
  });
  assert.equal(p.xp, 50); // XP_SESSION
});

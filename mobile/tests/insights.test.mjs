/**
 * Coach insight rules. Run with: npx tsx --test tests/*.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { coachInsights } from "../src/lib/insights";

test("insights: empty records produce no insights, never invented ones", () => {
  const out = coachInsights({ weightSeries: [], completedSessionDays: [], streak: 0, hasPlan: false });
  assert.deepEqual(out, []);
});

test("insights: weight trend needs >=0.5 kg and two points", () => {
  const series = [
    { measured_on: "2026-11-10", weight_kg: 79.8 },
    { measured_on: "2026-10-01", weight_kg: 80.4 },
  ];
  const out = coachInsights({ weightSeries: series, completedSessionDays: [], streak: 0, hasPlan: false });
  assert.equal(out.length, 1);
  assert.match(out[0].text, /down 0\.6 kg over 40 days/);
  assert.equal(out[0].icon, "trending-down");
});

test("insights: 0.2 kg is scale noise and is not reported", () => {
  const series = [
    { measured_on: "2026-11-10", weight_kg: 80.2 },
    { measured_on: "2026-10-01", weight_kg: 80.4 },
  ];
  const out = coachInsights({ weightSeries: series, completedSessionDays: [], streak: 0, hasPlan: false });
  assert.deepEqual(out, []);
});

test("insights: 3+ sessions in the last week are counted", () => {
  // Relative to today: the insight window is a rolling 7 days ending now,
  // so hardcoded dates age out of it (this test broke on 2026-11-15).
  const iso = (d) => d.toISOString().slice(0, 10);
  const day = (n) => iso(new Date(Date.now() - n * 86_400_000));
  const days = [day(1), day(3), day(5), "2026-09-01"];
  const out = coachInsights({ weightSeries: [], completedSessionDays: days, streak: 0, hasPlan: false });
  assert.ok(out.some((i) => i.text.startsWith("3 sessions")));
});

test("insights: streak under 3 days stays quiet", () => {
  const out = coachInsights({ weightSeries: [], completedSessionDays: [], streak: 2, hasPlan: false });
  assert.deepEqual(out, []);
});

test("insights: a plan-holder with no sessions this week gets the nudge", () => {
  const out = coachInsights({ weightSeries: [], completedSessionDays: [], streak: 0, hasPlan: true });
  assert.deepEqual(out, [{ icon: "barbell", text: "No sessions logged this week yet" }]);
});

test("insights: at most three insights are returned", () => {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const week = [1, 2, 3, 4].map((n) => iso(new Date(today.getTime() - n * 86_400_000)));
  const series = [
    { measured_on: iso(today), weight_kg: 78 },
    { measured_on: "2026-09-01", weight_kg: 82 },
  ];
  const out = coachInsights({ weightSeries: series, completedSessionDays: week, streak: 6, hasPlan: true });
  assert.ok(out.length <= 3);
  assert.ok(out.some((i) => i.text.includes("6-day gym streak")));
});

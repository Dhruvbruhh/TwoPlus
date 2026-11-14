/**
 * XP/level/mission math. Run with: npx tsx --test tests/*.test.mjs
 * These are plain Node test-runner files compiled by tsx; no Expo runtime.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS, dailyMissions, progressionFrom } from "../src/lib/progression";
import { bmr, bmi, macroSplit, oneRepMax, paceMinPerKm, waterTargetMl } from "../src/lib/fitness";

test("progression: empty record starts at Beginner, 0 XP", () => {
  const p = progressionFrom({ completedSessionDays: [], visitDays: [] });
  assert.equal(p.xp, 0);
  assert.equal(p.levelIndex, 0);
  assert.equal(p.levelName, "Beginner");
  assert.equal(p.xpToNext, 500);
});

test("progression: one completed session is worth 50 XP", () => {
  const today = "2026-11-14";
  const p = progressionFrom({ completedSessionDays: [today], visitDays: [], today });
  assert.equal(p.xp, 50);
});

test("progression: a visit-only day earns 10, a workout day never stacks", () => {
  const today = "2026-11-14";
  const both = progressionFrom({
    completedSessionDays: [today],
    visitDays: [today, "2026-11-13"],
    today,
  });
  // 50 for the workout day, 10 for the visit-only day before it.
  assert.equal(both.xp, 60);
});

test("progression: future-dated rows earn nothing (clock skew guard)", () => {
  const p = progressionFrom({
    completedSessionDays: ["2027-01-01"],
    visitDays: [],
    today: "2026-11-14",
  });
  assert.equal(p.xp, 0);
});

test("progression: level floors climb as XP accumulates", () => {
  const today = "2026-11-14";
  // 500 XP needs 10 workout days.
  const days = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(`2026-11-${String(14 - i).padStart(2, "0")}`);
    return d.toISOString().slice(0, 10);
  });
  const p = progressionFrom({ completedSessionDays: days, visitDays: [], today });
  assert.equal(p.xp, 500);
  assert.equal(p.levelName, "Rising");
});

test("progression: Legend is the ceiling, xpToNext null", () => {
  const today = "2026-11-14";
  const legendFloor = LEVELS[LEVELS.length - 1].floor;
  const days = Math.ceil(legendFloor / 50);
  const list = [];
  const cursor = new Date("2026-11-14");
  while (list.length < days) {
    list.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() - 1);
  }
  const p = progressionFrom({ completedSessionDays: list, visitDays: [], today });
  assert.equal(p.levelName, "Legend");
  assert.equal(p.xpToNext, null);
});

test("missions: water and workout states drive completion", () => {
  const m = dailyMissions({
    hasPlan: true,
    trainedToday: true,
    visitedToday: true,
    waterMl: 2000,
    waterGoalMl: 2500,
    mealsLoggedToday: 0,
    mealsTarget: 0,
  });
  const byKey = Object.fromEntries(m.map((x) => [x.key, x]));
  assert.equal(byKey.workout.done, true);
  assert.equal(byKey.water.done, false);
  assert.ok(byKey.water.progress > 0.7 && byKey.water.progress < 0.9);
  assert.equal(byKey.visit.done, true);
  assert.ok(!("meals" in byKey), "meal mission hidden when there is no meal target");
});

test("fitness: Mifflin-St Jeor matches the published formula", () => {
  // 10*70 + 6.25*170 - 5*25 + 5 = 1642.5 (male), -161 instead of +5 (female)
  assert.equal(bmr({ sex: "male", weightKg: 70, heightCm: 170, ageYears: 25 }), 1642.5);
  assert.equal(bmr({ sex: "female", weightKg: 70, heightCm: 170, ageYears: 25 }), 1476.5);
});

test("fitness: Epley 1RM is exact at the anchors and null past 36 reps", () => {
  assert.equal(oneRepMax(100, 1), 100);
  assert.equal(oneRepMax(100, 6), 120);
  assert.equal(oneRepMax(100, 40), null);
});

test("fitness: water target floors at 2L and adds on training days", () => {
  assert.equal(waterTargetMl(40, false), 2000); // 40*35 = 1400 -> floored
  assert.equal(waterTargetMl(80, false), 2800);
  assert.equal(waterTargetMl(80, true), 3300);
  assert.equal(waterTargetMl(null, true), 2500);
});

test("fitness: BMI and macro split sanity", () => {
  assert.equal(bmi(70, 170).toFixed(2), "24.22");
  const m = macroSplit(2000);
  assert.equal(m.protein_g, 150);
  assert.equal(m.carbs_g, 200);
  assert.equal(m.fat_g, 67);
});

test("fitness: pace formats", () => {
  assert.equal(paceMinPerKm(5, 1500), 5);
});

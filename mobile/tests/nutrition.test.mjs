import test from "node:test";
import assert from "node:assert/strict";
import { totalsOf, calorieTarget } from "../src/lib/nutrition.ts";

test("totalsOf applies servings and sums macros", () => {
  const totals = totalsOf([
    { name: "rice", servings: 2, calories: 200, protein_g: 4, carbs_g: 44, fat_g: 1, source: "manual" },
    { name: "egg", servings: 1, calories: 70, protein_g: 6, carbs_g: 1, fat_g: 5, source: "manual" },
  ]);
  assert.equal(Math.round(totals.calories), 470);
  assert.equal(Math.round(totals.protein_g), 14);
  assert.equal(Math.round(totals.carbs_g), 89);
  assert.equal(Math.round(totals.fat_g), 7);
});

test("totalsOf treats missing/negative servings as zero contribution", () => {
  const totals = totalsOf([
    { name: "ghost", servings: 0, calories: 500, protein_g: 10, carbs_g: 10, fat_g: 10, source: "ai" },
    { name: "neg", servings: -2, calories: 500, protein_g: 10, carbs_g: 10, fat_g: 10, source: "ai" },
  ]);
  assert.equal(totals.calories, 0);
});

test("calorieTarget adds the training-day nudge", () => {
  assert.equal(calorieTarget(false), 2000);
  assert.equal(calorieTarget(true), 2300);
});

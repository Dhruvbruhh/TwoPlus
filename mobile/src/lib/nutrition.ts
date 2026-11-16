import AsyncStorage from "@react-native-async-storage/async-storage";
import { dayKey } from "./format";

/**
 * Food diary. Kept on-device like the water log: meals are personal, per-tap
 * data with no reporting or CRM use, so they do not justify a server table.
 * The key holds one JSON object of `YYYY-MM-DD -> MealEntry[]`.
 *
 * AI analysis is an estimate source, never truth: every item carries `source`
 * ("ai" | "manual") and the UI must label AI numbers as estimates and let the
 * member correct them before saving.
 */

export type FoodItem = {
  name: string;
  /** Multiplier applied to the per-item nutrition numbers. Default 1. */
  servings: number;
  /** Per single serving. */
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: "ai" | "manual";
};

export type MealEntry = {
  id: string;
  /** Meal slot the member picked: breakfast, lunch, dinner, snack. */
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  items: FoodItem[];
  createdAt: number;
  photoUri?: string;
};

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

/** Summed nutrition for a set of items, servings applied. */
export function totalsOf(items: FoodItem[]) {
  return items.reduce(
    (acc, it) => {
      const n = Math.max(0, it.servings || 0);
      acc.calories += it.calories * n;
      acc.protein_g += it.protein_g * n;
      acc.carbs_g += it.carbs_g * n;
      acc.fat_g += it.fat_g * n;
      return acc;
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

/**
 * Daily calorie target. Mifflin-St Jeor needs age and sex which the member
 * profile does not carry, so this is the FDA 2,000 kcal daily-value baseline
 * with an activity nudge: training days add 300. Honest and simple; not a
 * clinical prescription.
 */
export function calorieTarget(trainedToday: boolean) {
  return trainedToday ? 2300 : 2000;
}

export async function getMeals(): Promise<Record<string, MealEntry[]>> {
  try {
    const raw = await AsyncStorage.getItem("twoplus.meals");
    return raw ? (JSON.parse(raw) as Record<string, MealEntry[]>) : {};
  } catch {
    return {};
  }
}

export async function getMealsForDay(day = dayKey()) {
  return (await getMeals())[day] ?? [];
}

export async function addMeal(entry: MealEntry, day = dayKey()) {
  const all = await getMeals();
  all[day] = [...(all[day] ?? []), entry];
  await AsyncStorage.setItem("twoplus.meals", JSON.stringify(all));
  return all[day];
}

export async function deleteMeal(id: string, day = dayKey()) {
  const all = await getMeals();
  all[day] = (all[day] ?? []).filter((m) => m.id !== id);
  await AsyncStorage.setItem("twoplus.meals", JSON.stringify(all));
  return all[day];
}

/** Patch one item inside a saved meal (servings correction after saving). */
export async function updateMealItem(
  mealId: string,
  index: number,
  next: Partial<FoodItem>,
  day = dayKey(),
) {
  const all = await getMeals();
  const meals = all[day] ?? [];
  const meal = meals.find((m) => m.id === mealId);
  if (!meal) return;
  meal.items = meal.items.map((it, i) => (i === index ? { ...it, ...next } : it));
  all[day] = meals;
  await AsyncStorage.setItem("twoplus.meals", JSON.stringify(all));
}

/**
 * Meal history, newest day first, capped so the history list stays light.
 * Days with no meals are dropped.
 */
export async function getMealHistory(limitDays = 14) {
  const all = await getMeals();
  return Object.entries(all)
    .filter(([, meals]) => meals.length > 0)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, limitDays)
    .map(([day, meals]) => ({ day, meals }));
}

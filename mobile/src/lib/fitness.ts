/**
 * Deterministic fitness math.
 *
 * Every formula here is a published, verifiable one, and every function says
 * which. The AI coach and the tools screen call these rather than asking a
 * model to do arithmetic: a language model must never be the source of a
 * member's calorie target or estimated max.
 */

export type Sex = "male" | "female" | "other";

/** Mifflin-St Jeor (1990), the equation the ADA recommends. kg, cm, years. */
export function bmr(input: { sex: Sex; weightKg: number; heightCm: number; ageYears: number }) {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears;
  if (input.sex === "male") return base + 5;
  if (input.sex === "female") return base - 161;
  // "other" takes the midpoint of the two sexed equations.
  return base - 78;
}

export const ACTIVITY_LEVELS = {
  sedentary: { label: "Mostly sitting", factor: 1.2 },
  light: { label: "1-3 days a week", factor: 1.375 },
  moderate: { label: "3-5 days a week", factor: 1.55 },
  high: { label: "6-7 days a week", factor: 1.725 },
  athlete: { label: "Twice a day", factor: 1.9 },
} as const;

export type ActivityKey = keyof typeof ACTIVITY_LEVELS;

/** TDEE: BMR times an activity factor (the Harris-Benedict multiplier table). */
export function tdee(bmrValue: number, activity: ActivityKey) {
  return bmrValue * ACTIVITY_LEVELS[activity].factor;
}

/** Body Mass Index. WHO bands live in `bmiBand`. */
export function bmi(weightKg: number, heightCm: number) {
  if (weightKg <= 0 || heightCm <= 0) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function bmiBand(value: number): { label: string; tone: "success" | "info" | "warning" | "danger" } {
  if (value < 18.5) return { label: "Underweight", tone: "info" };
  if (value < 25) return { label: "Healthy range", tone: "success" };
  if (value < 30) return { label: "Overweight", tone: "warning" };
  return { label: "Obese", tone: "danger" };
}

/**
 * Estimated one-rep max, Epley (1985). Meaningful only up to ~10 reps; past
 * 36 the formula exceeds any real max, so it returns null rather than a lie.
 */
export function oneRepMax(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps <= 0) return null;
  if (reps > 36) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Percentage of one-rep-max a given set of `reps` approximates (Epley inverse). */
export function pctOfMax(reps: number) {
  if (reps <= 0) return null;
  return 1 / (1 + reps / 30);
}

/**
 * Daily water target: 35 ml per kg, the common sports-nutrition baseline,
 * floored at 2 L and capped at 4.5 L. Training days justify the top of the
 * range; the app adds a fixed 500 ml on days with a logged workout.
 */
export function waterTargetMl(weightKg: number | null, trainedToday: boolean) {
  if (weightKg == null || weightKg <= 0) return trainedToday ? 2500 : 2000;
  const base = Math.max(2000, Math.min(4500, Math.round((weightKg * 35) / 50) * 50));
  return trainedToday ? base + 500 : base;
}

/** Macro split from calories: 30% protein, 40% carbs, 30% fat by default. */
export function macroSplit(calories: number, ratios = { protein: 0.3, carbs: 0.4, fat: 0.3 }) {
  return {
    protein_g: Math.round((calories * ratios.protein) / 4),
    carbs_g: Math.round((calories * ratios.carbs) / 4),
    fat_g: Math.round((calories * ratios.fat) / 9),
  };
}

/** Running pace, min/km, from distance (km) and duration (seconds). */
export function paceMinPerKm(distanceKm: number, durationSec: number) {
  if (distanceKm <= 0 || durationSec <= 0) return null;
  return durationSec / 60 / distanceKm;
}

/** "6.9" reads better as "6:54 /km". */
export function formatPace(minutesPerKm: number | null) {
  if (minutesPerKm == null || !Number.isFinite(minutesPerKm)) return "—";
  const m = Math.floor(minutesPerKm);
  const s = Math.round((minutesPerKm - m) * 60);
  return s === 60 ? `${m + 1}:00 /km` : `${m}:${String(s).padStart(2, "0")} /km`;
}

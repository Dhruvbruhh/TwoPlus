/**
 * XP and levels, derived from records that already exist.
 *
 * The ledger is deliberately *derived, not stored*: XP is a pure function of
 * the member's real sessions and attendance, so it can never disagree with
 * the database and cannot be farmed by re-deriving. When a server-side ledger
 * lands (planned migration 0017), these thresholds carry over unchanged and
 * the client function becomes a cache of the server's number.
 *
 * XP rules: a completed workout is worth 50, a checked-in visit 10, capped at
 * one session's and one visit's worth per calendar day so doubling up on a
 * single day is honest, not double-paid.
 */

export const LEVELS = [
  { name: "Beginner", floor: 0 },
  { name: "Rising", floor: 500 },
  { name: "Disciplined", floor: 1_500 },
  { name: "Athlete", floor: 3_500 },
  { name: "Elite", floor: 7_000 },
  { name: "Champion", floor: 12_000 },
  { name: "Legend", floor: 20_000 },
] as const;

export const XP_SESSION = 50;
export const XP_VISIT = 10;

export type Progression = {
  xp: number;
  levelIndex: number;
  levelName: string;
  /** 0..1 through the current level band. */
  levelProgress: number;
  xpToNext: number | null;
};

export function progressionFrom(input: {
  /** ISO date (YYYY-MM-DD) each completed workout landed on. */
  completedSessionDays: string[];
  /** ISO date (YYYY-MM-DD) each check-in landed on. */
  visitDays: string[];
  /** Today, so the cap logic is testable. Defaults to now. */
  today?: string;
}): Progression {
  const today = input.today ?? new Date().toISOString().slice(0, 10);

  // Union of days with at least one qualifying event, per the per-day cap.
  const days = new Set<string>([...input.completedSessionDays, ...input.visitDays]);
  let xp = 0;
  for (const day of days) {
    if (day > today) continue; // future rows (clock skew) earn nothing
    if (input.completedSessionDays.includes(day)) xp += XP_SESSION;
    else if (input.visitDays.includes(day)) xp += XP_VISIT;
  }

  let levelIndex = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].floor) levelIndex = i;
  }
  const level = LEVELS[levelIndex];
  const next = LEVELS[levelIndex + 1] ?? null;
  const span = next ? next.floor - level.floor : 1;
  const levelProgress = next ? Math.min(1, (xp - level.floor) / span) : 1;

  return {
    xp,
    levelIndex,
    levelName: level.name,
    levelProgress,
    xpToNext: next ? next.floor - xp : null,
  };
}

/**
 * Daily missions, computed from what the member actually did today. A mission
 * is a fact paired with a target, never a nag: they are optional and there is
 * no penalty for an unfinished day.
 */
export function dailyMissions(input: {
  hasPlan: boolean;
  trainedToday: boolean;
  visitedToday: boolean;
  waterMl: number;
  waterGoalMl: number;
  mealsLoggedToday: number;
  mealsTarget: number;
}) {
  const out: { key: string; label: string; done: boolean; progress: number }[] = [];
  if (input.hasPlan) {
    out.push({ key: "workout", label: "Complete today's workout", done: input.trainedToday, progress: input.trainedToday ? 1 : 0 });
  }
  out.push({
    key: "water",
    label: "Reach your water goal",
    done: input.waterMl >= input.waterGoalMl,
    progress: input.waterGoalMl > 0 ? Math.min(1, input.waterMl / input.waterGoalMl) : 0,
  });
  if (input.mealsTarget > 0) {
    out.push({
      key: "meals",
      label: "Log your meals",
      done: input.mealsLoggedToday >= input.mealsTarget,
      progress: Math.min(1, input.mealsLoggedToday / input.mealsTarget),
    });
  }
  out.push({
    key: "visit",
    label: "Check in at the gym",
    done: input.visitedToday,
    progress: input.visitedToday ? 1 : 0,
  });
  return out;
}

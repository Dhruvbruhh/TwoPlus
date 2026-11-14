/**
 * Deterministic coach insights.
 *
 * Rules over the member's real records, in the spirit of the rest of this
 * app: a rule fires only when its data supports it, and says so when it
 * does not. No language model, no invented encouragement.
 */

export type Insight = { icon: "trending-down" | "trending-up" | "flame" | "calendar" | "barbell"; text: string };

export function coachInsights(input: {
  weightSeries: { measured_on: string; weight_kg: number | null }[];
  completedSessionDays: string[];
  streak: number;
  hasPlan: boolean;
}): Insight[] {
  const out: Insight[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // Weight trend: needs two points and at least half a kilo to be a trend,
  // not scale noise.
  const withWeight = input.weightSeries.filter((m) => m.weight_kg != null);
  if (withWeight.length >= 2) {
    const newest = Number(withWeight[0].weight_kg);
    const oldest = Number(withWeight[withWeight.length - 1].weight_kg);
    const delta = newest - oldest;
    if (Math.abs(delta) >= 0.5) {
      const days = Math.max(
        1,
        Math.round(
          (new Date(withWeight[0].measured_on).getTime() -
            new Date(withWeight[withWeight.length - 1].measured_on).getTime()) /
            86_400_000,
        ),
      );
      out.push({
        icon: delta < 0 ? "trending-down" : "trending-up",
        text: `Weight ${delta < 0 ? "down" : "up"} ${Math.abs(delta).toFixed(1)} kg over ${days} days`,
      });
    }
  }

  // Training frequency: the last full week, ending yesterday, so the count
  // is not dominated by whatever day it happens to be.
  const weekStart = new Date(new Date(today).getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
  const sessionsThisWeek = input.completedSessionDays.filter((d) => d >= weekStart && d <= today).length;
  if (sessionsThisWeek >= 3) {
    out.push({ icon: "calendar", text: `${sessionsThisWeek} sessions in the last 7 days` });
  } else if (sessionsThisWeek === 0 && (input.hasPlan || input.completedSessionDays.length > 0)) {
    // Only a nudge for someone already training: a brand-new member with no
    // plan and no history gets silence, not a scolding.
    out.push({ icon: "barbell", text: "No sessions logged this week yet" });
  }

  // Streak, but only when it is worth mentioning.
  if (input.streak >= 3) {
    out.push({ icon: "flame", text: `${input.streak}-day gym streak` });
  }

  return out.slice(0, 3);
}

/**
 * Meal photo analysis.
 *
 * Unavailable in this build, on purpose: inference must run behind an
 * authenticated backend function (spend limits, consent, no model key in the
 * app bundle). Until that exists the scanner says so and the member logs the
 * meal manually; no numbers are ever invented.
 */

export type AiItem = {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type AiAnalysis = { available: false } | { available: true; items: AiItem[] };

export const aiConfigured = false;

export async function analyzeMealPhoto(_imageUri: string): Promise<AiAnalysis> {
  return { available: false };
}

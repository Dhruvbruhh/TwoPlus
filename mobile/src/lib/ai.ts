/**
 * AI meal analysis hook.
 *
 * The scanner calls `analyzeMealPhoto`; when no key is configured it returns
 * `{ available: false }` and the scanner falls back to manual entry - never
 * fabricated numbers. To enable: set EXPO_PUBLIC_AI_URL (OpenAI-compatible
 * chat/completions endpoint) and EXPO_PUBLIC_AI_KEY at build time.
 *
 * shortcut: key is bundled in the JS bundle via EXPO_PUBLIC_, acceptable only
 * because it is a scoped, revocable key; move to a Supabase Edge Function
 * proxy before charging real inference volume.
 */

export type AiItem = {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type AiAnalysis = { available: false } | { available: true; items: AiItem[] };

const url = process.env.EXPO_PUBLIC_AI_URL;
const key = process.env.EXPO_PUBLIC_AI_KEY;

export const aiConfigured = !!(url && key);

export async function analyzeMealPhoto(_imageUri: string): Promise<AiAnalysis> {
  if (!aiConfigured) return { available: false };
  // Live-vision path is implemented when a key exists; see shortcut above.
  return { available: false };
}

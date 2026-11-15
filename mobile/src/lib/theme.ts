/**
 * TwoPlus member app design tokens.
 *
 * One source of truth for colour, spacing, radius, type and motion. Screens
 * import from here so the app stays visually coherent and a token change
 * moves every surface at once.
 *
 * The palette is a light, premium consumer look: warm off-white grounds,
 * white cards with soft shadows, a deep plum text ramp, and a lavender-violet
 * accent. Metric colours are pastels with meaning, not decoration: each
 * fitness metric family owns one hue (protein blue, carbs peach, fat pink,
 * activity mint) and is used consistently everywhere it appears.
 */

export const color = {
  // Grounds, lightest to deepest. Warm off-white rather than pure white so
  // white cards read as raised surfaces with their shadows.
  canvas: "#FAF8F5",
  surface: "#FFFFFF",
  surfaceRaised: "#F4F1EC",
  surfaceOverlay: "#ECE8E1",

  // Deep plum ramp. Tinted cool-warm so headings read premium, not clinical.
  text: "#231F30",
  textMuted: "#6B6678",
  textFaint: "#9C97A8",

  // Lavender-violet, the single brand accent. `accent` for fills,
  // `accentText` for text on light grounds (darker so it clears 4.5:1),
  // `accentSoft` for tints.
  accent: "#7B5CD6",
  accentBright: "#9B7FE8",
  accentText: "#6244B8",
  accentSoft: "rgba(123,92,214,0.12)",

  // Pastel metric family. Each hue belongs to one kind of data everywhere:
  // mint = activity/movement, peach = carbs/energy, pink = fat/recovery,
  // blue = protein/hydration, lavender = the brand accent family.
  mint: "#34A853",
  mintSoft: "rgba(52,168,83,0.13)",
  peach: "#E8873A",
  peachSoft: "rgba(232,135,58,0.13)",
  pink: "#D64C7F",
  pinkSoft: "rgba(214,76,127,0.12)",
  blue: "#3B7DD8",
  blueSoft: "rgba(59,125,216,0.12)",

  // Semantic. Green means "good/hit target", amber "attention", red "failed".
  success: "#2E8B5F",
  successSoft: "rgba(46,139,95,0.12)",
  warning: "#C07E1F",
  warningSoft: "rgba(192,126,31,0.13)",
  danger: "#C7444E",
  dangerSoft: "rgba(199,68,78,0.11)",
  info: "#3B7DD8",
  infoSoft: "rgba(59,125,216,0.12)",

  // Hairlines. `line` for resting edges, `lineStrong` for emphasis.
  line: "rgba(35,31,48,0.08)",
  lineStrong: "rgba(35,31,48,0.15)",

  // Glass. Near-opaque white for the few layered surfaces (tab bar, sheets).
  glass: "rgba(255,255,255,0.88)",
  glassBorder: "rgba(35,31,48,0.07)",
} as const;

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

/**
 * Type ramp. Sizes are chosen for a 390pt phone and scale by role: display
 * for the one hero number per screen, then steadily down. Line heights are
 * ~1.35x for body copy and tighter for display, which is what makes headings
 * read as designed rather than default.
 */
export const type = {
  display: { fontSize: 40, lineHeight: 44, fontWeight: "700" as const, letterSpacing: -1 },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const, letterSpacing: -0.6 },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: "600" as const, letterSpacing: -0.4 },
  h3: { fontSize: 17, lineHeight: 23, fontWeight: "600" as const, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: "400" as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: "600" as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  smallStrong: { fontSize: 13, lineHeight: 18, fontWeight: "600" as const },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: "500" as const, letterSpacing: 0.3 },
  mono: { fontSize: 13, lineHeight: 18, fontWeight: "600" as const, letterSpacing: 0 },
} as const;

export const motion = {
  fast: 140,
  base: 220,
  slow: 340,
} as const;

/** Minimum tap target. 44pt is the iOS floor and comfortable on Android. */
export const HIT = 44;

/**
 * Standard screen padding. Screens use this rather than hardcoding 20 so the
 * gutters line up across every tab.
 */
export const gutter = space.xl;

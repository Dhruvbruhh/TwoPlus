/**
 * TwoPlus member app design tokens.
 *
 * One source of truth for colour, spacing, radius, type and motion. Screens
 * import from here so the app stays visually coherent and a token change
 * moves every surface at once.
 *
 * The palette is the CRM's dark glass (src/index.css): translucent white
 * panels over the gym photograph, bright hairlines, white as the one accent.
 * Metric colours keep their meaning: each fitness family owns one hue
 * (protein blue, carbs peach, fat pink, activity mint).
 */

export const color = {
  // `canvas` sits behind the photo. The surface steps are glass, so use
  // `surfaceSolid` wherever content scrolls underneath (sheets, overlays).
  canvas: "#0B1012",
  surface: "rgba(255,255,255,0.075)",
  surfaceRaised: "rgba(255,255,255,0.11)",
  surfaceOverlay: "rgba(255,255,255,0.16)",
  surfaceSolid: "#151C20",
  scrim: "rgba(0,0,0,0.52)",
  sheetScrim: "rgba(0,0,0,0.6)",
  highlight: "inset 0 1px 0 rgba(255,255,255,0.16)",
  // CRM --card-shadow + --inset-hi: the lift that makes a panel read as glass.
  depth: "0 18px 44px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.16)",
  // CRM --field: inputs and quiet controls sit one step lighter than cards.
  field: "rgba(255,255,255,0.08)",
  // CRM --hero-band: solid ink behind headline figures.
  ink: "#101214",

  text: "#F2F5F5",
  textMuted: "#B9C3C7",
  textFaint: "#ADB8BC",

  // White, as in the CRM. `onAccent` is the ink on a filled accent.
  accent: "#FFFFFF",
  accentBright: "#FFFFFF",
  accentText: "#FFFFFF",
  accentSoft: "rgba(255,255,255,0.14)",
  onAccent: "#0B0F11",

  // Metric family, lifted so each clears contrast on dark glass.
  mint: "#6FCF9B",
  mintSoft: "rgba(111,207,155,0.16)",
  peach: "#F2A76B",
  peachSoft: "rgba(242,167,107,0.16)",
  pink: "#F08DB2",
  pinkSoft: "rgba(240,141,178,0.16)",
  blue: "#7FB2F0",
  blueSoft: "rgba(127,178,240,0.16)",

  success: "#6FCF9B",
  successSoft: "rgba(111,207,155,0.16)",
  warning: "#E0B169",
  warningSoft: "rgba(224,177,105,0.16)",
  danger: "#F09284",
  dangerSoft: "rgba(240,146,132,0.16)",
  info: "#7FB2F0",
  infoSoft: "rgba(127,178,240,0.16)",

  line: "rgba(255,255,255,0.1)",
  lineStrong: "rgba(255,255,255,0.18)",

  // Tab bar and login card tint. No live blur on Android, so it stays dark enough to read text scrolling under it.
  glass: "rgba(18,20,23,0.92)",
  glassBorder: "rgba(255,255,255,0.18)",
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
  lg: 24,
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
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" as const, letterSpacing: 0 },
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

/**
 * Liquid glass, drawn with styles. Android has no live backdrop blur here, so
 * each pane is a translucent tint over the already-blurred photo, plus a
 * diagonal sheen, a bright top rim (the light catching the edge) and a soft
 * drop. Every glass surface uses one of these four weights.
 */
const rim = "inset 0 1px 0.5px rgba(255,255,255,0.42), inset 0 -1px 0.5px rgba(255,255,255,0.08)";
const sheen =
  "linear-gradient(155deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 38%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.07) 100%)";

export const glass = {
  // Cards, bands, empty states.
  pane: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundImage: sheen,
    boxShadow: `0 10px 30px rgba(0,0,0,0.28), ${rim}`,
  },
  // Buttons, chips, segments: a brighter, smaller piece of glass.
  control: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.03) 100%)",
    boxShadow: `0 4px 14px rgba(0,0,0,0.22), ${rim}`,
  },
  // The floating tab bar and the login card: darker tint, deeper shadow.
  bar: {
    backgroundColor: color.glass,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundImage: sheen,
    boxShadow: `0 14px 40px rgba(0,0,0,0.45), ${rim}`,
  },
  // Text fields: recessed into the glass rather than raised.
  well: {
    backgroundColor: "rgba(0,0,0,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    boxShadow: "inset 0 1px 3px rgba(0,0,0,0.35)",
  },
} as const;

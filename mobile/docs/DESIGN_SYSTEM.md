# TwoPlus.fit mobile design system

The binding spec for the member app. Tokens live in `src/lib/theme.ts`,
primitives in `src/components/ui.tsx`; this document says how to use them and
what review enforces. Direction: clean, colorful, premium consumer fitness —
one burgundy accent carrying action, warm bone text on near-black grounds.

## Color tokens (`theme.color`)

| Role | Token | Rule |
|---|---|---|
| Grounds | `canvas / surface / surfaceRaised / surfaceOverlay` | Never pure black. One canvas per screen; cards on `surface`. |
| Text | `text / textMuted / textFaint` | Body on `text`, metadata on `textMuted`, `textFaint` only for non-essential labels. |
| Accent | `accent / accentBright / accentText / accentSoft` | Burgundy is the ONLY brand color. Fills use `accent`, text-on-dark uses `accentText` (4.5:1), tints use `accentSoft`. |
| Semantic | `success / warning / danger / info` (+ `*Soft`) | Green = target hit, amber = attention, red = failed. Never reuse accent for success/failure. |
| Lines | `line / lineStrong` | Hairline borders; `lineStrong` only for emphasized edges. |
| Glass | `glass / glassBorder` | Tab bar + sheet headers ONLY (antislop R-10 cap). Never on cards. |

Forbidden: blue-purple gradients, glow on multiple elements, rainbow chips,
color picked outside this table. New colors need a reason written here first.

## Typography (`theme.type`, applied via `<T variant=…>`)

- Font: Inter (400/500/600/700 via expo-font). Never set `fontWeight` directly —
  use the family map in `ui.tsx` (Android resolves the pair inconsistently).
- Ramp: `display` 40 (one hero number per screen max) → `h1` 28 → `h2` 22 →
  `h3` 17 → `body` 15 → `small` 13 → `caption` 11.
- Body text minimum 13; captions are labels, never paragraphs.
- All text renders through `<T>`; raw `Text` only inside primitives.

## Spacing & layout

- Scale (`theme.space`): 2/4/8/12/16/20/24/32/40. Screens use `gutter` (20) and
  the `Screen` primitive; no hardcoded padding.
- Section rhythm: `gap: space.lg` between blocks (default in `Screen`).
- Tap targets: minimum `HIT` (44). `hitSlop` for small icon buttons.
- One hero element per screen (the day's workout, the run distance, the level
  ring) — everything else supports it.

## Radii, elevation, motion

- Radii: cards 16 (`radius.lg`), buttons 12 (`radius.md`), chips/pills 999.
  A radius is a category marker, not decoration — do not mix freely.
- Elevation: everything sits flat except the floating tab bar and modals.
  Android: `elevation 0` except真 overlays; iOS shadow only on the tab bar.
- Motion (`theme.motion`): fast 140ms (press states), base 220ms (sheet/screen
  transitions), slow 340ms (celebration/progress). Meaning-bearing only —
  no looping decoration. Use `react-native-reanimated`, never timers.

## Components (in `ui.tsx` — extend, don't fork)

- Buttons: `primary` (accent fill, one per view), `secondary` (raised), `ghost`,
  `danger`. Height 52 (44 compact). Loading state swaps content for a spinner.
- Cards: `surface` + hairline border; pressable cards dim to 0.82 with ripple.
- Chips for status; never for actions.
- `Stat` for label+value pairs; `display` variant reserved for the hero number.
- Empty states: icon + one sentence + action. Never blank, never fake data.
- Loading: `Skeleton` blocks shaped like the real content.
- Icons: Ionicons only. Emoji are not icons.

## Platform rules

- Navigation: floating glass tab bar, max 5 destinations. Safe-area edges via
  `Screen`/`useSafeAreaInsets`; content never hides behind the bar (`tabBarSpace`).
- Android: ripple feedback, `elevation 0` on bars. iOS: shadows on lifted chrome.
- Back behavior must be predictable: stack screens push via expo-router; modals
  use bottom sheets with a drag handle.

## Accessibility floor

- Contrast ≥ 4.5:1 for text (`accentText`, not `accent`, on dark).
- Every pressable has `accessibilityRole` (+ label when icon-only).
- Progress bars expose `accessibilityValue`.
- Touch targets ≥ 44; spacing between targets ≥ 8.

## Review loop (every screen, after implementing)

1. Run Expo web preview (`npx expo start --web`), screenshot with Playwright
   at 390×844 (standard), 320×700-class small, 430×932 large.
2. Impeccable-style critique: hierarchy, one-hero rule, spacing rhythm,
   contrast, tap targets, empty/loading/error states.
3. Antislop gate: no gradient defaults, glass cap, no repeated identical card
   grids, no meaningless stats, no dead buttons.
4. Fix and re-shoot until it passes. The APK is the final fidelity check.

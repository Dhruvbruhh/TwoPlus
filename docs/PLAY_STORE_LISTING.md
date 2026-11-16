# Play Store listing draft (fill in Console)

## App identity
- Name: TwoPlus
- Package: fit.twoplus.member
- Category: Health & Fitness
- Short description (≤80 chars): Workouts, runs, water, weight and coach insights in one gym app.

## Full description
TwoPlus keeps your training on track:
- Guided workouts with real exercise tracking
- GPS run tracking saved straight to your history
- Daily water and weight check-ins
- Coach insights generated from your own records
- Works offline, syncs when you are back

Privacy: your data stays in your account. No ads, no data selling.

## Assets
- App icon 512x512 PNG: **done** — `node scripts/make-listing-icon.mjs`
  downscales the member app's real icon (`mobile/assets/icon.png`) to
  `release/store/listing-icon-512x512.png` via the same Playwright-Chromium
  tooling as the feature graphic
- Feature graphic 1024x500: **done** — `brand/feature-graphic.svg` is the
  maintainable source (colours and the disc + H mark measured from the app's
  real icon); `node scripts/make-feature-graphic.mjs` exports
  `release/store/feature-graphic-1024x500.png`
- Phone screenshots (1080x1920): **pending owner login** —
  `node scripts/storeshots.mjs` captures them, but it needs `SHOT_EMAIL` and
  `SHOT_PASS` set (a sign-in linked to a member record). Neither is configured
  on this machine yet. Tablet set (1600x2560) and App Store sets come from the
  same script once the login works.
- Privacy policy URL (required by Google for all apps): **pending — owner must
  provide; no URL chosen or published yet**

## Console fields still to decide (owner)
- Contact email / phone / website for the store listing
- Whether to declare data deletion in the Data safety form now that the app
  has in-account deletion (the RPC must be live first: see
  `docs/MIGRATION-CHECKLIST.md`)

## Upload
- File: app-release.aab (built via `gradlew bundleRelease`)
- First release: use closed testing track, add yourself as tester
- Signing: Google Play App Signing — upload the key from D:\TwoPlus\keys\twoplus-release.jks when asked, KEEP THIS FILE SAFE; losing it means a new app identity

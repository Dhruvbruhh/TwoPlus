# Store readiness

What is ready for the Play Store and the App Store, what is not, and the exact
answers the listing forms need. Everything here was checked against the repo, not
remembered.

**Two apps ship from this repo.** Do not mix them in a listing:

| | Owner web shell | Member app |
| --- | --- | --- |
| App id | `fit.twoplus.app` | `fit.twoplus.member` |
| Stack | Capacitor wrapper around `dist/` | Expo / React Native (`mobile/`) |
| Audience | the gym owner, at the desk | the gym's members, in the gym |
| Android permission footprint | `INTERNET` only | camera, location, activity recognition, images (see below) |
| Signed Android artifacts | `release/mobile/TwoPlus-1.0-android.{apk,aab}` | `D:\TwoPlus\twoplus-member-release.{apk,aab}` (outside the repo) |

The Play Store listing this document targets for members is the **member app**.
The shell can ship later under the same developer account with its own (much
simpler) listing. `docs/BUILDING.md` documents both build recipes.

Status legend: **ready** (done and verified here), **prepared** (text or config
exists, the human action remains), **blocked** (needs credentials or an account
that does not exist).

## Owner web shell identity

| Item | Value | Where |
| --- | --- | --- |
| App id | `fit.twoplus.app` | `capacitor.config.ts`, `android/app/build.gradle` (`applicationId`), `ios/App/App.xcodeproj` (`PRODUCT_BUNDLE_IDENTIFIER`) |
| Display name | TwoPlus | `android/app/src/main/res/values/strings.xml`, `CFBundleDisplayName` |
| Version | `1.0.0` in `package.json`; Android `versionCode 1` / `versionName "1.0.0"`; iOS `CURRENT_PROJECT_VERSION 1` / `MARKETING_VERSION "1.0.0"` | - |
| Icon 1024 px | present | `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024x1024), Android mipmaps present |
| Web assets | `dist/` synced into both native projects by `npx cap sync` | `.github/workflows/android.yml`, `ios.yml` |

**Version numbering at submission:** all three now say `1.0.0`. Stores compare
the native values, so bump them together when you cut a release, and raise
`versionCode` / `CURRENT_PROJECT_VERSION` by one on every upload.

## Member app identity and permissions

Verified 2026-11-16 against `mobile/app.json`, the merged release manifest, and
`aapt2 dump badging` on the built APK:

| Item | Value | Source |
| --- | --- | --- |
| App id | `fit.twoplus.member` | `mobile/app.json` (`android.package`, `ios.bundleIdentifier`) |
| Version | `1.0.0`, `versionCode 1` | `mobile/app.json`; confirmed in the built APK |
| SDK range | minSdk 24, targetSdk 36 | `aapt2 dump badging` on the built APK |
| Sign-in | email/password + Google (Supabase OAuth, PKCE, `twoplus://` deep link) | `mobile/src/lib/auth.tsx`, manifest intent filter |
| Store presence | NOT yet in any Play Console; no listing record exists | owner |

Android permissions in the **built release APK** (merged manifest, not just the
five requested in `app.json`):

- Declared by the app: `CAMERA` (food scanner), `ACCESS_COARSE_LOCATION` +
  `ACCESS_FINE_LOCATION` (run tracking), `ACTIVITY_RECOGNITION` (step counting),
  `READ_MEDIA_IMAGES` (photo library pick), `INTERNET`.
- Added by Expo prebuild defaults: `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`,
  `VIBRATE`, `READ_EXTERNAL_STORAGE` (≤ SDK 32), `WRITE_EXTERNAL_STORAGE` (≤ SDK 32).

**Owner decision before submission:** the merged manifest asks for more than the
product uses. `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` in particular will draw
review questions and are not used by any feature. Trim them (via
`expo.android.blockedPermissions` in `mobile/app.json`, then prebuild + rebuild)
or prepare a justification for the Data Safety form. Data Safety answers must
match the **manifest**, not the intent.

iOS (`mobile/app.json` `ios.infoPlist`): location-when-in-use, camera, photo
library, and motion usage descriptions are present. No iOS build has been
produced yet (needs macOS/Xcode); the keys were written, not verified on a build.

## Permissions and declarations (owner web shell)

Verified in this repo:

- **Android permissions:** exactly one, `android.permission.INTERNET`. No camera,
  location, microphone, contacts, storage, or notification permission is
  declared.
- **iOS:** no `NS*UsageDescription` key is present. The app does not request
  camera, location, microphone, or tracking access.
- **Tracking:** no analytics, crash-reporting, attribution, or advertising SDK is
  in `dependencies`. Nothing links an advertising identifier.
- **Progress photos:** chosen through the system file picker
  (`<input type="file" accept="image/*">` in `src/pages/member-extras.tsx`), then
  uploaded to Supabase Storage into a private bucket. They are not read from the
  photo library in place.

**Gap to check at review time:** if App Store review decides that selecting a
photo through the web file input counts as photo-library access, iOS needs
`NSPhotoLibraryUsageDescription` in `Info.plist`. It is absent today because the
picker is the system one and the app never enumerates the library. Add the key
with a plain explanation if a build is rejected for it, rather than guessing now.

## Data safety / privacy nutrition label

These are the real answers for the **owner web shell**, derived from the schema
(`supabase/migrations/`) and `src/lib/member-api.ts`. The member app's form needs
its own pass (see the placeholders section): it adds location from run tracking,
camera/photo inputs from the scanner, and on-device meal logs, each of which
changes the collected/linked answers.

| Category | Collected | Purpose | Linked to identity | Optional |
| --- | --- | --- | --- | --- |
| Email address | yes (staff and member accounts) | account, sign-in | yes | no |
| Name | yes | member record, receipts | yes | no |
| Phone number | yes | member record, contact | yes | no |
| Date of birth | yes, nullable | member record | yes | yes |
| Gender | yes, nullable | member record | yes | yes |
| Address | yes, nullable | member record | yes | yes |
| Emergency contact name and phone | yes, nullable | safety | yes | yes |
| Photos | progress photos, optional | fitness tracking | yes | yes |
| Body measurements | optional | fitness tracking | yes | yes |
| Payment records | yes (amounts recorded by gym staff; no card data) | billing history | yes | no |
| Health and fitness data | workout logs, diet plans, measurements | the product itself | yes | yes |

Not collected: location, contacts, browsing history, advertising identifier,
device fingerprint. Nothing is used for tracking across apps or websites, so the
"used to track you" answer is **no**. Data is encrypted in transit (HTTPS only;
the Android shell blocks mixed content). There is no data broker or ad network.

Deletion: a member can request deletion in the app (Phase 18 flow); the gym owner
or the operator actions it. Account deletion removes the auth account and the
member record, subject to the retention notes in `docs/PRIVACY-AND-RETENTION.md`.

## Assets

| Asset | Status | Note |
| --- | --- | --- |
| App icon 1024 | ready | same mark as the desktop ICO, generated from `public/favicon.svg` (shell). The member app's icon comes from `mobile/assets/` — confirm which listing gets which |
| Feature graphic (1024x500) | blocked | not produced; needs a design decision |
| Owner-workspace screenshots | prepared | `screenshots/board-390-*.png` are real captures at 390x844 of the workspace. Play Store needs a phone set and a separate tablet set; App Store needs 1290x2796 and 1242x2688 |
| Member-app screenshots | blocked | `scripts/storeshots.mjs` captures the **web dashboard's `/member` view**, not the Expo member app — usable only if the shell's member view is ever listed. Real member-app listing screenshots must come from the Expo app (device/emulator captures, or Playwright against the Metro web build at 1080x1920 / 1600x2560 / 1290x2796 / 1242x2688). None exist yet |
| Store description | prepared (shell only) | the draft below is written for the **owner workspace** listing. A member-app listing needs its own copy — `docs/PLAY_STORE_LISTING.md` may hold owner drafts |
| Privacy policy URL | prepared | `/privacy` exists in the app; a public URL is required and the copy still needs counsel review |

Draft short description (80 characters, Play Store limit):

> Run your gym: members, plans, payments, attendance, and a member app.

Draft full description:

> TwoPlus is the workspace a gym runs on. Keep every member and their plan in one
> place, record payments and dues, check people in at the door, schedule classes
> and trainers, log workouts and measurements, and give members their own app for
> their plan, their training history and their progress.
>
> Built for one gym or many. Each gym's data is isolated in the database, not just
> in the interface.

## Submission checklist

Ready:

- [x] App id, name, icon, and version consistent across web, Android, and iOS
- [x] Minimum permissions (internet only)
- [x] No tracking SDKs, so the tracking declaration is a clean "no"
- [x] Data-safety answers derived from the actual schema
- [x] CI builds an APK and an iOS simulator build on every push, so a native
      regression is caught before submission
- [x] Host builds a signed Android APK and AAB from a keystore kept outside the
      repo (`android/keystore.properties`, gitignored). Both artifacts sit in
      `release/mobile/` with checksums; certificate `CN=TwoPlus`

Prepared, human action required:

- [ ] Add the existing keystore and its passwords to the repository secrets
      (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) and
      switch the Gradle job from `assembleDebug` to `bundleRelease`, so CI
      publishes the same signed build this host produces
- [ ] Apple Developer Program membership, distribution certificate, provisioning
      profile, and an archive uploaded through Xcode or Transporter
- [ ] Run `node scripts/storeshots.mjs` against a login linked to a member
      record, then capture the tablet set of the workspace
- [ ] Produce a 1024x500 feature graphic
- [ ] Publish the privacy policy at a stable public URL and put it in both
      listings
- [ ] Create the Play Console and App Store Connect records

Blocked, and why:

- **Store accounts** do not exist. Creating them costs money and binds the owner
  legally, so it is not something this repo can or should do.
- **The Android signing key** exists but lives outside the repo
  (`D:\TwoPlus\keys\twoplus-release.jks`) and must stay out of git. Its passwords
  are held by the owner, so only this host can produce a signed build until they
  are added to CI secrets.
- **Submission itself** needs the owner's explicit authorization. Publishing
  under someone else's developer account is an agreement, not a build step.

## What this phase did not do

A signed Android APK and AAB were produced here and no store has accepted either.
JDK 21 and Android SDK 36 built them from the project keystore:

**Owner web shell** (`release/mobile/`, recorded at build time):

| Artifact | Path | Size | SHA-256 |
| --- | --- | --- | --- |
| APK | `release/mobile/TwoPlus-1.0-android.apk` | 3,994,559 B | `F708EB2F…20B9981` |
| AAB | `release/mobile/TwoPlus-1.0-android.aab` | 3,852,217 B | `A48198B4…D749F17` |

`apksigner verify --print-certs` reports signer `CN=TwoPlus, O=TwoPlus, C=IN`
(fingerprint `4e:08:dc:00:…:d7`); `aapt2 dump badging` reports `fit.twoplus.app`,
versionCode 1, versionName `1.0.0`, minSdk 24, targetSdk 36, `INTERNET` as the only
permission. Nothing
was installed on a physical device: `adb devices` is empty, so the APK is verified
as a signed package, not as a working install.

**Member app** (built 2026-11-16 from `mobile/`, artifacts outside the repo):

| Artifact | Path | Size | SHA-256 |
| --- | --- | --- | --- |
| APK | `D:\TwoPlus\twoplus-member-release.apk` | 110,754,685 B | `EF768EF4274FA1D2E2EDA267C943B92F45981F729FD865B085EB0CA25B1CF56A` |
| AAB | `D:\TwoPlus\twoplus-member-release.aab` | 75,724,780 B | `91C07B47E0FD54B2704A523912EC0DDE9A45420A15E5193FFA7F94D6A0165755` |

Same keystore family: APK verified with `apksigner` (v2 scheme), AAB with
`jarsigner`/`keytool` (v1/JAR is the correct scheme for bundles); signer
`CN=TwoPlus, OU=Mobile, O=TwoPlus, C=IN`, SHA-256 `4ea08dc0…eed7`. `aapt2 dump
badging` reports `fit.twoplus.member`, versionCode 1, versionName `1.0.0`,
minSdk 24, targetSdk 36, and the permission set listed above. Neither artifact
was installed on a device or uploaded anywhere.

Remaining gaps: an IPA for either app needs macOS with Xcode, and both listings
need the Play Console and App Store Connect records plus the owner's
authorization to submit. `docs/BUILDING.md` records the exact commands for both
apps, including what `expo prebuild` overwrites on every run.

## Owner review placeholders

These sections are deliberately **not filled in**: they are legal/policy claims
about a product operated by the owner, and guessing them would put wrong
statements into a store listing. Each needs the owner's answer before submission.

- [ ] **Play Store listing text** for the member app: title, short description,
      full description, screenshots of the *member* app (the captures in
      `screenshots/board-390-*` show the owner workspace, not this app),
      feature graphic. `docs/PLAY_STORE_LISTING.md` may hold owner drafts.
- [ ] **Data Safety form** for the member app: the shell's answers in the table
      above are a starting point, but the member app adds location (run
      tracking), camera/photos (scanner, progress photos), and on-device meal
      logs — each changes the "collected / linked / ephemeral" answers, and the
      form must match the manifest permission list.
- [ ] **Privacy policy and legal claims**: the member app's privacy copy must
      describe on-device nutrition data and Google sign-in; counsel review is
      still owed for both listings.
- [ ] **Play Console checks**: create the app record, complete the content
      rating questionnaire, declare the ads/no-ads status, set up the testing
      track, and decide whether the location permission triggers a permissions
      declaration video.
- [ ] **Apple side**: every iOS statement here describes config files only; no
      iOS build or review readiness exists yet.

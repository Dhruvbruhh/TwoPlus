# Building TwoPlus

Three surfaces ship from one codebase: the browser app, an Android shell, and an
iOS shell. The last two are Capacitor wrappers around the same `dist/` bundle, so
there is no second implementation to keep in sync.

A separate native member app lives in `mobile/` (Expo / React Native). It has its
own build recipe below.

## Web

```bash
npm ci
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build -> dist/
npm run preview  # serves dist/ locally
```

`npm run build` is the gate that matters: it type-checks the whole project before
Vite touches it, so a broken type never reaches `dist/`.

## Android

Requires JDK 21 and the Android SDK (set `ANDROID_HOME`). Neither ships with a plain
Windows dev box, so install both first; CI does this automatically.

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/`. This sequence was executed
on Windows with JDK 21 (Adoptium 21.0.13.9) and Android SDK 36 / build-tools 36.0.0,
and produced a 5,038,783-byte debug APK. `android/local.properties` holds the SDK
path and is gitignored.

**Release build.** A keystore exists for this project and lives *outside* the repo,
at `D:\TwoPlus\keys\twoplus-release.jks` (alias `twoplus`, RSA 4096, CN=TwoPlus).
Its password is not written down anywhere in the repository, by design. Losing it
means the Play Console can never accept an update under the same app id, so back it
up somewhere durable before the first upload.

`android/keystore.properties` points Gradle at it and is gitignored:

```properties
storeFile=D:/TwoPlus/keys/twoplus-release.jks
storePassword=…
keyAlias=twoplus
keyPassword=…
```

`android/app/build.gradle` reads that file only if it exists, so a clone without it
still assembles, just unsigned. With it present:

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleRelease   # -> app/build/outputs/apk/release/app-release.apk
./gradlew bundleRelease     # -> app/build/outputs/bundle/release/app-release.aab
```

Both were run on this host (JDK 21, Android SDK 36): APK 3,994,559 bytes, AAB
3,852,217 bytes, certificate `CN=TwoPlus`, package `fit.twoplus.app`, versionCode 1,
versionName `1.0.0`, targetSdk 36, `INTERNET` as the only permission. Copies sit in
`release/mobile/`.
`apksigner verify --print-certs` needs `JAVA_HOME` on `PATH` or it fails with
"JAVA_HOME is not set".

CI (`.github/workflows/android.yml`) still produces an unsigned debug APK on every
push, because the keystore is not in the repository and should not be. To have CI
sign, add the keystore and its passwords as repository secrets and switch the job to
`bundleRelease`; that is a publishing decision, not a build step.

## Native member app (mobile/, Expo)

The member phone app is a separate Expo/React Native project in `mobile/` with its
own package.json, its own Supabase anon key usage, and app id `fit.twoplus.member`.
It is NOT a Capacitor wrapper and does not use `dist/`.

Release builds were produced on this host (2026-11-16, Expo SDK 58 / RN 0.88.1):

```bash
cd mobile
npm install
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleRelease   # -> app/build/outputs/apk/release/app-release.apk
./gradlew bundleRelease     # -> app/build/outputs/bundle/release/app-release.aab
```

Signing mirrors the shell: `mobile/android/keystore.properties` (gitignored) points
at the same `D:\TwoPlus\keys\twoplus-release.jks`. `mobile/android/app/build.gradle`
falls back to the debug keystore when the file is absent, so a clone still builds.

Three things `expo prebuild` wipes on every run and must be re-applied to
`mobile/android/app/build.gradle` (and friends) afterwards:

1. **Release signing block.** Prebuild emits debug-only `signingConfigs`. Re-add
   the `keystore.properties` loader and a `release` signing config, and point
   `buildTypes.release` at it.
2. **Windows MAX_PATH fix.** Ninja object paths under the default `app/.cxx`
   staging dir exceed Windows' 260-char limit. Re-add to the end of the
   `android { }` block (prebuild emits no `externalNativeBuild` section at all):
   `externalNativeBuild { cmake { buildStagingDirectory = file("C:/cxx") } }`
   Without it, `assembleRelease` fails at `ninja: error: mkdir ...` on a long
   codegen path. Also delete any stale `app/.cxx` directory after re-applying.
3. **`local.properties`** (`sdk.dir=…`) is gitignored; copy it back or set
   `ANDROID_HOME`.

shortcut: `mobile/android/` is fully gitignored (0 tracked files), so these
patches live only on the build machine. If a second build machine appears, move
the signing + staging fixes into a committed prebuild patch script first.

Artifacts from the 2026-11-16 build (outside the repo): APK 110,754,685 bytes and
AAB 75,724,780 bytes, both `fit.twoplus.member` versionCode 1 / versionName 1.0.0,
signed v2 (APK) and v1/JAR (AAB, the correct scheme for bundles) with certificate
`CN=TwoPlus, OU=Mobile, O=TwoPlus, C=IN`. The AAB declares camera, location, and
photo-library permissions plus Google sign-in — the store declarations in
`STORE-READINESS.md` describe the Capacitor shell, not this app, and need their
own pass before submission.

Rebuilt 2026-11-16 after the `RECORD_AUDIO`/`SYSTEM_ALERT_WINDOW` cleanup,
after adding in-app data export + account deletion (commit 9b25284), after the
deletion-flow review fixes (commit 192963d: 0016 phone placeholder, device wipe
on sign-out/delete, export parity), after the mobile CI workflow +
scheduled-only class filter (commit b15fa70), and after the member-flow +
RLS-policy fixes (commits 475fea7 and cfbf2cf: UTC day keys, migration 0017
member photo/booking/session policies, outbox clear on sign-out, zero-row
write guards). Superseded pairs, newest first: APK 110,814,489 bytes /
SHA-256 `C991B9FA963230E2D4CFC623C59DF7F9ABF30779396747DBDA82D21CB2A3ADC3`
and AAB 75,748,381 bytes / `B0F443089712D39F17107EA510B1D445611EFE7C157ECEBD2655D568FC83F637`
(b15fa70); APK 110,814,505 / `4E73AE83361F9FDC4963FF7CF77409C8E84B6E89E6371D713976D4DF0E39E5EA`
and AAB 75,748,404 / `0B68BD444DA252B91ABAF29F2BC6172AE59A96616E88AE1C2AD6947A49AABEC6`
(192963d); APK 110,812,793 / `26B23A9A901978B9E606E4698E8D1355320D089FF435604EE7C320E3686837EF`
and AAB 75,747,538 / `A30517766DD52EE01155AAC36A3C28B1C89CA4F52B76F561727F3ED628C99B7C`
(9b25284). Current copies in `release/mobile/` (built from commit cfbf2cf):
`TwoPlus-1.0-android-member.apk` (110,814,829 bytes, SHA-256
`7AE4C142F0BA6601AF76C42318FFF6FC9FDABA5ABEB6098256F71313C155F183`) and
`TwoPlus-1.0-android-member.aab` (75,748,153 bytes, SHA-256
`D75473A5A20B6BA72C7A03F25A877E15C18325CDA40749C27A5452AF8261628E`). Verified:
package `fit.twoplus.member` versionCode 1 / versionName 1.0.0 / minSdk 24 /
targetSdk 36; APK signed with the v2 scheme only (`apksigner verify --verbose`:
v1/v3/v3.1/v4 false), signer `CN=TwoPlus, OU=Mobile, O=TwoPlus, C=IN`
(SHA-256 `4ea08dc003e2a31e749ce499ce8b8f5e6a20ae2870ebee9812270c94feaceed7`,
valid until 2054-03-22, unchanged keystore); AAB `jarsigner -verify` clean (JAR
scheme) with the same certificate; the APK permission list is unchanged from
the prior pairs (13 entries); `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` absent
from both packaged manifests.

Build-machine note: this project must be built from a short root path (e.g.
`C:\tpm2`, a full robocopy of `mobile/`) with BOTH `android/app/build/` AND
`android/build/` deleted in the copy first (the root-level
`build/generated/autolinking/autolinking.json` rides along from the long path
and bakes D: paths into the regenerated CMake files), and `./gradlew --stop`
run before building (idle daemons started inside the D: tree regenerate
outputs against it). The app-module CMake autolinking embeds absolute `node_modules`
source paths into ninja object files; from
`D:\TwoPlus\TwoPlus-repo\mobile\...` those exceed Windows' 260-char MAX_PATH
(LongPathsEnabled is off) and the native build fails. The JS bundling step also
rejects junctions (drive-root mismatch in `path.relative`), so a real copy, not
a link, is required.

## iOS

Requires macOS with Xcode. Xcode does not run on Windows or Linux, so this build
is CI-only (`.github/workflows/ios.yml`, `macos-latest`).

```bash
npm run build
npx cap sync ios
cd ios/App && xcodebuild -project App.xcodeproj -scheme App \
  -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

**Release:** an `.ipa` for TestFlight or the App Store needs an Apple Developer
Program membership, a distribution certificate, and a provisioning profile. All
three are owner-held credentials.

## Native configuration

`capacitor.config.ts` holds the app id (`fit.twoplus.app`), display name, and
`webDir: "dist"`. It deliberately has no `server.url`: a committed dev-server URL
would make a release build load code from a laptop.

Mixed content is off. The app only ever talks to Supabase over HTTPS.

## Windows desktop

Electron, not Tauri: Tauri needs a Rust toolchain, and this machine has none.

```bash
npm run desktop          # build, then run the shell
npm run desktop:smoke    # build, then check the shell mounts and routes
npm run desktop:package  # build, render the icon, emit release/TwoPlus-win32-x64/
```

`electron/main.js` serves `dist/` over a custom `app://bundle` origin. That is
deliberate: the renderer uses `BrowserRouter`, and a `file://` origin breaks
history routing and gives every route an opaque origin, which kills
`localStorage`. A registered standard, secure scheme keeps both working, so
`/app/overview/overview` loads and refreshes like it does on the web.

The shell is hardened the way the web build is: `contextIsolation` on,
`nodeIntegration` off, `sandbox` on, a single-instance lock, no preload script,
and the same CSP as `vercel.json` applied to the packaged HTML. Navigation away
from the app opens in the system browser instead. `--smoke-check` loads `/`,
then a deep link, and exits non-zero if either fails to mount, which is what CI
and a release check should run.

`npm run desktop:package` writes `release/` (git-ignored) containing
`TwoPlus.exe` plus its Electron runtime, with `build/icon.ico` generated from
`public/favicon.svg` by `scripts/make-icon.mjs`. Only `dist/`, `electron/`, and
`package.json` are packed, so the archive is about 2 MB rather than the 87 MB it
was when the whole repo (including `.env.local`) rode along.

**Not wired:** code signing and an installer. An unsigned `.exe` trips
SmartScreen for end users, and a real installer (Squirrel or NSIS) plus a
signing certificate are owner-held decisions. Distribution is currently a
folder you copy.

## What is deliberately not wired

- Code signing for Apple and Windows: no certificate exists, and none should be
  committed. The Android keystore does exist, outside the repo (see Android above).
- Store metadata, screenshots, and submission: owner authorization required.
- A Windows installer and auto-update: owner decision, needs a signing cert.

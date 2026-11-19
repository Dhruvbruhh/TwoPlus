# Release report — 19 Nov 2026 (baseline dd1bf0e)

Nothing is committed yet. Nothing has been written to production, nothing has been published, and no store submission has been made.

## Highest-impact residual risk
Migration 0018 and the 0005/0016/0017 set have only been tested on a local Postgres (PGlite), not on a Supabase project. The web client falls back to its old write paths until the owner applies them (`docs/MIGRATION-CHECKLIST.md`).

## Defects found and fixed (with evidence)
| Defect | Where | Evidence |
|---|---|---|
| Logging a second exercise's set 1 conflicted with the first exercise's set 1. Mobile numbered sets per exercise, but the upsert key is per session | `mobile/app/workout.tsx` | `mobile/tests/outbox.test.mjs` |
| Members had no UPDATE policy on `workout_sets`, so they could not correct a set | 0018 §5a | `baseline-0017.test.mjs`, A08 |
| Trainers could read every payment, invoice and expense | 0018 §5c | baseline, A13 |
| Staff reminders could not reach members | 0018 §5b | baseline, A12 |
| Sign-out and account deletion never wiped the offline cache (keys were stored without the prefix the wipe looks for) | `mobile/src/lib/useAsync.ts` | `localdata.test.mjs` |
| The "Sign out" button for unclaimed members only navigated, and the app bounced the member back | `mobile/app/(tabs)/index.tsx` | code review |
| Renewals, invoice numbering, payments and enquiry conversion were not safe to retry; web member creation bypassed the duplicate guard | 0018 + `src/lib/api.ts`, `src/App.tsx` | A02–A06 |
| The app declared `ACTIVITY_RECOGNITION` and a barcode camera string, but no such features exist | `mobile/app.json` | — |

## Added
- Native progress photos, member invoices and outstanding balance, mark-as-read, forgot-password handoff to `https://twoplus.fit/reset-password` (this URL must be on Supabase's redirect allowlist), suspended/archived banner, session-expired notice, wipe on account switch, offline set queue (member-scoped, deduplicated, cap 50), dated offline copies, keyboard handling, and Android back guards on the workout and run screens.
- `npm run test:db`: PGlite harness, all 18 migrations, two gyms, every role.

## Test results
| Suite | Pass | Fail | Skip/blocked |
|---|---|---|---|
| DB acceptance + baseline (`npm run test:db`) | 20 | 0 | A10, A11, A16, A17, A18 not covered at DB level |
| Mobile unit (`mobile: npm test`) + typecheck | 49 | 0 | — |
| Web build + lint (no new warnings: 10 before, 10 after) | pass | — | — |
| Playwright | 31 | 0 | 11 skipped (need SHOT_EMAIL/SHOT_PASS on the live backend) |
| Android release builds (member + shell) | 4 artifacts | 0 | — |
| BlueStacks / device smoke (A16) | — | — | **blocked**: BlueStacks ADB is off; no device attached |

## Installable artifacts (`release/mobile/`, gitignored)
Built 19 Nov 2026 from the **uncommitted working tree** on top of `dd1bf0e`. Signed with the existing release keystore; certificate `CN=TwoPlus, OU=Mobile, O=TwoPlus, C=IN`, SHA-256 `4ea08dc003e2a31e749ce499ce8b8f5e6a20ae2870ebee9812270c94feaceed7`. This is the same certificate as the 1.0.0 builds, so both install as upgrades.

| Platform | Package | Version / code | File | Bytes | SHA-256 | Signing |
|---|---|---|---|---|---|---|
| Android member app (Expo) | `fit.twoplus.member` | 1.0.1 / 2 | `TwoPlus-1.0.1-android-member.apk` | 110,869,589 | `2de2753c32f5c11b601aeaf70251ec8408c7d8d5fbd48004e2c15e5bf5e298f4` | v2, `apksigner verify` ok |
| Android member app (Expo) | `fit.twoplus.member` | 1.0.1 / 2 | `TwoPlus-1.0.1-android-member.aab` | 75,770,729 | `a51b0fd536c84da20d70373644d502d57aed1fdb2e371d8367222454ead07dbe` | JAR, `jar verified` |
| Android staff shell (Capacitor) | `fit.twoplus.app` | 1.0.1 / 2 | `TwoPlus-1.0.1-android.apk` | 3,994,359 | `f00227a007b1b0acff36a4753c914fc2b2f8b74abbe7e17e46cd1070668d16a9` | v2, `apksigner verify` ok |
| Android staff shell (Capacitor) | `fit.twoplus.app` | 1.0.1 / 2 | `TwoPlus-1.0.1-android.aab` | 3,851,998 | `f0cfca28b2eabf4b228d823bed68257603206d1f0665a544ff9eb339333cd759` | JAR, `jar verified` |
| iOS (either app) | — | — | not built | — | — | no Mac runner |

**What actually ran:** a release Gradle build (member: 22m58s via the `C:\tpm2` short-path copy after `expo prebuild`; signing and `C:/cxx` patches re-applied), then `aapt2 dump badging` and signature checks. The member APK now declares only coarse/fine location, camera, internet, media images, vibrate, legacy storage (SDK 32 and below), and library-added network state/biometric. `ACTIVITY_RECOGNITION`, `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` are absent. The shell declares `INTERNET` only. **Neither app was installed on any device**: BlueStacks has ADB access switched off (`enable_adb_access="0"`).

## Remaining (in order)
1. Turn on ADB in BlueStacks (Settings → Advanced), `adb connect 127.0.0.1:5555`, install, and smoke-test sign-in, workout, deep link, upgrade from 1.0.0, and sign-out.
2. Owner: apply migrations 0005, 0016, 0017 and 0018 in staging, then production; run the signed-in Playwright suite with test credentials.
3. Not started: CSV import, support tickets, scheduled reminders (A17), restore drill (A18), iOS (needs a Mac).

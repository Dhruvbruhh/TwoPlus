# TwoPlus member app 1.0.1 (versionCode 6): 21 Nov 2026

Supersedes versionCode 5. JavaScript-only change, so the patched Android project in `C:\tpm2` was reused without `expo prebuild` (3m32s build).

## What changed (commit 2841eea)

- Five tabs instead of six: Coach moved to a "Your coach" card on Train.
- Back button on hidden routes (Coach, Tools); tabs go back by history.
- unslop/hallmark checklist: sentence-case labels and fields, Home titled "Today", no greeting eyebrow, no gradient wash on sign-in, no sparkle icons.

## Artifacts (`release/mobile/`, gitignored)

| File | SHA-256 |
|---|---|
| TwoPlus-1.0.1-6-android-member.apk | `d00fd7c18ee84526d84d6eaaa8f2154f75d2092fbe17a4742ca37841814f3f06` |
| TwoPlus-1.0.1-6-android-member.aab | `fc3b6e9aa2afcb874c6369b8f7afae2122ceae7e9e4adfd330b539ee2d6d8da4` |

`aapt2`: `fit.twoplus.member`, versionCode 6, versionName 1.0.1. apksigner v2 certificate `4ea08dc0…eed7` (same release key); AAB `jar verified`. The bundle contains the new copy.

## Checks

Mobile typecheck clean, 54/54 tests, web build ok, lint unchanged at 10 warnings. Sign-in screen viewed at phone size in the Expo web preview. Installed on BlueStacks (versionCode 6 confirmed).

**Not verified:** signed-in screens on a device; sign-in on BlueStacks could not be completed. Not submitted to any store.

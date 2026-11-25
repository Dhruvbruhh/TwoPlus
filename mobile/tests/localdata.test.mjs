/**
 * The device-side privacy rules: what an export includes, what a wipe removes.
 * Run with: npx tsx --test tests/*.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dataSrc = readFileSync(new URL("../src/lib/data.ts", import.meta.url), "utf8");
const useAsyncSrc = readFileSync(new URL("../src/lib/useAsync.ts", import.meta.url), "utf8");
const authSrc = readFileSync(new URL("../src/lib/auth.tsx", import.meta.url), "utf8");
const profileSrc = readFileSync(new URL("../app/(tabs)/profile.tsx", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../supabase/migrations/0016_account_deletion.sql", import.meta.url),
  "utf8",
);

test("export: the raw member row is not dumped, notes stays out", () => {
  assert.match(dataSrc, /profile:\s*\{/);
  assert.doesNotMatch(dataSrc, /^\s*member,\s*$/m);
  assert.match(dataSrc, /Curated, not select/);
});

test("export: every list goes through EXPORT_LIMIT, not the screen caps", () => {
  assert.match(dataSrc, /EXPORT_LIMIT = 100_000/);
  assert.match(dataSrc, /getPayments\(memberId, EXPORT_LIMIT\)/);
  assert.match(dataSrc, /getAttendance\(memberId, EXPORT_LIMIT\)/);
  assert.match(dataSrc, /getMeasurements\(memberId, EXPORT_LIMIT\)/);
  assert.match(dataSrc, /getRecentSessions\(memberId, EXPORT_LIMIT\)/);
});

test("export: sets are embedded per session, no slice cap", () => {
  assert.match(dataSrc, /sessions\.map\(\(s\) => getSets\(s\.id\)/);
  assert.doesNotMatch(dataSrc, /sessions\.slice\(0,\s*50\)/);
});

test("wipe: covers the offline cache prefix and both on-device logs", () => {
  assert.match(useAsyncSrc, /export const CACHE_PREFIX = "twoplus\.cache:"/);
  assert.match(dataSrc, /k\.startsWith\(CACHE_PREFIX\)/);
  assert.match(dataSrc, /"twoplus\.water"/);
  assert.match(dataSrc, /"twoplus\.meals"/);
  assert.match(dataSrc, /multiRemove/);
});

test("wipe: runs on sign-out and before sign-out on deletion", () => {
  assert.match(authSrc, /await wipeLocalMemberData\(\)/);
  const deleteIdx = profileSrc.indexOf("await deleteMyAccount()");
  const wipeIdx = profileSrc.indexOf("await wipeLocalMemberData()");
  const signOutIdx = profileSrc.indexOf("await signOut()");
  assert.ok(wipeIdx > deleteIdx, "wipe must run after the RPC");
  assert.ok(signOutIdx > wipeIdx, "wipe must run before signOut");
});

test("migration 0016: the anonymised phone value satisfies its own check", () => {
  // The constraint from 0006 applies to every update; '' fails it.
  assert.match(migration, /phone = '0000000000'/);
  assert.doesNotMatch(migration, /phone = ''/);
  assert.match("0000000000".replace(/^.*$/, "x"), /x/);
  assert.ok(/^[0-9+() -]{6,20}$/.test("0000000000"), "placeholder must pass members_phone_shape");
});

test("wipe reaches the offline cache: useAsync stores under CACHE_PREFIX, keys are per member", () => {
  // Regression: keys were stored bare ("home"), so the prefix wipe missed them.
  assert.match(useAsyncSrc, /const storeKey = cacheKey \? CACHE_PREFIX \+ cacheKey : null/);
  assert.doesNotMatch(useAsyncSrc, /cachePut\(cacheKey/);
  for (const screen of ["index", "train", "profile", "community", "coach", "nutrition"]) {
    const src = readFileSync(new URL(`../app/(tabs)/${screen}.tsx`, import.meta.url), "utf8");
    assert.match(src, /member \? `\w+:\$\{member\.id\}` : undefined/, `${screen} cache key is member-scoped`);
  }
});

test("account switch: a different user on this device wipes the previous member's data", () => {
  assert.match(authSrc, /if \(last && last !== uid\) await wipeLocalMemberData\(\)/);
  assert.match(dataSrc, /k\.startsWith\(OUTBOX_PREFIX\)/);
});

test("android: Screen passes a bare RefreshControl (a wrapper drops the cloned children and blanks every tab)", () => {
  const ui = readFileSync(new URL("../src/components/ui.tsx", import.meta.url), "utf8");
  assert.match(ui, /refreshControl: \(\s*<RefreshControl\b/);
  assert.doesNotMatch(ui, /RefreshIndicator/);
});

test("progress photos: the column is notes (0006); reads alias it, never select a bare note", () => {
  const web = readFileSync(new URL("../../src/lib/member-api.ts", import.meta.url), "utf8");
  for (const src of [dataSrc, web]) {
    assert.doesNotMatch(src, /member_progress_photos"\)\s*\.select\("[^"]*\bnote\b(?!:)/);
  }
  assert.match(web, /notes: input\.note/);
});

test("native feel: primitives carry haptics, bounded font scaling, heading roles; panes share one control", () => {
  const ui = readFileSync(new URL("../src/components/ui.tsx", import.meta.url), "utf8");
  assert.match(ui, /maxFontSizeMultiplier=\{maxScale\[variant\]\}/);
  assert.match(ui, /accessibilityRole=\{headings\.has\(variant\) \? "header" : undefined\}/);
  assert.match(ui, /haptic\.tap\(\)/);
  assert.match(ui, /useReducedMotion\(\)/);
  for (const screen of ["train", "profile"]) {
    const src = readFileSync(new URL(`../app/(tabs)/${screen}.tsx`, import.meta.url), "utf8");
    assert.match(src, /<Segmented items=\{PANES\}/);
    assert.doesNotMatch(src, /PANES\.map/);
  }
  const home = readFileSync(new URL("../app/(tabs)/index.tsx", import.meta.url), "utf8");
  const workoutAt = home.indexOf("Today's training is the screen's one focal point");
  assert.ok(workoutAt > -1 && workoutAt < home.indexOf("Level: derived"), "workout comes before XP on Home");
  assert.ok(workoutAt < home.indexOf("Membership: one line"), "workout comes before membership on Home");
});

test("navigation: at most five visible tabs; Coach and Tools are hidden routes with a back button", () => {
  const layout = readFileSync(new URL("../app/(tabs)/_layout.tsx", import.meta.url), "utf8");
  const screens = layout.match(/<Tabs\.Screen[\s\S]*?\/>/g) ?? [];
  const visible = screens.filter((s) => !s.includes(`display: "none"`));
  assert.ok(visible.length <= 5, `${visible.length} visible tabs`);
  // href: null made these routes unreachable: opening Coach or Tools landed on Home.
  assert.doesNotMatch(layout, /href: null/);
  for (const screen of ["coach", "tools"]) {
    const src = readFileSync(new URL(`../app/(tabs)/${screen}.tsx`, import.meta.url), "utf8");
    assert.match(src, /<BackButton/);
  }
});

test("unslop: no shouted labels or sparkle icons", () => {
  for (const f of ["(tabs)/index", "(tabs)/train", "(tabs)/tools", "(tabs)/profile", "(tabs)/nutrition", "scan", "login"]) {
    const src = readFileSync(new URL(`../app/${f}.tsx`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /\.toUpperCase\(\)\s*}|>(?!(?:BMR|TDEE|BMI)<)[A-Z]{3,}( [A-Z]{2,})*<|label[:=] ?"[A-Z]{3,}[ A-Z()]*"|sparkles/, f);
  }
});

test("workout and run keep separate daily sessions: the workout passes its assignment", () => {
  const workout = readFileSync(new URL("../app/workout.tsx", import.meta.url), "utf8");
  assert.match(dataSrc, /return \{ assignmentId, plan, exercises \}/);
  assert.match(workout, /assignmentId: active\.assignmentId/);
  assert.match(workout, /plan\.loading \|\| !active\) return/);
});

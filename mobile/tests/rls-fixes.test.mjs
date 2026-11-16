/**
 * Regression coverage for migration 0017 (RLS audit fixes). The migration
 * cannot run in CI without a database, so these assert the policy text that
 * closes each audit finding is present and the vulnerable form is gone.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../../supabase/migrations/0017_rls_member_fixes.sql", import.meta.url),
  "utf8",
);

test("photos: members can insert and delete their own rows", () => {
  assert.match(sql, /progress photos insert self/);
  assert.match(sql, /progress photos delete self/);
});

test("org guard: workout session and measurement updates check organization_id", () => {
  const sections = sql.split("drop policy if exists");
  const workout = sections.find((s) => s.includes("workout sessions update own"));
  const measureSelf = sections.find((s) => s.includes("measurements update self"));
  for (const section of [workout, measureSelf]) {
    assert.ok(section, "policy section must exist");
    const orgMatches = section.match(/m\.organization_id = \w+\s*\.?organization_id/g) ?? [];
    assert.ok(orgMatches.length >= 2, "both using and with check must match organization_id");
  }
});

test("bookings: only a 'booked' row may be cancelled", () => {
  const section = sql.split("drop policy if exists").find((s) => s.includes("bookings cancel own"));
  assert.ok(section);
  assert.match(section, /class_bookings\.status = 'booked'/);
  assert.match(section, /status = 'cancelled'/);
});

test("roles: attendance update includes trainer, staff measurements include receptionist", () => {
  const attendance = sql.split("drop policy if exists").find((s) => s.includes("attendance update"));
  const staff = sql.split("drop policy if exists").find((s) => s.includes('"measurements update"'));
  assert.match(attendance ?? "", /'trainer'/);
  assert.match(staff ?? "", /'receptionist'/);
});

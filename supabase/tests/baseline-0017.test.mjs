/**
 * The schema as it stands before 0018 (what production gets from the owner
 * checklist). Each test reproduces a defect that 0018 fixes; if one of these
 * starts failing, the defect is gone from the baseline and 0018 can drop it.
 */
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { freshDb, user, as, admin } from "./harness.mjs";

let db, owner, trainer, member, org, m;
const q = (who, sql, p) => as(db, who, (tx) => tx.query(sql, p)).then((r) => r.rows);

before(async () => {
  db = await freshDb({ upTo: "0017_rls_member_fixes.sql" });
  owner = await user(db, "o@example.test");
  trainer = await user(db, "t@example.test");
  member = await user(db, "m@example.test");
  org = (await q(owner, "select create_organization('Gym') as id"))[0].id;
  await admin(db, "insert into organization_members values ($1,$2,'trainer')", [org, trainer.id]);
  m = (await q(owner, "select (create_member($1,'Mo','','9000000009',$2)).id", [org, member.email]))[0].id;
  await q(member, "select claim_member_account()");
  await q(owner, "select record_payment($1,$2,1000)", [org, m]);
});

test("0017 baseline: a member cannot correct a logged set", async () => {
  const s = (await q(member, "insert into workout_sessions (organization_id, member_id) values ($1,$2) returning id", [org, m]))[0].id;
  await q(member, "insert into workout_sets (session_id, exercise_name, set_number, reps) values ($1,'Bench',1,10)", [s]);
  await assert.rejects(
    q(member, "insert into workout_sets (session_id, exercise_name, set_number, reps) values ($1,'Squat',1,8) on conflict (session_id, set_number) do update set reps = excluded.reps", [s]),
    /row-level security/,
  );
});

test("0017 baseline: a trainer reads every payment in the gym", async () => {
  assert.equal((await q(trainer, "select id from payments")).length, 1);
});

test("0017 baseline: an owner cannot send a reminder to a member", async () => {
  await assert.rejects(q(owner, "insert into notifications (organization_id, user_id, title) values ($1,$2,'Renew')", [org, member.id]));
});

test("0017 baseline: renew_membership has no replay guard", async () => {
  const fns = await admin(db, "select pg_get_function_arguments(oid) a from pg_proc where proname = 'renew_membership'");
  assert.ok(!fns.rows[0].a.includes("p_request_id"));
});

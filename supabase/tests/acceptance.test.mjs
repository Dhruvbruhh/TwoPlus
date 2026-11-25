/**
 * PRD Part VI acceptance scenarios, database layer: every migration applied to
 * an in-process Postgres, two synthetic gyms, every role, and both the allowed
 * action and its denied counterpart. Run: npm run test:db
 */
import test, { before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { freshDb, user, as, admin } from "./harness.mjs";

let db;
const U = {};
const G = {};

const rows = async (who, sql, params) => (await as(db, who, (tx) => tx.query(sql, params))).rows;
const rpc = async (who, fn, args) => {
  const keys = Object.keys(args);
  const sql = `select * from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
  return (await as(db, who, (tx) => tx.query(sql, Object.values(args)))).rows;
};
const denied = (p) => assert.rejects(p);

before(async () => {
  db = await freshDb();
  for (const name of ["ownerA", "managerA", "recepA", "trainerA", "trainerNoStaff", "financeA", "ownerB", "member1", "member2", "member3", "padmin", "stranger"]) {
    U[name] = await user(db, `${name.toLowerCase()}@example.test`);
  }
  G.A = (await rpc(U.ownerA, "create_organization", { p_name: "Gym A" }))[0];
  G.B = (await rpc(U.ownerB, "create_organization", { p_name: "Gym B" }))[0];
  G.A.id ??= G.A.create_organization;
  G.B.id ??= G.B.create_organization;
  for (const [u, role] of [["managerA", "manager"], ["recepA", "receptionist"], ["trainerA", "trainer"], ["trainerNoStaff", "trainer"], ["financeA", "finance"]]) {
    await admin(db, "insert into organization_members (organization_id, user_id, role) values ($1,$2,$3)", [G.A.id, U[u].id, role]);
  }
  await admin(db, "insert into platform_admins (user_id, role) values ($1, 'super_admin')", [U.padmin.id]);

  // Members are registered by the desk with the email they will sign up with.
  const reg = (who, org, first, phone, email) =>
    rpc(who, "create_member", { p_organization_id: org, p_first_name: first, p_phone: phone, p_email: email });
  G.m1 = (await reg(U.recepA, G.A.id, "Asha", "9000000001", U.member1.email))[0];
  G.m2 = (await reg(U.recepA, G.A.id, "Bilal", "9000000002", U.member2.email))[0];
  G.m3 = (await reg(U.ownerB, G.B.id, "Chen", "9000000003", U.member3.email))[0];
  for (const m of ["member1", "member2", "member3"]) await rpc(U[m], "claim_member_account", {});

  G.plan = (await rows(U.ownerA,
    "insert into membership_plans (organization_id, name, duration_days, price_minor) values ($1,'Monthly',30,300000) returning *",
    [G.A.id]))[0];
});

test("all 18 migrations apply on a clean database", async () => {
  const r = await admin(db, "select count(*)::int n from pg_tables where schemaname = 'public'");
  assert.ok(r.rows[0].n >= 39);
});

test("A01 claim: unique match links once, ambiguous and missing match disclose nothing", async () => {
  const linked = await rows(U.member1, "select id from members where user_id = auth.uid()");
  assert.equal(linked.length, 1);
  assert.equal(linked[0].id, G.m1.id);
  // A second gym with the same email makes the address ambiguous.
  const dup = await user(db, "twogyms@example.test");
  await rpc(U.ownerA, "create_member", { p_organization_id: G.A.id, p_first_name: "X", p_phone: "9111111111", p_email: dup.email });
  await rpc(U.ownerB, "create_member", { p_organization_id: G.B.id, p_first_name: "X", p_phone: "9111111111", p_email: dup.email });
  assert.equal((await rpc(dup, "claim_member_account", {}))[0].claim_member_account, null);
  assert.equal((await rows(dup, "select id from members")).length, 0, "ambiguous claimant sees no member row");
  assert.equal((await rpc(U.stranger, "claim_member_account", {}))[0].claim_member_account, null);
  assert.equal((await rows(U.stranger, "select id from members")).length, 0);
});

test("A02 register and search: duplicate phone is refused, code is stable", async () => {
  await denied(rpc(U.recepA, "create_member", { p_organization_id: G.A.id, p_first_name: "Asha", p_phone: "90000 00001" }));
  const found = await rows(U.recepA, "select member_code from members where organization_id = $1 and (phone like '%0001' or member_code = $2)", [G.A.id, G.m1.member_code]);
  assert.equal(found.length, 1);
  assert.match(G.m1.member_code, /^M-\d{4}$/);
  await denied(rpc(U.trainerA, "create_member", { p_organization_id: G.A.id, p_first_name: "T", p_phone: "9222222222" }));
  await denied(rpc(U.ownerB, "create_member", { p_organization_id: G.A.id, p_first_name: "T", p_phone: "9222222223" }));
});

test("A03 assign and renew: replay gives exactly one new end date and one history row", async () => {
  const ms = (await rpc(U.recepA, "assign_membership", { p_organization_id: G.A.id, p_member_id: G.m1.id, p_plan_id: G.plan.id, p_start_date: "2026-11-01" }))[0];
  assert.equal(ms.price_minor, 300000);
  const req = randomUUID();
  const args = { p_organization_id: G.A.id, p_membership_id: ms.id, p_new_end_date: "2027-01-01", p_amount_minor: 300000, p_note: "renew", p_request_id: req };
  await rpc(U.recepA, "renew_membership", args);
  const replay = (await rpc(U.recepA, "renew_membership", args))[0];
  assert.equal(String(replay.end_date instanceof Date ? replay.end_date.toISOString().slice(0, 10) : replay.end_date), "2027-01-01");
  const hist = await rows(U.recepA, "select * from membership_renewals where membership_id = $1", [ms.id]);
  assert.equal(hist.length, 1);
  // Old plan terms survive a catalogue price change.
  await rows(U.ownerA, "update membership_plans set price_minor = 450000 where id = $1", [G.plan.id]);
  assert.equal((await rows(U.recepA, "select price_minor from member_memberships where id = $1", [ms.id]))[0].price_minor, 300000);
  await denied(rpc(U.trainerA, "renew_membership", { ...args, p_request_id: randomUUID(), p_new_end_date: "2027-02-01" }));
  G.ms1 = ms;
});

test("A03 archive keeps payments", async () => {
  const tmp = (await rpc(U.recepA, "create_member", { p_organization_id: G.A.id, p_first_name: "Archie", p_phone: "9333333333" }))[0];
  await rpc(U.recepA, "record_payment", { p_organization_id: G.A.id, p_member_id: tmp.id, p_amount_minor: 50000 });
  await rows(U.ownerA, "update members set status = 'archived' where id = $1", [tmp.id]);
  assert.equal((await rows(U.ownerA, "select id from payments where member_id = $1", [tmp.id])).length, 1);
});

test("A04 the ₹3,000 fixture: verified ₹1,000 leaves ₹2,000; pending ₹500 does not count", async () => {
  const inv = (await rpc(U.recepA, "create_invoice", { p_organization_id: G.A.id, p_member_id: G.m1.id, p_total_minor: 300000, p_request_id: randomUUID() }))[0];
  const pay = (args) => rpc(U.recepA, "record_payment", { p_organization_id: G.A.id, p_member_id: G.m1.id, p_invoice_id: inv.id, ...args });
  const req = randomUUID();
  await pay({ p_amount_minor: 100000, p_method: "upi", p_status: "paid", p_request_id: req });
  await pay({ p_amount_minor: 100000, p_method: "upi", p_status: "paid", p_request_id: req }); // replay
  await pay({ p_amount_minor: 50000, p_method: "cash", p_status: "pending", p_request_id: randomUUID() });
  const balance = `select i.total_minor - coalesce(sum(p.amount_minor) filter (where p.status = 'paid'), 0) as due
                     from invoices i left join payments p on p.invoice_id = i.id where i.id = $1 group by i.id`;
  assert.equal((await rows(U.recepA, balance, [inv.id]))[0].due, 200000, "desk view");
  assert.equal((await rows(U.member1, balance, [inv.id]))[0].due, 200000, "member view");
  assert.equal((await rows(U.member2, balance, [inv.id])).length, 0, "other member cannot read it");
  assert.equal((await rows(U.ownerB, balance, [inv.id])).length, 0, "other gym cannot read it");
  // Reception cannot void or settle; finance can.
  assert.equal((await rows(U.recepA, "update invoices set status = 'void' where id = $1 returning id", [inv.id])).length, 0);
  assert.equal((await rows(U.recepA, "update payments set status = 'paid' where invoice_id = $1 and status = 'pending' returning id", [inv.id])).length, 0);
  assert.equal((await rows(U.financeA, "update payments set status = 'paid' where invoice_id = $1 and status = 'pending' returning id", [inv.id])).length, 1);
  assert.equal((await rows(U.recepA, balance, [inv.id]))[0].due, 150000);
  assert.equal((await rows(U.financeA, "update invoices set status = 'void' where id = $1 returning id", [inv.id])).length, 1);
  // A void invoice takes no more allocations.
  await denied(pay({ p_amount_minor: 1000, p_request_id: randomUUID() }));
});

test("A04 invoice numbers are unique, sequential and replay-safe", async () => {
  const req = randomUUID();
  const a = (await rpc(U.recepA, "create_invoice", { p_organization_id: G.A.id, p_member_id: G.m2.id, p_total_minor: 1000, p_request_id: req }))[0];
  const again = (await rpc(U.recepA, "create_invoice", { p_organization_id: G.A.id, p_member_id: G.m2.id, p_total_minor: 1000, p_request_id: req }))[0];
  const b = (await rpc(U.recepA, "create_invoice", { p_organization_id: G.A.id, p_member_id: G.m2.id, p_total_minor: 1000 }))[0];
  assert.equal(again.id, a.id);
  assert.notEqual(a.invoice_number, b.invoice_number);
  assert.equal(Number(b.invoice_number.slice(-4)), Number(a.invoice_number.slice(-4)) + 1);
  await denied(rpc(U.trainerA, "create_invoice", { p_organization_id: G.A.id, p_member_id: G.m2.id, p_total_minor: 1 }));
  await denied(rpc(U.ownerB, "create_invoice", { p_organization_id: G.A.id, p_member_id: G.m2.id, p_total_minor: 1 }));
});

test("A05 check-in: two taps yield one open visit; trainer can check out (0017)", async () => {
  const tap = () => rpc(U.recepA, "record_attendance", { p_organization_id: G.A.id, p_member_id: G.m2.id });
  const first = (await tap())[0];
  const second = (await tap())[0];
  assert.equal(first.id, second.id);
  const open = await rows(U.recepA, "select id from attendance where member_id = $1 and check_out is null", [G.m2.id]);
  assert.equal(open.length, 1);
  const out = await rows(U.trainerA, "update attendance set check_out = now() where id = $1 returning id", [first.id]);
  assert.equal(out.length, 1);
  assert.equal((await rows(U.ownerB, "update attendance set check_out = now() where id = $1 returning id", [first.id])).length, 0);
});

test("A06 enquiry conversion: retry returns the same member; interrupted legacy flow re-links", async () => {
  const enq = (await rows(U.recepA,
    "insert into enquiries (organization_id, name, phone, source) values ($1,'Dev Rao','9444444444','walk_in') returning *", [G.A.id]))[0];
  const args = { p_enquiry_id: enq.id, p_plan_id: G.plan.id, p_start_date: "2026-11-01", p_end_date: "2026-12-15" };
  const one = (await rpc(U.recepA, "convert_enquiry", args))[0];
  const two = (await rpc(U.recepA, "convert_enquiry", args))[0];
  const ms = await rows(U.recepA, "select end_date::text e from member_memberships where member_id = $1", [one.id]);
  assert.deepEqual(ms.map((r) => r.e), ["2026-12-15"], "desk-chosen expiry kept, one membership");
  assert.equal(one.id, two.id);
  assert.equal(one.first_name, "Dev");
  assert.equal((await rows(U.recepA, "select id from members where phone = '9444444444'")).length, 1);
  const e = (await rows(U.recepA, "select status, converted_member_id from enquiries where id = $1", [enq.id]))[0];
  assert.deepEqual([e.status, e.converted_member_id], ["converted", one.id]);
  assert.ok((await rows(U.ownerA, "select actor_id from activity_log where action = 'enquiry.converted'")).length >= 1);

  // Old client flow died after creating the member: conversion links it.
  const enq2 = (await rows(U.recepA,
    "insert into enquiries (organization_id, name, phone) values ($1,'Esha K','9555555555') returning *", [G.A.id]))[0];
  const orphan = (await rpc(U.recepA, "create_member", { p_organization_id: G.A.id, p_first_name: "Esha", p_phone: "9555555555" }))[0];
  assert.equal((await rpc(U.recepA, "convert_enquiry", { p_enquiry_id: enq2.id }))[0].id, orphan.id);
  await denied(rpc(U.trainerA, "convert_enquiry", { p_enquiry_id: enq2.id }));
  await denied(rpc(U.ownerB, "convert_enquiry", { p_enquiry_id: enq2.id }));
});

test("A07 last seat: one confirmed seat, rebook is safe, past class refuses, attended stays attended", async () => {
  const cls = (await rows(U.ownerA,
    "insert into classes (organization_id, name, starts_at, capacity) values ($1,'HIIT', now() + interval '1 day', 1) returning *", [G.A.id]))[0];
  await rpc(U.member1, "book_class", { p_class_id: cls.id });
  await rpc(U.member1, "book_class", { p_class_id: cls.id }); // same member again
  await denied(rpc(U.member2, "book_class", { p_class_id: cls.id }));
  assert.equal((await rows(U.ownerA, "select id from class_bookings where class_id = $1 and status = 'booked'", [cls.id])).length, 1);
  await denied(rpc(U.member3, "book_class", { p_class_id: cls.id }), "other gym");

  const past = (await rows(U.ownerA,
    "insert into classes (organization_id, name, starts_at, capacity) values ($1,'Old', now() - interval '1 day', 5) returning *", [G.A.id]))[0];
  await denied(rpc(U.member1, "book_class", { p_class_id: past.id }));

  await rows(U.ownerA, "update class_bookings set status = 'attended' where class_id = $1", [cls.id]);
  await rpc(U.member1, "cancel_class_booking", { p_class_id: cls.id }).catch(() => {});
  assert.equal((await rows(U.ownerA, "select status from class_bookings where class_id = $1", [cls.id]))[0].status, "attended");
  assert.equal((await rows(U.member1, "update class_bookings set status = 'booked' where class_id = $1 returning id", [cls.id])).length, 0);
});

test("A08 training: member logs and edits one set, member 2 cannot read it", async () => {
  const s = (await rows(U.member1,
    "insert into workout_sessions (organization_id, member_id, performed_on) values ($1,$2,current_date) returning id", [G.A.id, G.m1.id]))[0];
  const up = `insert into workout_sets (session_id, exercise_name, set_number, reps, weight_kg) values ($1,$2,$3,$4,$5)
              on conflict (session_id, set_number) do update set reps = excluded.reps, weight_kg = excluded.weight_kg, exercise_name = excluded.exercise_name`;
  await rows(U.member1, up, [s.id, "Bench", 1, 10, 40]);
  await rows(U.member1, up, [s.id, "Squat", 2, 8, 60]);
  await rows(U.member1, up, [s.id, "Bench", 1, 12, 40]); // edit set 1 only
  const sets = await rows(U.member1, "select exercise_name, set_number, reps from workout_sets where session_id = $1 order by set_number", [s.id]);
  assert.deepEqual(sets.map((x) => [x.exercise_name, x.set_number, x.reps]), [["Bench", 1, 12], ["Squat", 2, 8]]);
  assert.equal((await rows(U.member2, "select id from workout_sets where session_id = $1", [s.id])).length, 0);
  assert.equal((await rows(U.member2, "select id from workout_sessions where id = $1", [s.id])).length, 0);
  assert.equal((await rows(U.ownerB, "select id from workout_sessions where id = $1", [s.id])).length, 0);
  assert.equal((await rows(U.trainerA, "select id from workout_sessions where id = $1", [s.id])).length, 1);
  // A session cannot be moved into another gym (0017 org guard).
  await denied(rows(U.member1, "update workout_sessions set organization_id = $2 where id = $1", [s.id, G.B.id]));
});

test("A09 measurements and photo rows are private to the member and their gym", async () => {
  const m = (await rows(U.member1,
    "insert into fitness_measurements (organization_id, member_id, measured_on, weight_kg) values ($1,$2,current_date,72.5) returning id", [G.A.id, G.m1.id]))[0];
  assert.equal((await rows(U.member2, "select id from fitness_measurements where id = $1", [m.id])).length, 0);
  assert.equal((await rows(U.ownerB, "select id from fitness_measurements where id = $1", [m.id])).length, 0);
  const path = `${G.A.id}/${G.m1.id}/p1.jpg`;
  const p = (await rows(U.member1,
    "insert into member_progress_photos (organization_id, member_id, storage_path, taken_on) values ($1,$2,$3,current_date) returning id", [G.A.id, G.m1.id, path]))[0];
  assert.equal((await rows(U.member2, "select id from member_progress_photos where id = $1", [p.id])).length, 0);
  assert.equal((await rows(U.member2, "delete from member_progress_photos where id = $1 returning id", [p.id])).length, 0);
  assert.equal((await rows(U.member1, "delete from member_progress_photos where id = $1 returning id", [p.id])).length, 1);
});

test("A12 reminders: recipient can mark read, nobody else can", async () => {
  // No RETURNING: the sender may write the row but not read the recipient's inbox.
  await rows(U.ownerA, "insert into notifications (organization_id, user_id, title) values ($1,$2,'Renew soon')", [G.A.id, U.member1.id]);
  await denied(rows(U.trainerA, "insert into notifications (organization_id, user_id, title) values ($1,$2,'x')", [G.A.id, U.member1.id]));
  await denied(rows(U.ownerB, "insert into notifications (organization_id, user_id, title) values ($1,$2,'x')", [G.B.id, U.member1.id]));
  const n = (await rows(U.member1, "select id from notifications where title = 'Renew soon'"))[0];
  assert.ok(n, "member sees the reminder");
  assert.equal((await rows(U.member2, "update notifications set read_at = now() where id = $1 returning id", [n.id])).length, 0);
  assert.equal((await rows(U.member1, "update notifications set read_at = now() where id = $1 returning id", [n.id])).length, 1);
});

test("A13 role boundaries: trainer sees no money, other gym sees nothing", async () => {
  assert.equal((await rows(U.trainerA, "select id from payments where organization_id = $1", [G.A.id])).length, 0);
  assert.equal((await rows(U.ownerB, "select id from members where organization_id = $1", [G.A.id])).length, 0);
  assert.equal((await rows(U.ownerB, "select id from payments where organization_id = $1", [G.A.id])).length, 0);
  assert.equal((await rows(U.member1, "select id from members")).length, 1, "member sees only self");
  assert.equal((await rows(U.member1, "select id from member_internal_notes")).length, 0);
});

test("A14 platform: admin suspends and reactivates; an owner cannot", async () => {
  await denied(rpc(U.ownerA, "admin_set_organization_status", { p_org_id: G.B.id, p_status: "suspended" }));
  await rpc(U.padmin, "admin_set_organization_status", { p_org_id: G.B.id, p_status: "suspended", p_reason: "test" });
  assert.equal((await admin(db, "select status from organizations where id = $1", [G.B.id])).rows[0].status, "suspended");
  await rpc(U.padmin, "admin_set_organization_status", { p_org_id: G.B.id, p_status: "active" });
  const audit = await admin(db, "select actor_user_id from admin_audit_log where target_id::text = $1 or metadata::text like $2", [G.B.id, `%${G.B.id}%`]);
  assert.ok(audit.rows.length >= 2);
  assert.ok(audit.rows.every((r) => r.actor_user_id === U.padmin.id));
});

test("A15 delete: owner refused; member erased, payments kept, sign-in gone", async () => {
  await denied(rpc(U.ownerA, "delete_my_account", {}));
  const before = (await admin(db, "select count(*)::int n from payments where member_id = $1", [G.m1.id])).rows[0].n;
  assert.ok(before > 0);
  const res = (await rpc(U.member1, "delete_my_account", {}))[0].delete_my_account;
  assert.equal(res.member_erased, true);
  const m = (await admin(db, "select first_name, status, email, user_id from members where id = $1", [G.m1.id])).rows[0];
  assert.deepEqual([m.first_name, m.status, m.email, m.user_id], ["Deleted", "archived", null, null]);
  assert.equal((await admin(db, "select count(*)::int n from payments where member_id = $1", [G.m1.id])).rows[0].n, before);
  assert.equal((await admin(db, "select count(*)::int n from workout_sessions where member_id = $1", [G.m1.id])).rows[0].n, 0);
  assert.equal((await admin(db, "select count(*)::int n from auth.users where id = $1", [U.member1.id])).rows[0].n, 0);
});

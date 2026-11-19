import test from "node:test";
import assert from "node:assert/strict";
import { withPending, drain, isNetworkError, OUTBOX_CAP } from "../src/lib/outbox.ts";
import { formatMoney, invoiceBalance, nextSetNumber } from "../src/lib/format.ts";

const set = (n, reps = 10) => ({ sessionId: "s", exerciseId: null, exerciseName: "Bench", setNumber: n, reps, weightKg: 40 });

test("outbox: re-queuing a set keeps one intent with the latest values", () => {
  const list = withPending(withPending([], set(1, 8)), set(1, 12));
  assert.equal(list.length, 1);
  assert.equal(list[0].reps, 12);
});

test("outbox: cap refuses instead of dropping", () => {
  let list = [];
  for (let i = 1; i <= OUTBOX_CAP; i++) list = withPending(list, set(i));
  assert.throws(() => withPending(list, set(OUTBOX_CAP + 1)), /full/);
});

test("outbox: drain stops at the first failure and keeps order", async () => {
  const sent = [];
  const r = await drain([set(1), set(2), set(3)], async (p) => {
    if (p.setNumber === 2) throw new Error("Network request failed");
    sent.push(p.setNumber);
  });
  assert.deepEqual(sent, [1]);
  assert.deepEqual(r.left.map((p) => p.setNumber), [2, 3]);
  assert.ok(isNetworkError(r.error));
  assert.ok(!isNetworkError("new row violates row-level security policy"));
});

test("sets: numbering is session-wide, never per exercise", () => {
  assert.equal(nextSetNumber([]), 1);
  assert.equal(nextSetNumber([{ set_number: 1 }, { set_number: 3 }]), 4);
});

test("money: exact minor units, ₹3,000 fixture balance", () => {
  assert.equal(formatMoney(300000), "₹3,000");
  assert.equal(formatMoney(100050), "₹1,000.50");
  const inv = { total_minor: 300000, status: "issued", payments: [
    { amount_minor: 100000, status: "paid" },
    { amount_minor: 50000, status: "pending" },
  ] };
  assert.equal(invoiceBalance(inv), 200000);
  assert.equal(invoiceBalance({ ...inv, status: "void" }), 0);
});

/**
 * Date and text helpers shared by screens.
 *
 * Kept separate from data.ts because these are pure and cheap to test, and
 * because dates arrive from Postgres as `YYYY-MM-DD` or a full timestamp and
 * need different treatment in each case.
 */

/** "2026-11-04" -> "4 Nov" (no year: a member app is almost always this year). */
export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function longDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long" });
}

export function clockTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * The member's calendar day, "YYYY-MM-DD", in device-local time.
 *
 * Every day-keyed log (meals, water, sessions, measurements) uses this instead
 * of `toISOString().slice(0, 10)`, which is the UTC date: for the gym's
 * IST timezone that flips everything logged between 00:00 and 05:30 local
 * onto the previous day, resetting the water ring and misfiling meals.
 */
export function dayKey(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Whole days from `from` to `to`, floored. Negative when `to` is in the past. */
export function daysBetween(from: string | Date, to: string | Date) {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

export function daysLeft(endDate: string | null) {
  if (!endDate) return null;
  return daysBetween(new Date(), endDate);
}

/**
 * Consecutive days the member has trained, counting back from today.
 *
 * A rest day breaks the streak, which is the honest definition for a gym app:
 * counting calendar weeks would tell a member they are "on a streak" after one
 * visit. Returns 0 when there is no attendance today or yesterday.
 */
export function streakFrom(checkIns: string[]) {
  const days = new Set(checkIns.map((iso) => iso.slice(0, 10)));
  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));

  if (!days.has(today) && !days.has(yesterday)) return 0;

  let cursor = days.has(today) ? now : new Date(now.getTime() - 86_400_000);
  let count = 0;
  for (let i = 0; i < 400; i++) {
    const key = dayKey(cursor);
    if (!days.has(key)) break;
    count++;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return count;
}

export function initials(first: string | null, last: string | null) {
  return `${(first ?? "").trim().charAt(0)}${(last ?? "").trim().charAt(0)}`.toUpperCase() || "?";
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Title-cases the enum values the database stores in lower case. */
export function humanise(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Money from integer minor units. Whole amounts drop the decimals; anything
 * with paise shows both digits, so a reconciled figure is never rounded away.
 */
// Built once: list rows call formatMoney per payment.
const wholeFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const paiseFmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(minor: number, currency = "INR") {
  const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const major = (abs % 100 === 0 ? wholeFmt : paiseFmt).format(abs / 100);
  return `${sign}${symbol}${major}`;
}

/**
 * What is still owed on an invoice: the total minus verified ("paid")
 * allocations. Pending, failed and refunded entries do not reduce it; a void
 * invoice owes nothing.
 */
export function invoiceBalance(invoice: {
  total_minor: number;
  status: string;
  payments?: { amount_minor: number; status: string }[] | null;
}) {
  if (invoice.status === "void") return 0;
  const paid = (invoice.payments ?? [])
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount_minor, 0);
  return Math.max(0, invoice.total_minor - paid);
}

/**
 * Set numbers are unique per session (workout_sets unique(session_id,
 * set_number)), not per exercise, so the next one is session-wide.
 */
export function nextSetNumber(sets: { set_number: number }[]) {
  return sets.reduce((max, s) => Math.max(max, s.set_number), 0) + 1;
}

/** "saved 14:05" or "saved 3 Nov, 14:05" for an offline copy. */
export function savedAt(ms: number, now = Date.now()) {
  const d = new Date(ms);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return dayKey(d) === dayKey(new Date(now)) ? `saved ${time}` : `saved ${shortDate(d.toISOString())}, ${time}`;
}

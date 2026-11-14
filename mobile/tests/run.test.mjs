/**
 * GPS run math. Run with: npx tsx --test tests/*.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatClock, formatPaceShort, haversineMeters, runNote, totalKm } from "../src/lib/run";

test("run: haversine knows the real distance between two known points", () => {
  // Parliament Hill to Trafalgar Square, London: ~5.4 km straight line.
  const d = haversineMeters({ lat: 51.5558, lon: -0.1407 }, { lat: 51.508, lon: -0.1281 });
  assert.ok(d > 5_000 && d < 5_800, `expected ~5400m, got ${d}`);
});

test("run: identical points measure zero", () => {
  assert.equal(haversineMeters({ lat: 12.9, lon: 77.6 }, { lat: 12.9, lon: 77.6 }), 0);
});

test("run: totalKm sums a route and returns 0 below two points", () => {
  const a = { lat: 12.9716, lon: 77.5946 };
  const b = { lat: 12.9756, lon: 77.5986 }; // ~580 m away
  assert.equal(totalKm([]), 0);
  assert.equal(totalKm([a]), 0);
  const km = totalKm([a, b, a]);
  assert.ok(km > 1.0 && km < 1.4, `out-and-back should be ~1.16km, got ${km}`);
});

test("run: formatClock renders minutes, seconds and hours", () => {
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(754), "12:34");
  assert.equal(formatClock(3905), "1:05:05");
  assert.equal(formatClock(-5), "0:00");
});

test("run: pace reuses the tools formula", () => {
  // 5 km in 25 min = 5:00 /km
  assert.equal(formatPaceShort(5, 1500), "5:00 /km");
  assert.equal(formatPaceShort(0, 1500), null);
  assert.equal(formatPaceShort(5, 0), null);
});

test("run: the saved note carries distance, time and pace", () => {
  assert.equal(runNote(5, 1500), "Run · 5.00 km · 25:00 · 5:00 /km");
  assert.equal(runNote(0, 0), "Run · 0.00 km · 0:00");
});

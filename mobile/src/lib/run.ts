/**
 * GPS run math. Pure and testable: the screen only collects points.
 *
 * Distance is the haversine great-circle length summed over consecutive
 * points - the same definition Strava-style trackers use, accurate to well
 * under a percent at running distances.
 */

export type Point = { lat: number; lon: number };

const EARTH_R = 6_371_000; // metres

export function haversineMeters(a: Point, b: Point) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Total distance of a route, in km. Fewer than two points = 0. */
export function totalKm(points: Point[]) {
  let metres = 0;
  for (let i = 1; i < points.length; i++) {
    metres += haversineMeters(points[i - 1], points[i]);
  }
  return metres / 1000;
}

/** 754 -> "12:34"; 3905 -> "1:05:05". */
export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** The note stored on the workout session row. */
export function runNote(distanceKm: number, durationSec: number) {
  const pace = formatPaceShort(distanceKm, durationSec);
  return `Run · ${distanceKm.toFixed(2)} km · ${formatClock(durationSec)}${pace ? ` · ${pace}` : ""}`;
}

/** "5:12 /km" via the same pace formula the tools screen uses. */
export function formatPaceShort(distanceKm: number, durationSec: number) {
  if (distanceKm <= 0 || durationSec <= 0) return null;
  const minPerKm = durationSec / 60 / distanceKm;
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return s === 60 ? `${m + 1}:00 /km` : `${m}:${String(s).padStart(2, "0")} /km`;
}

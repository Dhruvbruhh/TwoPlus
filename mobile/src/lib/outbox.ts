import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Sets logged while the gym floor has no signal.
 *
 * Only workout sets are queued: their write is an upsert keyed by
 * (session_id, set_number), so a replay can only ever rewrite the same set,
 * never add a second one. Bookings, measurements and money stay online-only.
 * The queue is per member and is cleared (after a warning) on sign-out.
 */
export type PendingSet = {
  sessionId: string;
  exerciseId: string | null;
  exerciseName: string;
  setNumber: number;
  reps: number;
  weightKg: number;
  queuedAt: number;
};

export const OUTBOX_PREFIX = "twoplus.outbox:";
export const OUTBOX_CAP = 50;
const key = (memberId: string) => OUTBOX_PREFIX + memberId;

/** Same set queued twice keeps the latest values: one intent per set. */
export function withPending(list: PendingSet[], input: Omit<PendingSet, "queuedAt">): PendingSet[] {
  const item: PendingSet = { ...input, queuedAt: Date.now() };
  const rest = list.filter((p) => !(p.sessionId === item.sessionId && p.setNumber === item.setNumber));
  if (rest.length >= OUTBOX_CAP) throw new Error(`Offline queue is full (${OUTBOX_CAP} sets). Reconnect to sync.`);
  return [...rest, item];
}

/** Sends in order and stops at the first failure, so order is preserved. */
export async function drain(list: PendingSet[], send: (p: PendingSet) => Promise<void>) {
  const left = [...list];
  while (left.length) {
    try {
      await send(left[0]);
    } catch (e) {
      return { left, error: e instanceof Error ? e.message : String(e) };
    }
    left.shift();
  }
  return { left, error: null as string | null };
}

/** A transport failure, as opposed to a policy or validation refusal. */
export function isNetworkError(message: string) {
  return /network|fetch|timed? ?out|offline|failed to connect|ECONN/i.test(message);
}

export async function readOutbox(memberId: string): Promise<PendingSet[]> {
  try {
    const raw = await AsyncStorage.getItem(key(memberId));
    return raw ? (JSON.parse(raw) as PendingSet[]) : [];
  } catch {
    return [];
  }
}

export async function writeOutbox(memberId: string, list: PendingSet[]) {
  if (list.length) await AsyncStorage.setItem(key(memberId), JSON.stringify(list));
  else await AsyncStorage.removeItem(key(memberId));
}

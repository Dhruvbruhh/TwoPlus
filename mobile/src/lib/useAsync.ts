import { useCallback, useEffect, useRef, useState } from "react";
import { cacheGet, cachePut } from "./offline";
import { savedAt } from "./format";

/** Every AsyncStorage key the offline fallback writes: `twoplus.cache:<screen>`. */
export const CACHE_PREFIX = "twoplus.cache:";

/**
 * One loader shape for every screen: data, error, initial spinner, pull-to-
 * refresh. Screens differ in what they fetch, not in how they show fetching.
 *
 * Late results are dropped by a generation counter, so a refresh that lands
 * after unmount cannot set state on a dead screen.
 *
 * Passing `cacheKey` turns on the gym-floor offline fallback: every success
 * is written to AsyncStorage, and a failed load serves the last good copy
 * with an honest, dated "offline" note instead of an error screen. The key is
 * stored under CACHE_PREFIX so sign-out and account deletion can wipe it;
 * callers scope it to the member (`home:<memberId>`).
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = [], cacheKey?: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const gen = useRef(0);
  const storeKey = cacheKey ? CACHE_PREFIX + cacheKey : null;

  const run = useCallback(
    async (mode: "initial" | "refresh") => {
      const mine = ++gen.current;
      if (mode === "refresh") setRefreshing(true);
      try {
        const next = await fn();
        if (mine !== gen.current) return;
        setData(next);
        setError(null);
        if (storeKey) void cachePut(storeKey, { at: Date.now(), value: next });
      } catch (e) {
        if (mine !== gen.current) return;
        const message = e instanceof Error ? e.message : "Something went wrong.";
        if (storeKey) {
          const cached = await cacheGet<{ at: number; value: T }>(storeKey);
          if (cached?.value != null && mine === gen.current) {
            setData(cached.value);
            setError(`Offline — showing your copy ${savedAt(cached.at)}. Figures may have changed since. (${message})`);
            return;
          }
        }
        setError(message);
      } finally {
        if (mine === gen.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    void run("initial");
    return () => {
      gen.current++;
    };
  }, [run]);

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => run("initial"),
    refresh: () => run("refresh"),
  };
}

import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Last-good-read cache, the mobile twin of the web app's offline-cache.ts.
 *
 * Gyms are exactly where phone signal dies: basement weights rooms, concrete
 * walls. Screens put their loaded payload here on success and read it back
 * when the network fails, so a member can always see their plan. Writes are
 * fire-and-forget on purpose: a full disk must never break a screen load.
 */
export async function cachePut(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: caching is best-effort by design.
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

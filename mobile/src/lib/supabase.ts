import { Env } from "./env";

/**
 * Supabase client for the member app.
 *
 * Storage: expo-secure-store encrypts at rest on iOS (Keychain) and Android
 * (Keystore). There is no fixed byte limit on stored values (the old 2048-byte
 * cap is gone from the library), and a Supabase session (access JWT + refresh
 * token + user object) is far larger than that anyway, so we keep the session
 * in one SecureStore key and let AsyncStorage hold nothing security-relevant.
 *
 * Detect session on web too: expo-secure-store has no web implementation, so
 * that platform falls back to localStorage. The web build exists only for
 * development preview; the shipping targets are the native binaries.
 */
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Some Android keystores (software-only emulators, some low-end phones) fail
 * to decrypt what they just encrypted ("Keystore operation failed"). Left
 * alone, every session read throws and the member is stuck signed in with no
 * data. The in-memory copy keeps this run working; an unreadable stored copy
 * is dropped so the next launch shows the login screen instead of an error.
 * shortcut: on such devices the session does not survive a restart; move to
 * an AsyncStorage + SecureStore-held AES key store if that becomes common.
 */
const memory = new Map<string, string>();

const secureStoreAdapter = {
  getItem: async (key: string) => {
    if (memory.has(key)) return memory.get(key) ?? null;
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      await SecureStore.deleteItemAsync(key).catch(() => {});
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    memory.set(key, value);
    await SecureStore.setItemAsync(key, value).catch(() => {});
  },
  removeItem: async (key: string) => {
    memory.delete(key);
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },
};

const webAdapter = {
  getItem: (key: string) =>
    Promise.resolve(globalThis.localStorage?.getItem(key) ?? null),
  setItem: (key: string, value: string) => {
    globalThis.localStorage?.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    globalThis.localStorage?.removeItem(key);
    return Promise.resolve();
  },
};

export const supabase = createClient(Env.supabaseUrl, Env.supabaseAnonKey, {
  auth: {
    storage: Platform.OS === "web" ? webAdapter : secureStoreAdapter,
    storageKey: "twoplus.session",
    autoRefreshToken: true,
    persistSession: true,
    // Native has no URL fragment to parse; the app drives every auth flow.
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

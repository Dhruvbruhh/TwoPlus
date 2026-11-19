import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { wipeLocalMemberData } from "./data";

/**
 * The member row behind a signed-in account.
 *
 * `members.user_id` is the link between an auth user and a gym membership.
 * Account claiming is a server-side RPC: during signup the trigger creates a
 * profile, and `claim_member_account()` stamps `user_id` on the member row
 * whose email matches the verified address. The app never writes that link
 * itself, which is what keeps one account from adopting another's records.
 */
export type Member = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  member_code: string | null;
  status: string;
  joined_on: string | null;
  date_of_birth: string | null;
  gender: string | null;
  trainer_id: string | null;
};

type AuthState = {
  /** False until the stored session has been read once. */
  ready: boolean;
  session: Session | null;
  member: Member | null;
  /** True when signed in but no gym has matched this email yet. */
  unclaimed: boolean;
  /** Set when the member lookup failed for a reason other than "not found". */
  error: string | null;
  /** Why the member landed on the login screen without asking to, if known. */
  notice: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshMember: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/** Password recovery completes on the web app, which owns /reset-password. */
const RESET_URL = "https://twoplus.fit/reset-password";
const LAST_USER_KEY = "twoplus.lastUser";

/**
 * A different account on this device must never be served the previous
 * member's cache, queued sets or meal log, even when the first one never
 * signed out (expired session, reinstall over backup).
 */
async function forgetPreviousUser(uid: string) {
  const last = await AsyncStorage.getItem(LAST_USER_KEY).catch(() => null);
  if (last && last !== uid) await wipeLocalMemberData();
  if (last !== uid) await AsyncStorage.setItem(LAST_USER_KEY, uid).catch(() => {});
}

const MEMBER_COLUMNS =
  "id, organization_id, first_name, last_name, email, phone, member_code, status, joined_on, date_of_birth, gender, trainer_id";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [unclaimed, setUnclaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const signingOut = React.useRef(false);

  /**
   * Resolve the member row for the current user.
   *
   * If no row is linked yet we try the claim RPC once. It is idempotent and
   * only ever touches a row with `user_id is null` and a matching email, so a
   * second call is harmless. A member who signed up with an email the gym
   * never recorded correctly stays unclaimed, and we surface that state
   * instead of showing an empty dashboard that looks like a bug.
   */
  const loadMember = useCallback(async (uid: string) => {
    setError(null);
    await forgetPreviousUser(uid);
    const first = await supabase
      .from("members")
      .select(MEMBER_COLUMNS)
      .eq("user_id", uid)
      .maybeSingle();

    if (first.error) {
      setError(first.error.message);
      setMember(null);
      setUnclaimed(false);
      return;
    }
    if (first.data) {
      setMember(first.data as Member);
      setUnclaimed(false);
      return;
    }

    const claim = await supabase.rpc("claim_member_account");
    if (claim.error && claim.error.code !== "PGRST202") {
      // A failed claim is not fatal: the account may simply not be a member.
      setError(null);
    }

    const second = await supabase
      .from("members")
      .select(MEMBER_COLUMNS)
      .eq("user_id", uid)
      .maybeSingle();

    if (second.data) {
      setMember(second.data as Member);
      setUnclaimed(false);
    } else {
      setMember(null);
      setUnclaimed(true);
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
      if (data.session?.user.id) void loadMember(data.session.user.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      if (next?.user.id) {
        setNotice(null);
        void loadMember(next.user.id);
      } else {
        // Signed out without the member asking: refresh token expired or was
        // revoked (password change, account deletion elsewhere).
        if (event === "SIGNED_OUT" && !signingOut.current) {
          setNotice("Your session ended. Sign in again to continue.");
        }
        setMember(null);
        setUnclaimed(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadMember]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) throw signInError;
  }, []);

  /**
   * Google sign-in via Supabase OAuth (PKCE).
   *
   * Web: full-page redirect to Google, Supabase bounces back to the origin.
   * Native: open the system browser ourselves with skipBrowserRedirect, wait
   * for the twoplus:// deep link, then exchange the returned code for a
   * session. The verifier lives in the same SecureStore-backed storage, so the
   * exchange is bound to this device.
   */
  const signInWithGoogle = useCallback(async () => {
    if (Platform.OS === "web") {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: globalThis.location?.origin ?? undefined },
      });
      if (error) throw error;
      return;
    }

    const redirectUrl = "twoplus://auth/callback";
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) throw new Error("Could not start Google sign-in.");

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
    if (result.type !== "success" || !("url" in result) || !result.url) {
      return; // User closed the browser; nothing to clean up.
    }
    const code = new URL(result.url).searchParams.get("code");
    if (!code) throw new Error("Google sign-in was cancelled or timed out.");
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: RESET_URL,
    });
    if (resetError) throw resetError;
  }, []);

  const signOut = useCallback(async () => {
    signingOut.current = true;
    await supabase.auth.signOut();
    signingOut.current = false;
    // The offline cache and on-device logs belong to the member, not the
    // phone: a shared device must not serve them to the next sign-in.
    await wipeLocalMemberData();
    setMember(null);
  }, []);

  const refreshMember = useCallback(async () => {
    if (session?.user.id) await loadMember(session.user.id);
  }, [session, loadMember]);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      member,
      unclaimed,
      error,
      notice,
      signIn,
      sendPasswordReset,
      signInWithGoogle,
      signOut,
      refreshMember,
    }),
    [ready, session, member, unclaimed, error, notice, signIn, sendPasswordReset, signInWithGoogle, signOut, refreshMember],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

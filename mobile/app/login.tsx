import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/lib/auth";
import { Backdrop, Button, T, ui } from "../src/components/ui";
import { color, glass, gutter, radius, space, type } from "../src/lib/theme";

/**
 * Sign in.
 *
 * Email + password (accounts are created by the gym or on the website) and
 * Google, which is delegated entirely to Supabase OAuth: the app only opens
 * the browser and receives the session back on the twoplus:// deep link.
 */
export default function LoginScreen() {
  const { signIn, signInWithGoogle, sendPasswordReset, notice } = useAuth();
  const [info, setInfo] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);

  async function google() {
    setGoogleBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      // On web this navigates away; on native the session lands via the
      // deep link and onAuthStateChange picks it up.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start Google sign-in.");
    } finally {
      setGoogleBusy(false);
    }
  }

  async function forgot() {
    const mail = email.trim();
    setInfo(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) {
      setError("Enter your email above first, then tap Forgot password.");
      return;
    }
    setError(null);
    try {
      await sendPasswordReset(mail);
      // Same message whether or not the address has an account.
      setInfo(`If ${mail} has an account, a reset link is on its way. Open it on this phone, set a new password on the TwoPlus site, then sign in here.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the reset email.");
    }
  }

  async function submit() {
    const mail = email.trim();
    if (!mail || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(mail, password);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not sign you in.";
      setError(
        /invalid login credentials/i.test(message)
          ? "That email and password do not match an account."
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.root}>
      <Backdrop />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={s.brand}>
              <View style={s.mark}>
                <T variant="h1" style={{ color: color.onAccent, letterSpacing: -1 }}>+</T>
              </View>
              <T variant="h1">TwoPlus</T>
            </View>

            <View style={s.card}>
              <T variant="h2">Sign in</T>
              <T variant="small" tone="muted" style={{ marginTop: 4 }}>
                Use the email your gym has on file.
              </T>

              <View style={{ gap: space.lg, marginTop: space.xxl }}>
                <View style={{ gap: space.sm }}>
                  <T variant="smallStrong" tone="muted">Email</T>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={color.textFaint}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    selectionColor={color.accentBright}
                    editable={!busy}
                    style={s.input}
                  />
                </View>

                <View style={{ gap: space.sm }}>
                  <T variant="smallStrong" tone="muted">Password</T>
                  <View style={s.passwordRow}>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Your password"
                      placeholderTextColor={color.textFaint}
                      secureTextEntry={!reveal}
                      autoCapitalize="none"
                      selectionColor={color.accentBright}
                      editable={!busy}
                      onSubmitEditing={submit}
                      style={[s.input, { flex: 1, borderWidth: 0, paddingRight: 0, backgroundColor: "transparent", boxShadow: "none" }]}
                    />
                    <Pressable
                      onPress={() => setReveal((v) => !v)}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={reveal ? "Hide password" : "Show password"}
                      style={{ paddingHorizontal: space.md }}
                    >
                      <Ionicons
                        name={reveal ? "eye-off-outline" : "eye-outline"}
                        size={19}
                        color={color.textFaint}
                      />
                    </Pressable>
                  </View>
                </View>

                {notice && !error ? (
                  <View style={[s.error, { backgroundColor: color.accentSoft }]}>
                    <Ionicons name="time-outline" size={16} color={color.accentText} />
                    <T variant="small" style={{ flex: 1 }}>{notice}</T>
                  </View>
                ) : null}

                {info ? (
                  <View style={[s.error, { backgroundColor: color.accentSoft }]} accessibilityLiveRegion="polite">
                    <Ionicons name="mail-outline" size={16} color={color.accentText} />
                    <T variant="small" style={{ flex: 1 }}>{info}</T>
                  </View>
                ) : null}

                {error ? (
                  <View style={s.error}>
                    <Ionicons name="alert-circle-outline" size={16} color={color.danger} />
                    <T variant="small" tone="danger" style={{ flex: 1 }}>
                      {error}
                    </T>
                  </View>
                ) : null}

                <Button label="Sign in" onPress={submit} loading={busy} />

                <Pressable
                  onPress={() => void forgot()}
                  disabled={busy}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={{ alignSelf: "center", minHeight: 44, justifyContent: "center" }}
                >
                  <T variant="smallStrong" tone="accent">Forgot password?</T>
                </Pressable>

                <View style={s.orRow}>
                  <View style={s.orLine} />
                  <T variant="caption" tone="faint">
                    or
                  </T>
                  <View style={s.orLine} />
                </View>

                <Pressable
                  onPress={google}
                  disabled={googleBusy || busy}
                  accessibilityRole="button"
                  accessibilityLabel="Sign in with Google"
                  style={({ pressed }) => [s.googleBtn, pressed && { opacity: 0.85 }]}
                >
                  {googleBusy ? (
                    <ActivityIndicator color={color.text} />
                  ) : (
                    <>
                      <Ionicons name="logo-google" size={19} color="#4285F4" />
                      <T variant="bodyStrong" style={{ color: color.text }}>
                        Continue with Google
                      </T>
                    </>
                  )}
                </Pressable>

                <T variant="caption" tone="faint" align="center" style={{ lineHeight: 17 }}>
                  No account yet? Ask your gym to add you, or sign up at twoplus.fit. Your
                  membership links to this email automatically.
                </T>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: gutter,
    gap: space.xxxl,
  },
  brand: { gap: space.sm, alignItems: "flex-start" },
  mark: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  card: {
    ...glass.bar,
    borderRadius: radius.xxl,
    borderCurve: "continuous",
    padding: space.xxl,
  },
  input: {
    ...glass.well,
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    color: color.text,
    ...type.body,
    fontFamily: ui.family.regular,
  },
  passwordRow: {
    ...glass.well,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
  },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: color.dangerSoft,
    borderRadius: radius.md,
    padding: space.md,
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  orLine: { flex: 1, height: 1, backgroundColor: color.line },
  googleBtn: {
    ...glass.control,
    minHeight: 52,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
  },
});

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getSupabase } from "@/lib/supabase";
import {
  attemptLockMs,
  clearAttempts,
  lockMessage,
  noteAttempt,
} from "@/lib/attempt-limit";
import { AuthLayout } from "./AuthLayout";

const GOOGLE_SVG = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12c-.2 2-1.5 5-4.5 7l6.9 5.4c4.1-3.8 6.7-9.4 6.7-15.7z"
    />
    <path
      fill="#34A853"
      d="M24 46c6 0 11-2 14.6-5.4l-6.9-5.4c-1.9 1.3-4.4 2.2-7.7 2.2-5.9 0-10.9-3.9-12.7-9.3l-7.3 5.6C7.7 41.2 15.3 46 24 46z"
    />
    <path
      fill="#FBBC05"
      d="M11.3 28.1c-.5-1.3-.8-2.7-.8-4.1s.3-2.8.7-4.1l-7.3-5.7C2.7 17.1 2 20.5 2 24s.7 6.9 2 9.7l7.3-5.6z"
    />
    <path
      fill="#EA4335"
      d="M24 10.6c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.2 30 2 24 2 15.3 2 7.7 6.8 4 14.2l7.3 5.7c1.8-5.4 6.8-9.3 12.7-9.3z"
    />
  </svg>
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LENGTH = 6;

// Six boxes, one logical value. Typing, pasting and backspace all move focus the
// way a person expects, and the boxes are plain inputs so a password manager and
// a screen reader see six labelled fields rather than one mystery box.
function CodeInput({
  value,
  onChange,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  invalid: boolean;
}) {
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "");

  const focusAt = (index: number) => {
    const el = boxes.current[Math.max(0, Math.min(CODE_LENGTH - 1, index))];
    el?.focus();
    el?.select();
  };

  return (
    <div className={invalid ? "auth-otp is-error" : "auth-otp"}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            boxes.current[index] = el;
          }}
          className="auth-otp-digit"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
          aria-invalid={invalid}
          maxLength={1}
          value={digit}
          disabled={disabled}
          style={{ animationDelay: `${index * 40}ms` }}
          onChange={(event) => {
            const typed = event.target.value.replace(/\D/g, "");
            if (!typed) return;
            const next = (value.slice(0, index) + typed + value.slice(index + 1)).slice(
              0,
              CODE_LENGTH,
            );
            onChange(next);
            focusAt(index + typed.length);
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace") {
              event.preventDefault();
              const next = digit ? value.slice(0, index) + value.slice(index + 1) : value.slice(0, index);
              onChange(next.padEnd(Math.min(value.length, CODE_LENGTH), "").slice(0, CODE_LENGTH));
              focusAt(digit ? index : index - 1);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              focusAt(index - 1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              focusAt(index + 1);
            }
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
            if (!pasted) return;
            event.preventDefault();
            onChange(pasted.slice(0, CODE_LENGTH));
            focusAt(pasted.length - 1);
          }}
        />
      ))}
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  // Set only when the account has a second factor enrolled: the password is
  // already accepted, so the code step upgrades the session rather than
  // re-checking it.
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");

  const needsCode = Boolean(factorId);

  useEffect(() => {
    if (needsCode) document.title = "TwoPlus — Verify it's you";
  }, [needsCode]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");

    if (needsCode) return verifyCode();

    const next: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email address.";
    if (!password) next.password = "Password is required.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const attemptKey = `login:${email.trim().toLowerCase()}`;
    const wait = attemptLockMs(attemptKey);
    if (wait > 0) {
      setFormError(lockMessage(wait));
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        noteAttempt(attemptKey);
        if (error.message.includes("Email not confirmed")) {
          setInfo("Please confirm your email first. Check your inbox for the verification link.");
        } else if (error.message.includes("Invalid login credentials")) {
          setFormError("Incorrect email or password.");
        } else {
          setFormError(error.message);
        }
        return;
      }
      if (!data.session) return;
      clearAttempts(attemptKey);

      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (level && level.nextLevel === "aal2" && level.currentLevel !== "aal2") {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totp = factors?.totp?.find((f) => f.status === "verified");
        if (totp) {
          setFactorId(totp.id);
          return;
        }
      }
      navigate("/home", { replace: true });
    } catch {
      setFormError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    if (code.length !== CODE_LENGTH) {
      setFormError(`Enter the ${CODE_LENGTH} digit code from your authenticator app.`);
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabase();
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) {
        setFormError(challengeError.message);
        return;
      }
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (error) {
        setFormError("That code is not right. Check the app and try the next one.");
        setCode("");
        return;
      }
      navigate("/home", { replace: true });
    } catch {
      setFormError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function useAnotherAccount() {
    await getSupabase().auth.signOut();
    setFactorId("");
    setCode("");
    setPassword("");
    setFormError("");
    setInfo("");
  }

  // Google sign-in is a full-page OAuth redirect: Supabase bounces the browser
  // through accounts.google.com and back to this origin with the session in
  // the URL fragment, which the client picks up (detectSessionInUrl).
  async function signInWithGoogle() {
    setFormError("");
    setLoading(true);
    try {
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        setFormError(error.message);
        setLoading(false);
      }
      // On success the browser navigates away; nothing else to do here.
    } catch {
      setFormError("Network error. Check your connection and try again.");
      setLoading(false);
    }
  }

  if (needsCode) {
    return (
      <AuthLayout
        wave
        glass
        title="Verify it's you"
        subtitle={`Enter the code from your authenticator app for ${email.trim()}.`}
      >
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          {formError && (
            <div className="auth-alert" role="alert">
              {formError}
            </div>
          )}
          <CodeInput value={code} onChange={setCode} disabled={loading} invalid={!!formError} />
          <p className="auth-otp-hint">
            Open your authenticator app and enter the six digit code. It changes every 30 seconds.
          </p>
          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Checking…" : "Verify and sign in"}
          </button>
          <div className="auth-row">
            <button type="button" className="auth-link" onClick={useAnotherAccount}>
              Use a different account
            </button>
            <span />
          </div>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      wave
      glass
      title="Welcome back"
      subtitle="Sign in to your gym workspace."
      footer={
        <>
          New to TwoPlus?{" "}
          <Link className="auth-link" to="/signup">
            Create an account
          </Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {formError && (
          <div className="auth-alert" role="alert">
            {formError}
          </div>
        )}
        {info && (
          <div className="auth-alert success" role="status">
            {info}
          </div>
        )}
        <label className="auth-field">
          Email address
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@gym.com"
            aria-invalid={!!errors.email}
          />
          {errors.email && <span className="auth-field-error">{errors.email}</span>}
        </label>
        <label className="auth-field">
          Password
          <span className="auth-input-wrap">
            <input
              className="input"
              type={reveal ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              aria-invalid={!!errors.password}
            />
            <button
              type="button"
              className="auth-reveal"
              onClick={() => setReveal((r) => !r)}
              aria-label={reveal ? "Hide password" : "Show password"}
            >
              {reveal ? "HIDE" : "SHOW"}
            </button>
          </span>
          {errors.password && <span className="auth-field-error">{errors.password}</span>}
        </label>
        <div className="auth-row">
          <span />
          <Link className="auth-link" to="/forgot-password">
            Forgot password?
          </Link>
        </div>
        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <div className="auth-divider" role="separator" aria-label="or">
          <span>or</span>
        </div>
        <button className="auth-google" type="button" onClick={signInWithGoogle} disabled={loading}>
          {GOOGLE_SVG}
          Continue with Google
        </button>
      </form>
    </AuthLayout>
  );
}

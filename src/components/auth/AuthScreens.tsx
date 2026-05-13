"use client";

// Login + Register screens — the two public auth surfaces. Both render
// full-screen 2-pane layouts, route-driven (not state-driven). Each one
// is invoked by its own route page; auth success redirects to /app via
// the `onSuccess` callback. Navigation between login ↔ register is also
// via callback so the parent route component decides whether to push,
// replace, or stay.

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useGoals } from "~/contexts/GoalsContext";
import { AnansiMark, BrandLockup, Wordmark } from "~/components/goals/Brand";
import toast from "react-hot-toast";

// Brand lockup that doubles as a back-to-landing link. Used in the
// corner of every auth screen so the brand is also the escape hatch.
function HomeLockup({ size = 22 }: { size?: number }) {
  return (
    <Link href="/" aria-label="Back to the landing page" style={{ display: "inline-block", textDecoration: "none" }}>
      <BrandLockup size={size} />
    </Link>
  );
}

// Shared field styles — kept colocated since these forms are the only
// callers and the visual treatment is specific to the auth chrome.
const fieldLabel = {
  display: "block",
  fontSize: 12,
  color: "var(--ink-2)",
  marginBottom: 6,
} as const;

const fieldInput: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  background: "var(--canvas)",
  border: "1px solid var(--hairline-2)",
  borderRadius: 10,
  fontSize: 14,
  color: "var(--ink)",
  outline: "none",
  fontFamily: "var(--font-ui)",
};

const fieldError = {
  marginTop: 6,
  fontSize: 12,
  color: "var(--rust)",
} as const;

const socialBtnStyle: React.CSSProperties = {
  width: "100%",
  height: 48,
  background: "var(--canvas)",
  border: "1px solid var(--hairline-2)",
  borderRadius: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  fontSize: 14,
  color: "var(--ink)",
  cursor: "pointer",
  marginBottom: 14,
  fontFamily: "var(--font-ui)",
};

export function LoginScreen({
  onSwitchToRegister,
  onSuccess,
}: {
  onSwitchToRegister: () => void;
  onSuccess?: () => void;
}) {
  const { authenticate } = useGoals();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Email and password, please.");
      return;
    }
    setSubmitting(true);
    const ok = await authenticate(email, password);
    setSubmitting(false);
    if (ok) {
      toast.success("Welcome back.");
      setError(false);
      onSuccess?.();
    } else {
      setError(true);
      toast.error("Those credentials didn't open the door.");
      setPassword("");
    }
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      {/* Brand panel — vellum, faint mark, kicker + display headline */}
      <div
        className="relative hidden overflow-hidden md:flex md:flex-col md:justify-between"
        style={{
          background: "var(--paper-deep)",
          borderRight: "1px solid var(--hairline)",
          padding: "64px 64px 56px",
        }}
      >
        <div style={{ position: "absolute", bottom: -160, left: -160, opacity: 0.06, color: "var(--ink)" }}>
          <AnansiMark size={520} strokeWidth={1} />
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <HomeLockup size={26} />
        </div>
        <div style={{ position: "relative", zIndex: 1, maxWidth: 460 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.18em",
              color: "var(--ink-3)",
              textTransform: "uppercase",
              marginBottom: 28,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <span style={{ width: 28, height: 1, background: "currentColor" }} />a place to talk about your life
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 60, lineHeight: 1.1, letterSpacing: "-0.025em" }}>
            Welcome back<span className="brand-em">.</span>
          </h1>
          <p
            style={{
              fontFamily: "var(--font-text)",
              fontStyle: "italic",
              fontSize: 19,
              color: "var(--ink-2)",
              marginTop: 20,
              lineHeight: 1.45,
            }}
          >
            The threads you left here are still here. Pick one up where you left it.
          </p>
        </div>
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            justifyContent: "space-between",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
        >
          <span>private by default</span>
          <span>encrypted</span>
          <span>no notifications</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center" style={{ padding: "64px 32px", background: "var(--paper)" }}>
        <div className="mb-6 flex justify-center md:hidden">
          <HomeLockup size={22} />
        </div>
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md">
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.1em",
              color: "var(--ink-3)",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Log in
          </div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 36,
              lineHeight: 1.1,
              marginBottom: 36,
              color: "var(--ink)",
            }}
          >
            Sign in to <Wordmark size={36} />
            <span className="brand-em">.</span>
          </h2>

          <button
            type="button"
            onClick={() => toast("Google sign-in coming later.", { icon: "🤝" })}
            style={socialBtnStyle}
          >
            <GoogleGlyph /> Continue with Google
          </button>
          <button
            type="button"
            onClick={() => toast("Apple sign-in coming later.", { icon: "🤝" })}
            style={{ ...socialBtnStyle, marginBottom: 24 }}
          >
            <AppleGlyph /> Continue with Apple
          </button>

          <div className="mb-5 flex items-center gap-3">
            <span style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
            <span style={{ fontFamily: "var(--font-text)", fontStyle: "italic", fontSize: 12, color: "var(--ink-3)" }}>
              or with email
            </span>
            <span style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
          </div>

          <label style={{ display: "block", marginBottom: 14 }}>
            <span style={fieldLabel}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@somewhere.com"
              required
              style={{ ...fieldInput, borderColor: error ? "var(--rust)" : "var(--hairline-2)" }}
            />
          </label>

          <label style={{ display: "block", marginBottom: 8 }}>
            <span style={{ ...fieldLabel, display: "flex", justifyContent: "space-between" }}>
              <span>Password</span>
              <button
                type="button"
                onClick={() => toast("Password reset coming soon.")}
                style={{
                  color: "var(--clay-deep)",
                  background: "transparent",
                  border: 0,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Forgot?
              </button>
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ ...fieldInput, borderColor: error ? "var(--rust)" : "var(--hairline-2)" }}
            />
            {error && (
              <p style={{ marginTop: 6, fontSize: 12, color: "var(--rust)" }}>
                Try that combination again, or reset your password.
              </p>
            )}
          </label>

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 24,
              width: "100%",
              height: 48,
              background: "var(--clay)",
              color: "var(--paper)",
              border: 0,
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 500,
              cursor: submitting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              opacity: submitting ? 0.7 : 1,
              transition: "background var(--dur-1) var(--ease)",
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Opening…
              </>
            ) : (
              <>
                Sign in <ArrowRight size={14} />
              </>
            )}
          </button>

          <p
            style={{
              fontFamily: "var(--font-text)",
              fontSize: 13,
              color: "var(--ink-3)",
              marginTop: 28,
              textAlign: "center",
            }}
          >
            New here?{" "}
            <button
              type="button"
              onClick={onSwitchToRegister}
              style={{
                color: "var(--clay-deep)",
                background: "transparent",
                border: 0,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Begin a year →
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

export function RegisterScreen({
  onSwitchToLogin,
  onSuccess,
}: {
  onSwitchToLogin: () => void;
  onSuccess?: () => void;
}) {
  const { register } = useGoals();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [agreed, setAgreed] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "What should we call you?";
    if (!email.trim()) next.email = "Email, please.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "That email doesn't look right.";
    if (!password) next.password = "Password, please.";
    else if (password.length < 12) next.password = "12 characters or more.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (!agreed) {
      toast.error("Please tick the agreement first.");
      return;
    }
    setSubmitting(true);
    try {
      const ok = await register(name.trim(), email.trim().toLowerCase(), password);
      if (ok) {
        toast.success(`Welcome, ${name.split(" ")[0]}. Your year begins.`);
        onSuccess?.();
      } else {
        toast.error("That email may already be in use.");
      }
    } catch {
      toast.error("Something went wrong. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  const passwordStrength = (() => {
    if (!password) return null;
    if (password.length < 12) return { label: "Short", color: "var(--rust)" };
    if (password.length < 16) return { label: "Good", color: "var(--amber)" };
    return { label: "Strong", color: "var(--moss)" };
  })();

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="flex flex-col justify-center" style={{ padding: "64px 32px", background: "var(--paper)" }}>
        <div className="mb-6 flex justify-center md:hidden">
          <HomeLockup size={22} />
        </div>
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md">
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.1em",
              color: "var(--ink-3)",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Begin a year
          </div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 40,
              lineHeight: 1.05,
              marginBottom: 12,
              color: "var(--ink)",
            }}
          >
            Make a <span className="brand-em">thinking surface.</span>
          </h2>
          <p
            style={{
              fontFamily: "var(--font-text)",
              fontStyle: "italic",
              fontSize: 16,
              color: "var(--ink-2)",
              marginBottom: 32,
              lineHeight: 1.5,
            }}
          >
            A few quiet details and you&apos;re in.
          </p>

          <label style={{ display: "block", marginBottom: 14 }}>
            <span style={fieldLabel}>What should we call you?</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your first name is enough"
              style={{ ...fieldInput, borderColor: errors.name ? "var(--rust)" : "var(--hairline-2)" }}
            />
            {errors.name && <p style={fieldError}>{errors.name}</p>}
          </label>

          <label style={{ display: "block", marginBottom: 14 }}>
            <span style={fieldLabel}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@somewhere.com"
              style={{ ...fieldInput, borderColor: errors.email ? "var(--rust)" : "var(--hairline-2)" }}
            />
            {errors.email && <p style={fieldError}>{errors.email}</p>}
          </label>

          <label style={{ display: "block", marginBottom: 24 }}>
            <span style={{ ...fieldLabel, display: "flex", justifyContent: "space-between" }}>
              <span>A password (12+ characters)</span>
              {passwordStrength && (
                <span style={{ color: passwordStrength.color, fontSize: 11 }}>{passwordStrength.label}</span>
              )}
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              style={{ ...fieldInput, borderColor: errors.password ? "var(--rust)" : "var(--hairline-2)" }}
            />
            {errors.password && <p style={fieldError}>{errors.password}</p>}
          </label>

          <label
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 24,
              fontSize: 13,
              color: "var(--ink-2)",
              lineHeight: 1.45,
              cursor: "pointer",
            }}
          >
            <button
              type="button"
              onClick={() => setAgreed((v) => !v)}
              aria-pressed={agreed}
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                background: agreed ? "var(--clay)" : "var(--canvas)",
                border: agreed ? "1px solid var(--clay)" : "1px solid var(--hairline-2)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 1,
                cursor: "pointer",
              }}
            >
              {agreed && <Check size={12} color="var(--paper)" />}
            </button>
            <span>
              I understand that anansi is a private space — not a backup of my mind, just a thinking surface I tend to.
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              height: 50,
              background: "var(--clay)",
              color: "var(--paper)",
              border: 0,
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 500,
              cursor: submitting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Beginning…
              </>
            ) : (
              <>
                Begin your year <ArrowRight size={14} />
              </>
            )}
          </button>

          <p
            style={{
              fontFamily: "var(--font-text)",
              fontSize: 13,
              color: "var(--ink-3)",
              marginTop: 20,
              textAlign: "center",
            }}
          >
            Already started?{" "}
            <button
              type="button"
              onClick={onSwitchToLogin}
              style={{
                color: "var(--clay-deep)",
                background: "transparent",
                border: 0,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Log in →
            </button>
          </p>
        </form>
      </div>

      {/* Ink testimonial panel — paper-on-ink, the single inverted register */}
      <div
        className="relative hidden overflow-hidden md:flex md:flex-col md:justify-between"
        style={{ background: "var(--surface-inverse)", color: "var(--on-inverse)", padding: "72px 64px" }}
      >
        <div style={{ position: "absolute", top: -120, right: -120, opacity: 0.08, color: "var(--on-inverse)" }}>
          <AnansiMark size={520} strokeWidth={1} />
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <span style={{ color: "var(--on-inverse)" }}>
            <HomeLockup size={22} />
          </span>
        </div>
        <div style={{ position: "relative", zIndex: 1, maxWidth: 460 }}>
          <div
            style={{
              fontFamily: "var(--font-brand)",
              fontStyle: "italic",
              fontSize: 72,
              color: "var(--clay)",
              lineHeight: 0.5,
              fontWeight: 500,
              marginBottom: 24,
            }}
          >
            “
          </div>
          <p
            style={{
              fontFamily: "var(--font-text)",
              fontStyle: "italic",
              fontSize: 22,
              lineHeight: 1.45,
              color: "var(--on-inverse)",
            }}
          >
            I used the People section to write down what I needed from my brother for ten years. We had the conversation
            a month later. He cried. I didn&apos;t know I knew it that clearly until it was on the page.
          </p>
          <div
            style={{
              marginTop: 28,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
              display: "flex",
              justifyContent: "space-between",
              paddingTop: 20,
              borderTop: "1px solid var(--hairline-2)",
            }}
          >
            <span>Engineer, 41</span>
            <span>1 year in</span>
          </div>
        </div>
        <div
          style={{
            position: "relative",
            zIndex: 1,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
        >
          Ananse Ntontan · Adinkra · Ghana
        </div>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.12-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.46 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 12.04c-.03-2.94 2.4-4.37 2.51-4.43-1.37-2-3.5-2.27-4.26-2.3-1.81-.19-3.55 1.07-4.47 1.07-.94 0-2.36-1.05-3.88-1.02-2 .03-3.84 1.16-4.86 2.95-2.07 3.6-.53 8.92 1.5 11.85.99 1.43 2.17 3.03 3.7 2.97 1.49-.06 2.05-.96 3.85-.96s2.3.96 3.87.93c1.6-.03 2.6-1.45 3.58-2.89.55-.85 1.13-1.79 1.53-2.83-3.92-1.48-3.97-3.31-3.97-3.34zM14.07 4.07c.82-1 1.37-2.39 1.22-3.78-1.18.05-2.6.79-3.45 1.79-.76.88-1.42 2.29-1.24 3.65 1.31.1 2.65-.66 3.47-1.66z" />
    </svg>
  );
}

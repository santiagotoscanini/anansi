"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GoalsProvider } from "~/contexts/GoalsContext";
import { setRecoveryPasswordAction } from "~/app/auth/actions";
import { api } from "~/trpc/react";
import { AnansiMark, BrandLockup } from "~/components/goals/Brand";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import LegalFooter from "~/components/LegalFooter";

function HomeLockup({ size = 22 }: { size?: number }) {
  const { t } = useTranslation();
  return (
    <Link href="/" aria-label={t("auth.homeAria")} style={{ display: "inline-block", textDecoration: "none" }}>
      <BrandLockup size={size} />
    </Link>
  );
}

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

// The recovery session is the one established by /auth/confirm after the
// user clicks the email link (verifyOtp + cookie set). We use the existing
// auth.me tRPC query to detect that session — no browser Supabase client
// involved. setRecoveryPasswordAction does the actual updateUser server-side.
function ResetPasswordInner() {
  const router = useRouter();
  const { t } = useTranslation();
  // `retry: false` so the loading-vs-expired flip happens immediately on
  // first 401 instead of churning through TanStack Query's default backoff.
  const meQuery = api.auth.me.useQuery(undefined, { retry: false });
  const checking = meQuery.isLoading;
  const hasSession = meQuery.isSuccess && !!meQuery.data;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 12) {
      toast.error(t("auth.reset.passwordShort"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.reset.passwordsDontMatch"));
      return;
    }
    setSubmitting(true);
    const result = await setRecoveryPasswordAction(password);
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t("auth.reset.success"));
    router.replace("/app");
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--paper)" }}>
        <Loader2 className="h-5 w-5 animate-spin text-[var(--ink-3)]" />
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="grid min-h-screen md:grid-cols-2">
        <div className="flex flex-col justify-center" style={{ padding: "64px 32px", background: "var(--paper)" }}>
          <div className="mx-auto w-full max-w-md">
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 30,
                lineHeight: 1.1,
                marginBottom: 16,
                color: "var(--ink)",
              }}
            >
              {t("auth.reset.expiredTitle")}
              <span className="brand-em">.</span>
            </h2>
            <p
              style={{
                fontFamily: "var(--font-text)",
                fontStyle: "italic",
                fontSize: 16,
                color: "var(--ink-2)",
                marginBottom: 24,
                lineHeight: 1.5,
              }}
            >
              {t("auth.reset.expiredBody")}
            </p>
            <Link
              href="/forgot-password"
              style={{
                display: "inline-block",
                padding: "12px 24px",
                background: "var(--clay)",
                color: "var(--paper)",
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              {t("auth.reset.sendNew")}
            </Link>
          </div>
        </div>
        <div className="hidden md:block" style={{ background: "var(--paper-deep)" }} />
      </div>
    );
  }

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
            {t("auth.reset.kicker")}
          </div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 36,
              lineHeight: 1.1,
              marginBottom: 16,
              color: "var(--ink)",
            }}
          >
            {t("auth.reset.title")}
            <span className="brand-em">.</span>
          </h2>
          <p
            style={{
              fontFamily: "var(--font-text)",
              fontStyle: "italic",
              fontSize: 15,
              color: "var(--ink-2)",
              marginBottom: 24,
              lineHeight: 1.5,
            }}
          >
            {t("auth.reset.body")}
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.reset.passwordPlaceholder")}
            autoComplete="new-password"
            required
            style={{ ...fieldInput, marginBottom: 12 }}
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("auth.reset.confirmPlaceholder")}
            autoComplete="new-password"
            required
            style={{ ...fieldInput, marginBottom: 20 }}
          />
          <button
            type="submit"
            disabled={submitting}
            style={{
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
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {t("auth.reset.saving")}
              </>
            ) : (
              <>
                {t("auth.reset.submit")} <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>
      </div>
      <div
        className="relative hidden overflow-hidden md:flex md:flex-col md:justify-between"
        style={{
          background: "var(--paper-deep)",
          borderLeft: "1px solid var(--hairline)",
          padding: "64px 64px 56px",
        }}
      >
        <div style={{ position: "absolute", bottom: -160, right: -160, opacity: 0.06, color: "var(--ink)" }}>
          <AnansiMark size={520} strokeWidth={1} />
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <HomeLockup size={26} />
        </div>
        <div />
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <GoalsProvider>
      <Toaster position="top-right" />
      <ResetPasswordInner />
      <LegalFooter />
    </GoalsProvider>
  );
}

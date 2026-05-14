"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GoalsProvider, useGoals } from "~/contexts/GoalsContext";
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

function ForgotPasswordInner() {
  const { sendPasswordReset } = useGoals();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      toast.error(t("auth.forgot.needEmail"));
      return;
    }
    setSubmitting(true);
    const { ok, error } = await sendPasswordReset(trimmed);
    setSubmitting(false);
    if (ok) {
      // Show success even if the email doesn't match a user — Supabase
      // returns success regardless, which prevents email enumeration. We
      // mirror that on our side instead of leaking whether the user exists.
      setSentTo(trimmed);
    } else {
      toast.error(error ?? t("auth.forgot.sendFailed"));
    }
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="flex flex-col justify-center" style={{ padding: "64px 32px", background: "var(--paper)" }}>
        <div className="mb-6 flex justify-center md:hidden">
          <HomeLockup size={22} />
        </div>
        <div className="mx-auto w-full max-w-md">
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
            {t("auth.forgot.kicker")}
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
            {sentTo ? t("auth.forgot.titleSent") : t("auth.forgot.title")}
            <span className="brand-em">.</span>
          </h2>

          {sentTo ? (
            <>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: "var(--canvas)",
                  border: "1px solid var(--hairline-2)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--ink-2)",
                  marginBottom: 24,
                }}
              >
                <Mail size={14} /> {sentTo}
              </div>
              <p
                style={{
                  fontFamily: "var(--font-text)",
                  fontStyle: "italic",
                  fontSize: 17,
                  color: "var(--ink-2)",
                  lineHeight: 1.5,
                  marginBottom: 28,
                }}
              >
                {t("auth.forgot.bodySent")}
              </p>
              <Link
                href="/login"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--font-ui)",
                  fontSize: 14,
                  color: "var(--clay-deep)",
                  textDecoration: "none",
                }}
              >
                <ArrowLeft size={14} /> {t("auth.forgot.back")}
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <p
                style={{
                  fontFamily: "var(--font-text)",
                  fontStyle: "italic",
                  fontSize: 16,
                  color: "var(--ink-2)",
                  marginBottom: 28,
                  lineHeight: 1.5,
                }}
              >
                {t("auth.forgot.body")}
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.common.emailPlaceholder")}
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
                    <Loader2 className="h-4 w-4 animate-spin" /> {t("auth.forgot.sending")}
                  </>
                ) : (
                  <>
                    {t("auth.forgot.submit")} <ArrowRight size={14} />
                  </>
                )}
              </button>
              <p
                style={{
                  fontFamily: "var(--font-text)",
                  fontSize: 13,
                  color: "var(--ink-3)",
                  marginTop: 24,
                  textAlign: "center",
                }}
              >
                {t("auth.forgot.remembered")}{" "}
                <Link href="/login" style={{ color: "var(--clay-deep)", fontWeight: 500, textDecoration: "none" }}>
                  {t("auth.forgot.signIn")}
                </Link>
              </p>
            </form>
          )}
        </div>
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

export default function ForgotPasswordPage() {
  return (
    <GoalsProvider>
      <Toaster position="top-right" />
      <ForgotPasswordInner />
      <LegalFooter />
    </GoalsProvider>
  );
}

"use client";

// Public marketing landing page — port of Landing.html from the Anansi
// design bundle. Six chapters: hero, manifesto, six surfaces, look
// inside (Pulse mockup), whispers, why-the-spider, pricing, closing
// card + colophon footer.
//
// Auth-aware: the top-right CTA flips between "Log in" (logged out) and
// "Go to app →" (logged in). All inbound CTAs route through GoalsProvider
// so the auth.me cookie check resolves correctly.
//
// i18n: prose lives in src/i18n/locales/{en,es}.json under the `landing`
// namespace. Sentences that mix neutral text + brand-emphasis spans use
// `<Trans>` with NAMED component placeholders (em, em1, em2 …) so a
// translator can reorder Spanish word order without touching code.

import Link from "next/link";
import { ArrowRight, Heart, Shield, Clock, Plus } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { GoalsProvider, useGoals } from "~/contexts/GoalsContext";
import { AnansiMark, BrandLockup } from "~/components/goals/Brand";

// Surfaces in display order. Each entry pairs a stable `key` (used to
// resolve translations under `landing.surfaces.items.<key>.*`) with the
// visual props that don't translate (color token + SVG icon).
type SurfaceKey = "pulse" | "self" | "objectives" | "people" | "values" | "bucket";

const SURFACES: { key: SurfaceKey; color: string; icon: React.ReactNode }[] = [
  {
    key: "pulse",
    color: "clay",
    icon: (
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12h4l3-8 4 16 3-8h4" />
      </svg>
    ),
  },
  {
    key: "self",
    color: "moss",
    icon: (
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="10" r="3" />
        <path d="M6.5 19a6 6 0 0 1 11 0" />
      </svg>
    ),
  },
  {
    key: "objectives",
    color: "plum",
    icon: (
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="12" cy="18" r="2.5" />
        <path d="M7.7 7.8L10.6 16.2M16.3 7.8l-2.9 8.4M8.5 6h7" />
      </svg>
    ),
  },
  {
    key: "people",
    color: "indigo",
    icon: (
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" />
      </svg>
    ),
  },
  {
    key: "values",
    color: "amber",
    icon: (
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-1.5-1-2-1-3 0-1 1-1 2-1h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8z" />
        <circle cx="7.5" cy="11.5" r="1" fill="currentColor" />
        <circle cx="11.5" cy="7.5" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: "bucket",
    color: "rust",
    icon: (
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 19l6-11 4 7 2-3 6 7H3z" />
      </svg>
    ),
  },
];

type WhisperKey = "designer" | "engineer" | "therapist" | "founder" | "writer" | "director";

const WHISPERS: { key: WhisperKey; dark?: boolean; compact?: boolean }[] = [
  { key: "designer" },
  { key: "engineer", dark: true },
  { key: "therapist", compact: true },
  { key: "founder", compact: true },
  { key: "writer", dark: true },
  { key: "director", compact: true },
];

// Manifesto "isn't" list. Each row resolves to a strike-through label +
// pithy body line. We index into the translated array by position so a
// Spanish translator can rewrite each row freely without touching code.
type IsntEntry = readonly [strike: string, body: string];

function LandingPageInner() {
  const { isAuthenticated } = useGoals();
  const { t } = useTranslation();
  const ctaHref = isAuthenticated ? "/app" : "/register";
  const loginHref = isAuthenticated ? "/app" : "/login";
  const loginLabel = isAuthenticated ? t("landing.nav.goToApp") : t("landing.nav.logIn");

  // Manifesto isn't list — `returnObjects` resolves the JSON array. Fall
  // back to an empty array if the locale entry isn't an array (defensive
  // against a half-edited locale file).
  const isntRows = t("landing.manifesto.isnt", { returnObjects: true }) as unknown as IsntEntry[];

  return (
    <div style={{ background: "var(--paper)", color: "var(--ink)", minHeight: "100vh" }}>
      {/* ============ NAV ============ */}
      <nav className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-6 md:px-16 md:py-6">
        <BrandLockup size={26} />
        <div className="flex items-center gap-4 md:gap-7">
          <a
            href="#philosophy"
            className="hidden text-sm transition-colors md:inline"
            style={{ color: "var(--ink-2)" }}
          >
            {t("landing.nav.philosophy")}
          </a>
          <a href="#surfaces" className="hidden text-sm transition-colors md:inline" style={{ color: "var(--ink-2)" }}>
            {t("landing.nav.whatsInside")}
          </a>
          <a href="#whispers" className="hidden text-sm transition-colors md:inline" style={{ color: "var(--ink-2)" }}>
            {t("landing.nav.whispers")}
          </a>
          <a href="#pricing" className="hidden text-sm transition-colors md:inline" style={{ color: "var(--ink-2)" }}>
            {t("landing.nav.pricing")}
          </a>
          <Link
            href={loginHref}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition-colors"
            style={{ background: "var(--ink)", color: "var(--paper)" }}
          >
            {loginLabel}
            <ArrowRight size={11} />
          </Link>
        </div>
      </nav>

      <main>
        {/* ============ HERO ============ */}
        <section className="relative overflow-hidden px-6 pb-24 pt-8 md:px-16 md:pb-32 md:pt-14">
          {/* Faint web at 4.5% opacity in the top-right */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: -100,
              right: -160,
              opacity: 0.045,
              color: "var(--ink)",
              pointerEvents: "none",
            }}
          >
            <AnansiMark size={780} strokeWidth={1} />
          </div>

          <div className="relative mx-auto max-w-[1280px]">
            <Eyebrow>{t("landing.hero.eyebrow")}</Eyebrow>

            <h1
              className="mt-9"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 128,
                fontWeight: 400,
                lineHeight: 0.96,
                letterSpacing: "-0.03em",
                maxWidth: 1100,
              }}
            >
              {t("landing.hero.title1")}
              <br />
              {t("landing.hero.title2")}
              <br />
              {t("landing.hero.title3")}
              <br />
              <Trans i18nKey="landing.hero.title4" components={{ em: <BrandEm /> }} />
            </h1>

            <p
              className="mt-9"
              style={{
                fontFamily: "var(--font-text)",
                fontStyle: "italic",
                fontSize: 26,
                lineHeight: 1.32,
                color: "var(--ink-2)",
                maxWidth: 760,
              }}
            >
              {t("landing.hero.lead")}
            </p>

            <p
              className="mt-10"
              style={{
                fontFamily: "var(--font-text)",
                fontSize: 17,
                lineHeight: 1.6,
                color: "var(--ink-2)",
                maxWidth: 560,
              }}
            >
              {t("landing.hero.body")}
            </p>

            <div className="mt-11 flex flex-wrap items-center gap-4">
              <Link
                href={ctaHref}
                className="inline-flex h-[50px] items-center gap-2.5 rounded-full px-7 text-sm font-medium transition-colors"
                style={{ background: "var(--ink)", color: "var(--paper)" }}
              >
                {isAuthenticated ? t("landing.hero.ctaSignedIn") : t("landing.hero.ctaSignedOut")}
                <ArrowRight size={14} />
              </Link>
              <a
                href="#philosophy"
                className="inline-flex h-[50px] items-center gap-2 px-3.5 text-sm transition-colors"
                style={{ color: "var(--ink-2)" }}
              >
                {t("landing.hero.readPhilosophy")}
              </a>
            </div>

            <div
              className="mt-16 flex flex-wrap gap-x-9 gap-y-3"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--ink-3)",
              }}
            >
              <span className="inline-flex items-center gap-2.5">
                <Heart className="h-3 w-3" /> {t("landing.hero.badgePrivate")}
              </span>
              <span className="inline-flex items-center gap-2.5">
                <Shield className="h-3 w-3" /> {t("landing.hero.badgeEncrypted")}
              </span>
              <span className="inline-flex items-center gap-2.5">
                <Clock className="h-3 w-3" /> {t("landing.hero.badgeLongArc")}
              </span>
              <span className="inline-flex items-center gap-2.5">
                <Plus className="h-3 w-3" /> {t("landing.hero.badgeNoNotifications")}
              </span>
            </div>
          </div>
        </section>

        {/* ============ I · MANIFESTO ============ */}
        <section id="philosophy" className="px-6 py-24 md:px-16">
          <div className="mx-auto max-w-[1280px]">
            <ChapterHead
              chapter={t("landing.manifesto.chapter")}
              title={
                <>
                  {t("landing.manifesto.title1")}
                  <br />
                  <Trans i18nKey="landing.manifesto.title2" components={{ em: <BrandEm /> }} />
                </>
              }
            >
              {t("landing.manifesto.intro")}
            </ChapterHead>

            <div
              className="grid grid-cols-1 gap-20 pt-8 md:grid-cols-2"
              style={{ borderTop: "1px solid var(--hairline-2)" }}
            >
              <div>
                <h3
                  className="mb-6"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 34,
                    fontWeight: 400,
                    letterSpacing: "-0.015em",
                    color: "var(--clay-deep)",
                  }}
                >
                  {t("landing.manifesto.isntHeading")}
                </h3>
                <ul className="m-0 list-none p-0">
                  {isntRows.map(([strike, body], i) => (
                    <li
                      key={i}
                      className="relative py-3.5 pl-7"
                      style={{
                        fontFamily: "var(--font-text)",
                        fontSize: 19,
                        lineHeight: 1.45,
                        color: "var(--ink-2)",
                        borderBottom: i === isntRows.length - 1 ? "none" : "1px solid var(--hairline)",
                      }}
                    >
                      <span style={{ position: "absolute", left: 0, color: "var(--ink-4)" }}>—</span>
                      <span
                        style={{
                          textDecoration: "line-through",
                          textDecorationColor: "var(--ink-4)",
                          textDecorationThickness: 1,
                        }}
                      >
                        {strike}
                      </span>{" "}
                      — {body}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3
                  className="mb-6"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 34,
                    fontWeight: 400,
                    letterSpacing: "-0.015em",
                    color: "var(--ink)",
                  }}
                >
                  {t("landing.manifesto.isHeading")}
                </h3>
                <p
                  className="mb-4"
                  style={{ fontFamily: "var(--font-text)", fontSize: 19, lineHeight: 1.6, color: "var(--ink)" }}
                >
                  <Trans i18nKey="landing.manifesto.isBody1" components={{ em: <BrandEm /> }} />
                </p>
                <p
                  className="mb-4"
                  style={{ fontFamily: "var(--font-text)", fontSize: 19, lineHeight: 1.6, color: "var(--ink)" }}
                >
                  <Trans i18nKey="landing.manifesto.isBody2" components={{ em: <BrandEm /> }} />
                </p>
                <p style={{ fontFamily: "var(--font-text)", fontSize: 19, lineHeight: 1.6, color: "var(--ink)" }}>
                  {t("landing.manifesto.isBody3")}
                </p>
                <blockquote
                  className="mt-8 px-7 py-6"
                  style={{
                    background: "var(--canvas)",
                    borderLeft: "2px solid var(--clay)",
                    borderRadius: "0 14px 14px 0",
                    fontFamily: "var(--font-text)",
                    fontStyle: "italic",
                    fontSize: 18,
                    color: "var(--ink-2)",
                    lineHeight: 1.5,
                  }}
                >
                  {t("landing.manifesto.quote")}
                  <cite
                    className="mt-2.5 block"
                    style={{
                      fontStyle: "normal",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--ink-3)",
                    }}
                  >
                    {t("landing.manifesto.quoteCite")}
                  </cite>
                </blockquote>
              </div>
            </div>
          </div>
        </section>

        {/* ============ II · SIX SURFACES ============ */}
        <section id="surfaces" className="px-6 py-24 md:px-16">
          <div className="mx-auto max-w-[1280px]">
            <ChapterHead chapter={t("landing.surfaces.chapter")} title={<>{t("landing.surfaces.title")}</>}>
              {t("landing.surfaces.intro")}
            </ChapterHead>

            <div
              className="grid grid-cols-1 overflow-hidden md:grid-cols-3"
              style={{
                gap: 1,
                background: "var(--hairline)",
                border: "1px solid var(--hairline)",
                borderRadius: 22,
              }}
            >
              {SURFACES.map((s, i) => (
                <div
                  key={s.key}
                  className="relative flex min-h-[320px] flex-col gap-3.5 transition-colors"
                  style={{ background: "var(--canvas)", padding: "40px 36px 36px" }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 24,
                      right: 28,
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      color: "var(--ink-4)",
                      textTransform: "uppercase",
                    }}
                  >
                    {String(i + 1).padStart(3, "0")}
                  </span>
                  <div
                    className="mb-1 flex h-14 w-14 items-center justify-center"
                    style={{ borderRadius: 14, background: "var(--paper-deep)", color: "var(--ink)" }}
                  >
                    {s.icon}
                  </div>
                  <h4
                    className="flex items-center"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 28,
                      lineHeight: 1.1,
                      letterSpacing: "-0.015em",
                    }}
                  >
                    <span
                      className="mr-3 inline-block h-2 w-2 rounded-full"
                      style={{ background: `var(--${s.color})` }}
                    />
                    {t(`landing.surfaces.items.${s.key}.name`)}
                  </h4>
                  <div
                    style={{
                      fontFamily: "var(--font-text)",
                      fontStyle: "italic",
                      fontSize: 14,
                      color: "var(--ink-3)",
                      marginTop: -8,
                    }}
                  >
                    {t(`landing.surfaces.items.${s.key}.cap`)}
                  </div>
                  <p style={{ fontFamily: "var(--font-text)", fontSize: 15, lineHeight: 1.55, color: "var(--ink-2)" }}>
                    {t(`landing.surfaces.items.${s.key}.body`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ IV · WHISPERS ============ */}
        <section id="whispers" className="px-6 py-24 md:px-16">
          <div className="mx-auto max-w-[1280px]">
            <ChapterHead
              chapter={t("landing.whispers.chapter")}
              title={
                <>
                  {t("landing.whispers.title1")}
                  <br />
                  <Trans i18nKey="landing.whispers.title2" components={{ em: <BrandEm /> }} />
                </>
              }
            >
              {t("landing.whispers.intro")}
            </ChapterHead>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {WHISPERS.map((w) => (
                <Whisper key={w.key} whisperKey={w.key} dark={w.dark} compact={w.compact} />
              ))}
            </div>

            <p
              className="mt-12"
              style={{
                fontFamily: "var(--font-text)",
                fontStyle: "italic",
                fontSize: 14,
                lineHeight: 1.55,
                color: "var(--ink-3)",
                maxWidth: 720,
              }}
            >
              <span className="mr-2.5 inline-block h-px w-4 align-middle" style={{ background: "var(--ink-4)" }} />
              {t("landing.whispers.disclaimer")}
            </p>
          </div>
        </section>

        {/* ============ V · WHY THE SPIDER ============ */}
        <section className="px-6 py-24 md:px-16">
          <div className="mx-auto max-w-[1280px]">
            <div className="grid grid-cols-1 items-center gap-20 md:grid-cols-[1.1fr_1fr]">
              <div
                className="relative mx-auto flex aspect-square max-w-[440px] items-center justify-center"
                style={{ position: "relative" }}
              >
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: -20,
                    background:
                      "radial-gradient(circle, color-mix(in oklch, var(--clay) 14%, transparent) 0%, transparent 70%)",
                    filter: "blur(20px)",
                    zIndex: 0,
                  }}
                />
                <span style={{ position: "relative", zIndex: 1 }}>
                  <AnansiMark size={380} strokeWidth={1.5} />
                </span>
              </div>

              <div>
                <Eyebrow>{t("landing.spider.eyebrow")}</Eyebrow>
                <h2
                  className="mt-6"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 56,
                    fontWeight: 400,
                    lineHeight: 1.03,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {t("landing.spider.titlePre")} <BrandEm>{t("landing.spider.titleEm")}</BrandEm>
                </h2>
                <p
                  className="mt-6"
                  style={{ fontFamily: "var(--font-text)", fontSize: 19, lineHeight: 1.6, color: "var(--ink-2)" }}
                >
                  <Trans i18nKey="landing.spider.body1" components={{ em: <BrandEm /> }} />
                </p>
                <p
                  className="mt-6"
                  style={{ fontFamily: "var(--font-text)", fontSize: 19, lineHeight: 1.6, color: "var(--ink-2)" }}
                >
                  <Trans i18nKey="landing.spider.body2" components={{ em: <BrandEm /> }} />
                </p>
                <div
                  className="mt-7 flex gap-6 pt-4"
                  style={{
                    borderTop: "1px solid var(--hairline)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--ink-3)",
                  }}
                >
                  <span style={{ color: "var(--clay-deep)" }}>{t("landing.spider.symbol")}</span>
                  <span>{t("landing.spider.lineage")}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ VI · PRICING ============ */}
        <section id="pricing" className="px-6 py-24 md:px-16">
          <div className="mx-auto max-w-[1280px]">
            <ChapterHead
              chapter={t("landing.pricing.chapter")}
              title={
                <>
                  {t("landing.pricing.title1")}
                  <br />
                  <Trans i18nKey="landing.pricing.title2" components={{ em: <BrandEm /> }} />
                </>
              }
            >
              {t("landing.pricing.intro")}
            </ChapterHead>

            <div className="grid max-w-[920px] grid-cols-1 gap-5 md:grid-cols-2">
              <PricingCard
                title={t("landing.pricing.year.title")}
                badge={t("landing.pricing.year.badge")}
                badgeKind="eyebrow"
                price="$72"
                per={t("landing.pricing.year.perYear")}
                blurb={t("landing.pricing.year.blurb")}
                features={[
                  t("landing.pricing.year.feature1"),
                  t("landing.pricing.year.feature2"),
                  t("landing.pricing.year.feature3"),
                  t("landing.pricing.year.feature4"),
                ]}
                cta={t("landing.pricing.year.cta")}
                ctaHref={ctaHref}
                primary
              />
              <PricingCard
                title={t("landing.pricing.lifetime.title")}
                badge={t("landing.pricing.lifetime.badge")}
                badgeKind="tag-clay"
                price="$240"
                per={t("landing.pricing.lifetime.perOnce")}
                blurb={t("landing.pricing.lifetime.blurb")}
                features={[
                  t("landing.pricing.lifetime.feature1"),
                  t("landing.pricing.lifetime.feature2"),
                  t("landing.pricing.lifetime.feature3"),
                  t("landing.pricing.lifetime.feature4"),
                ]}
                cta={t("landing.pricing.lifetime.cta")}
                ctaHref={ctaHref}
                deep
              />
            </div>

            <p
              className="mt-8"
              style={{
                fontFamily: "var(--font-text)",
                fontStyle: "italic",
                fontSize: 14,
                lineHeight: 1.55,
                color: "var(--ink-3)",
                maxWidth: 720,
              }}
            >
              <span className="mr-2.5 inline-block h-px w-4 align-middle" style={{ background: "var(--ink-4)" }} />
              {t("landing.pricing.comp")}
            </p>
          </div>
        </section>

        {/* ============ CLOSING CARD ============ */}
        <section className="px-6 pb-24 md:px-16">
          <div className="mx-auto max-w-[1280px]">
            <div
              className="md:px-18 relative overflow-hidden px-12 py-24 md:py-24"
              style={{ background: "var(--surface-inverse)", color: "var(--on-inverse)", borderRadius: 32 }}
            >
              <div
                aria-hidden
                style={{ position: "absolute", top: -100, right: -100, opacity: 0.07, color: "var(--on-inverse)" }}
              >
                <AnansiMark size={480} strokeWidth={1} />
              </div>
              <div className="relative">
                <div
                  className="mb-6"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "oklch(0.82 0.012 75)",
                  }}
                >
                  {t("landing.coda.kicker")}
                </div>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 84,
                    fontWeight: 400,
                    lineHeight: 1.0,
                    letterSpacing: "-0.02em",
                    maxWidth: 920,
                  }}
                >
                  {t("landing.coda.titlePre")}
                  <br />
                  {t("landing.coda.titleMid")}{" "}
                  <span style={{ fontFamily: "var(--font-brand)", fontStyle: "italic", color: "var(--clay)" }}>
                    {t("landing.coda.titleEm")}
                  </span>
                </h2>
                <p
                  className="mt-7"
                  style={{
                    fontFamily: "var(--font-text)",
                    fontStyle: "italic",
                    fontSize: 22,
                    lineHeight: 1.4,
                    color: "oklch(0.82 0.012 75)",
                    maxWidth: 660,
                  }}
                >
                  {t("landing.coda.body")}
                </p>
                <div className="mt-12 flex flex-wrap items-center gap-3.5">
                  <Link
                    href={ctaHref}
                    className="inline-flex h-[52px] items-center gap-2.5 rounded-full px-7 text-sm font-medium transition-colors"
                    style={{ background: "var(--clay)", color: "var(--paper)" }}
                  >
                    {isAuthenticated ? t("landing.coda.ctaSignedIn") : t("landing.coda.ctaSignedOut")}
                    <ArrowRight size={14} />
                  </Link>
                  {!isAuthenticated && (
                    <Link
                      href="/login"
                      className="inline-flex h-[52px] items-center gap-2.5 rounded-full px-7 text-sm font-medium transition-colors"
                      style={{
                        border: "1px solid rgba(255,253,247,0.18)",
                        color: "var(--paper)",
                      }}
                    >
                      {t("landing.coda.haveAccount")}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ============ COLOPHON ============ */}
      <footer
        className="mx-auto grid max-w-[1440px] grid-cols-1 gap-12 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-16"
        style={{ borderTop: "1px solid var(--hairline-2)" }}
      >
        <div>
          <div className="mb-3.5">
            <BrandLockup size={22} />
          </div>
          <p
            style={{
              fontFamily: "var(--font-text)",
              fontStyle: "italic",
              fontSize: 14,
              color: "var(--ink-3)",
              lineHeight: 1.55,
            }}
          >
            {t("landing.footer.tagline")}
          </p>
        </div>
        <ColophonCol heading={t("landing.footer.headingApp")}>
          <a href="#philosophy">{t("landing.footer.appPhilosophy")}</a>
          <a href="#surfaces">{t("landing.footer.appSurfaces")}</a>
          <a href="#whispers">{t("landing.footer.appWhispers")}</a>
          <a href="#pricing">{t("landing.footer.appPricing")}</a>
        </ColophonCol>
        <ColophonCol heading={t("landing.footer.headingTeam")}>
          <a href="#">{t("landing.footer.teamAbout")}</a>
          <a href="#">{t("landing.footer.teamContact")}</a>
          <a href="#">{t("landing.footer.teamChangelog")}</a>
          <a href="#">{t("landing.footer.teamPress")}</a>
        </ColophonCol>
        {/* Font family names are proper nouns — left untranslated by design. */}
        <ColophonCol heading={t("landing.footer.headingSetIn")}>
          {/* eslint-disable-next-line i18next/no-literal-string -- typeface name (proper noun) */}
          <span>Cormorant Garamond</span>
          {/* eslint-disable-next-line i18next/no-literal-string -- typeface name (proper noun) */}
          <span>Instrument Serif</span>
          {/* eslint-disable-next-line i18next/no-literal-string -- typeface name (proper noun) */}
          <span>Newsreader</span>
          {/* eslint-disable-next-line i18next/no-literal-string -- typeface name (proper noun) */}
          <span>Geist · Geist Mono</span>
        </ColophonCol>
        <div
          className="col-span-full mt-8 flex flex-wrap items-center justify-between gap-3 pt-6"
          style={{
            borderTop: "1px solid var(--hairline)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            color: "var(--ink-3)",
            textTransform: "uppercase",
          }}
        >
          <span>{t("landing.footer.copy", { year: new Date().getFullYear() })}</span>
          <span>{t("landing.footer.lineage")}</span>
        </div>
      </footer>
    </div>
  );
}

// ---- Helper presentational components ----

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-3.5"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
      }}
    >
      <span className="inline-block h-px w-7" style={{ background: "currentColor" }} />
      {children}
    </span>
  );
}

function BrandEm({ children }: { children?: React.ReactNode }) {
  return (
    <em
      style={{
        fontFamily: "var(--font-brand)",
        fontStyle: "italic",
        fontWeight: 500,
        color: "var(--clay-deep)",
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </em>
  );
}

function ChapterHead({
  chapter,
  title,
  children,
}: {
  chapter: string;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-14 max-w-[800px]">
      <Eyebrow>{chapter}</Eyebrow>
      <h2
        className="mt-6"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 60,
          fontWeight: 400,
          lineHeight: 1.03,
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h2>
      <p
        className="mt-5"
        style={{
          fontFamily: "var(--font-text)",
          fontSize: 20,
          lineHeight: 1.5,
          color: "var(--ink-2)",
          fontStyle: "italic",
        }}
      >
        {children}
      </p>
    </div>
  );
}

function Whisper({
  whisperKey,
  dark = false,
  compact = false,
}: {
  whisperKey: WhisperKey;
  dark?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex min-h-[320px] flex-col gap-4 px-8 py-9"
      style={{
        background: dark ? "var(--surface-inverse)" : "var(--canvas)",
        // hairline-2 reads as a subtle border on both the inverted
        // (dark in light mode / paper-deep in dark mode) and canvas
        // surfaces without the rgba hardcode that didn't theme-flip.
        border: dark ? "1px solid var(--hairline-2)" : "1px solid var(--hairline)",
        borderRadius: 20,
        color: dark ? "var(--on-inverse)" : undefined,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-brand)",
          fontStyle: "italic",
          fontSize: 64,
          lineHeight: 0.6,
          color: "var(--clay)",
          fontWeight: 500,
        }}
      >
        “
      </div>
      <p
        style={{
          fontFamily: "var(--font-text)",
          fontStyle: "italic",
          fontSize: compact ? 17 : 19,
          lineHeight: 1.5,
          color: dark ? "var(--on-inverse)" : "var(--ink)",
        }}
      >
        {t(`landing.whispers.items.${whisperKey}.body`)}
      </p>
      <div
        className="mt-auto flex justify-between pt-5"
        style={{
          borderTop: "1px solid var(--hairline)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          // Tertiary text — ink-3 is the right value on both light-mode
          // dark-ink and dark-mode paper-deep surfaces.
          color: "var(--ink-3)",
        }}
      >
        <span>{t(`landing.whispers.items.${whisperKey}.who`)}</span>
        <span>{t(`landing.whispers.items.${whisperKey}.duration`)}</span>
      </div>
    </div>
  );
}

function PricingCard({
  title,
  badge,
  badgeKind,
  price,
  per,
  blurb,
  features,
  cta,
  ctaHref,
  primary,
  deep,
}: {
  title: string;
  badge: string;
  badgeKind: "eyebrow" | "tag-clay";
  price: string;
  per: string;
  blurb: string;
  features: string[];
  cta: string;
  ctaHref: string;
  primary?: boolean;
  deep?: boolean;
}) {
  return (
    <div
      className="px-8 py-9"
      style={{
        background: deep ? "var(--paper-deep)" : "var(--canvas)",
        border: "1px solid var(--hairline)",
        borderRadius: 14,
      }}
    >
      <div className="mb-2 flex items-baseline justify-between">
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 32 }}>{title}</h3>
        {badgeKind === "eyebrow" ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
            }}
          >
            {badge}
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{ background: "var(--clay-soft)", color: "var(--clay-deep)", fontSize: 11, fontWeight: 500 }}
          >
            {badge}
          </span>
        )}
      </div>
      <div
        className="mt-3"
        style={{ fontFamily: "var(--font-display)", fontSize: 56, lineHeight: 1, letterSpacing: "-0.02em" }}
      >
        {price}
        <span className="ml-1.5" style={{ fontSize: 18, color: "var(--ink-3)", fontFamily: "var(--font-ui)" }}>
          {per}
        </span>
      </div>
      <div
        className="mt-2"
        style={{ fontFamily: "var(--font-text)", fontStyle: "italic", color: "var(--ink-3)", fontSize: 14 }}
      >
        {blurb}
      </div>
      <ul className="my-7 list-none p-0">
        {features.map((f, i) => (
          <li
            key={i}
            style={{
              fontFamily: "var(--font-text)",
              fontSize: 16,
              color: "var(--ink-2)",
              padding: "8px 0",
              borderBottom: i === features.length - 1 ? "none" : "1px solid var(--hairline)",
            }}
          >
            {f}
          </li>
        ))}
      </ul>
      <Link
        href={ctaHref}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors"
        style={{
          background: primary ? "var(--clay)" : "transparent",
          color: primary ? "var(--paper)" : "var(--ink)",
          border: primary ? "0" : "1px solid var(--ink)",
        }}
      >
        {cta}
      </Link>
    </div>
  );
}

function ColophonCol({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <h6
        className="mb-3.5"
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
          fontWeight: 500,
        }}
      >
        {heading}
      </h6>
      <div className="flex flex-col gap-1.5" style={{ fontSize: 13, color: "var(--ink-2)" }}>
        {children}
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <GoalsProvider>
      <LandingPageInner />
    </GoalsProvider>
  );
}

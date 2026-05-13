"use client";

// Public marketing landing page — port of Landing.html from the Anansi
// design bundle. Six chapters: hero, manifesto, six surfaces, look
// inside (Pulse mockup), whispers, why-the-spider, pricing, closing
// card + colophon footer.
//
// Auth-aware: the top-right CTA flips between "Log in" (logged out) and
// "Go to app →" (logged in). All inbound CTAs route through GoalsProvider
// so the auth.me cookie check resolves correctly.

import Link from "next/link";
import { ArrowRight, Heart, Shield, Clock, Plus } from "lucide-react";
import { GoalsProvider, useGoals } from "~/contexts/GoalsContext";
import { AnansiMark, BrandLockup } from "~/components/goals/Brand";

function LandingPageInner() {
  const { isAuthenticated } = useGoals();
  const ctaHref = isAuthenticated ? "/app" : "/register";
  const loginHref = isAuthenticated ? "/app" : "/login";
  const loginLabel = isAuthenticated ? "Go to app" : "Log in";

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
            Philosophy
          </a>
          <a href="#surfaces" className="hidden text-sm transition-colors md:inline" style={{ color: "var(--ink-2)" }}>
            What&apos;s inside
          </a>
          <a href="#whispers" className="hidden text-sm transition-colors md:inline" style={{ color: "var(--ink-2)" }}>
            Whispers
          </a>
          <a href="#pricing" className="hidden text-sm transition-colors md:inline" style={{ color: "var(--ink-2)" }}>
            Pricing
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
            <Eyebrow>The place to talk about your life · with yourself first</Eyebrow>

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
              A quiet place
              <br />
              for what you want,
              <br />
              who you love,
              <br />
              and <BrandEm>who you&apos;re becoming.</BrandEm>
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
              anansi is the journal you&apos;d write if your journal could see the threads between things.
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
              Goals that know which values they answer to. People you tend to, not manage. Reflections that compound,
              week after week. One thinking surface for the long arc of a life.
            </p>

            <div className="mt-11 flex flex-wrap items-center gap-4">
              <Link
                href={ctaHref}
                className="inline-flex h-[50px] items-center gap-2.5 rounded-full px-7 text-sm font-medium transition-colors"
                style={{ background: "var(--ink)", color: "var(--paper)" }}
              >
                {isAuthenticated ? "Go to your app" : "Begin a year"}
                <ArrowRight size={14} />
              </Link>
              <a
                href="#philosophy"
                className="inline-flex h-[50px] items-center gap-2 px-3.5 text-sm transition-colors"
                style={{ color: "var(--ink-2)" }}
              >
                Read the philosophy →
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
                <Heart className="h-3 w-3" /> Private by default
              </span>
              <span className="inline-flex items-center gap-2.5">
                <Shield className="h-3 w-3" /> End-to-end encrypted
              </span>
              <span className="inline-flex items-center gap-2.5">
                <Clock className="h-3 w-3" /> Built for the long arc
              </span>
              <span className="inline-flex items-center gap-2.5">
                <Plus className="h-3 w-3" /> No notifications, ever
              </span>
            </div>
          </div>
        </section>

        {/* ============ I · MANIFESTO ============ */}
        <section id="philosophy" className="px-6 py-24 md:px-16">
          <div className="mx-auto max-w-[1280px]">
            <ChapterHead
              chapter="Chapter I · the shape of it"
              title={
                <>
                  Not a tracker.
                  <br />
                  <BrandEm>A thinking surface.</BrandEm>
                </>
              }
            >
              Every app built around &quot;your goals&quot; eventually becomes a guilt machine. anansi makes a different
              bet — that the things worth tending are too slow for streaks, and too quiet for notifications.
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
                  It isn&apos;t
                </h3>
                <ul className="m-0 list-none p-0">
                  {[
                    ["A habit tracker", "Streaks turn rest into failure."],
                    ["A productivity tool", "More done isn't the goal."],
                    ["A contact manager", "People aren't records."],
                    ["A journal you forget to write in", "Empty pages are okay here."],
                    ["A growth-hacked feed", "No streaks, no badges, no nudges."],
                  ].map(([strike, body], i) => (
                    <li
                      key={i}
                      className="relative py-3.5 pl-7"
                      style={{
                        fontFamily: "var(--font-text)",
                        fontSize: 19,
                        lineHeight: 1.45,
                        color: "var(--ink-2)",
                        borderBottom: i === 4 ? "none" : "1px solid var(--hairline)",
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
                  It is
                </h3>
                <p
                  className="mb-4"
                  style={{ fontFamily: "var(--font-text)", fontSize: 19, lineHeight: 1.6, color: "var(--ink)" }}
                >
                  A place to write down what you want and notice <BrandEm>which threads pull at which.</BrandEm> A
                  reflection-only Personal CRM that asks not &quot;when did I last contact them&quot; but &quot;what do
                  I want to repair?&quot; A Self page that&apos;s a portrait, not a profile.
                </p>
                <p
                  className="mb-4"
                  style={{ fontFamily: "var(--font-text)", fontSize: 19, lineHeight: 1.6, color: "var(--ink)" }}
                >
                  Empty fields read as clean pages. The system computes which goal is now <BrandEm>important</BrandEm>{" "}
                  from the threads you&apos;ve drawn. Tasks promote themselves toward you as their deadline approaches.
                </p>
                <p style={{ fontFamily: "var(--font-text)", fontSize: 19, lineHeight: 1.6, color: "var(--ink)" }}>
                  anansi is what you&apos;d build for yourself if you trusted slow software.
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
                  &quot;Built for the long arc, not the dopamine hit.&quot;
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
                    — the first line we wrote
                  </cite>
                </blockquote>
              </div>
            </div>
          </div>
        </section>

        {/* ============ II · SIX SURFACES ============ */}
        <section id="surfaces" className="px-6 py-24 md:px-16">
          <div className="mx-auto max-w-[1280px]">
            <ChapterHead chapter="Chapter II · six surfaces" title={<>Six places to put a thought.</>}>
              Each one has a different shape because the kinds of thinking it holds are different. A goal is not a
              person. A value is not a task. A weekly note is not a bucket-list item.
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
                  key={s.name}
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
                    {s.name}
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
                    {s.cap}
                  </div>
                  <p style={{ fontFamily: "var(--font-text)", fontSize: 15, lineHeight: 1.55, color: "var(--ink-2)" }}>
                    {s.body}
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
              chapter="Chapter IV · whispers"
              title={
                <>
                  What people say,
                  <br />
                  <BrandEm>quietly.</BrandEm>
                </>
              }
            >
              anansi holds the things you don&apos;t say out loud. So when people talk about it, they tend to whisper.
              We asked. Here&apos;s what they wrote back — anonymous, as they wanted.
            </ChapterHead>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {WHISPERS.map((w, i) => (
                <Whisper key={i} {...w} />
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
              We don&apos;t publish identifying details. anansi is the kind of software where most users would rather
              not be named — and we&apos;d rather earn quiet trust than loud reach.
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
                <Eyebrow>Chapter V · the name</Eyebrow>
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
                  Why a <BrandEm>spider?</BrandEm>
                </h2>
                <p
                  className="mt-6"
                  style={{ fontFamily: "var(--font-text)", fontSize: 19, lineHeight: 1.6, color: "var(--ink-2)" }}
                >
                  anansi is named after the West African spider-trickster — keeper of stories, weaver of webs. The mark
                  you&apos;ve seen throughout this page is <BrandEm>Ananse Ntontan,</BrandEm> the Adinkra symbol for the
                  spider&apos;s web. It stands for <BrandEm>wisdom, creativity, and the complexity of life.</BrandEm>
                </p>
                <p
                  className="mt-6"
                  style={{ fontFamily: "var(--font-text)", fontSize: 19, lineHeight: 1.6, color: "var(--ink-2)" }}
                >
                  The metaphor isn&apos;t decorative. anansi is a graph: every goal connects to other goals, to values,
                  to people, to tasks, to the weekly reflection that sits over all of them. Pull on one thread and the
                  others move. The whole point is to <BrandEm>see the threads.</BrandEm>
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
                  <span style={{ color: "var(--clay-deep)" }}>Ananse Ntontan</span>
                  <span>Adinkra · Ghana · Akan</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ VI · PRICING ============ */}
        <section id="pricing" className="px-6 py-24 md:px-16">
          <div className="mx-auto max-w-[1280px]">
            <ChapterHead
              chapter="Chapter VI · pricing"
              title={
                <>
                  One price.
                  <br />
                  <BrandEm>A year at a time.</BrandEm>
                </>
              }
            >
              anansi is a yearly subscription, not a monthly one — because the things this app holds move on the scale
              of years, not weeks. Start any time. Cancel any time. We won&apos;t email you.
            </ChapterHead>

            <div className="grid max-w-[920px] grid-cols-1 gap-5 md:grid-cols-2">
              <PricingCard
                title="A year"
                badge="most chosen"
                badgeKind="eyebrow"
                price="$72"
                per="/ year"
                blurb="$6 a month, paid once. Cancel any time, no questions."
                features={[
                  "All six surfaces · unlimited goals · unlimited people",
                  "Yearly review · self-portrait history",
                  "Encrypted backups · one-click export",
                  "Quiet by design — no nudges, no email digest",
                ]}
                cta="Begin your year →"
                ctaHref={ctaHref}
                primary
              />
              <PricingCard
                title="A lifetime"
                badge="limited"
                badgeKind="tag-clay"
                price="$240"
                per="/ once"
                blurb="Three years of use, paid up front. After that — yours."
                features={[
                  "Everything in A Year",
                  "All future surfaces, forever",
                  "Founder’s badge in your profile · one free gift year",
                  "Direct line to the team for feature requests",
                ]}
                cta="Begin a lifetime →"
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
              Students, hospice workers, therapists: it&apos;s free for you. Write us from your institutional email.
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
                  Coda
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
                  The life you&apos;d write down,
                  <br />
                  if you trusted{" "}
                  <span style={{ fontFamily: "var(--font-brand)", fontStyle: "italic", color: "var(--clay)" }}>
                    slow software.
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
                  This is a quiet app. It won&apos;t pull at you. It&apos;ll be there when you come back.
                </p>
                <div className="mt-12 flex flex-wrap items-center gap-3.5">
                  <Link
                    href={ctaHref}
                    className="inline-flex h-[52px] items-center gap-2.5 rounded-full px-7 text-sm font-medium transition-colors"
                    style={{ background: "var(--clay)", color: "var(--paper)" }}
                  >
                    {isAuthenticated ? "Go to your app" : "Begin your year"}
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
                      I already have an account
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
            A quiet place for goals, relationships, and values. Built for the long arc of a life.
          </p>
        </div>
        <ColophonCol heading="The app">
          <a href="#philosophy">Philosophy</a>
          <a href="#surfaces">The six surfaces</a>
          <a href="#whispers">Whispers</a>
          <a href="#pricing">Pricing</a>
        </ColophonCol>
        <ColophonCol heading="The team">
          <a href="#">About us</a>
          <a href="#">Contact</a>
          <a href="#">Changelog</a>
          <a href="#">Press</a>
        </ColophonCol>
        <ColophonCol heading="Set in">
          <span>Cormorant Garamond</span>
          <span>Instrument Serif</span>
          <span>Newsreader</span>
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
          <span>© {new Date().getFullYear()} anansi · Privacy · Terms</span>
          <span>Ananse Ntontan · Adinkra · Ghana</span>
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

function BrandEm({ children }: { children: React.ReactNode }) {
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
  body,
  who,
  duration,
  dark = false,
  compact = false,
}: {
  body: string;
  who: string;
  duration: string;
  dark?: boolean;
  compact?: boolean;
}) {
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
        &ldquo;
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
        {body}
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
        <span>{who}</span>
        <span>{duration}</span>
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

// ---- Static content ----

const SURFACES = [
  {
    name: "Pulse",
    color: "clay",
    cap: "the at-a-glance heartbeat",
    body: "What's the week asking of you, right now. Tracking items to fill in. Upcoming bids to make. Next month's horizon, quietly visible underneath.",
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
    name: "Self",
    color: "moss",
    cap: "a living portrait, not a tracker",
    body: "This-year shape. My story. How I love, apologize, fight, stress. The patterns I'm catching gently. Released. Just for me. A page you write for yourself, not anyone else.",
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
    name: "Objectives",
    color: "plum",
    cap: "a graph of what you want, weighted",
    body: "Goals as cards on a free-positioned canvas. Connections carry weight. Importance is computed, not declared. Look at the canvas and the heaviness shows you where to look.",
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
    name: "People",
    color: "indigo",
    cap: "a reflection surface — not a rolodex",
    body: "No phone numbers, no last-contacted timer. Per person: appreciation, my needs, legacy message, next bids, the dates that matter. To-process · exploring · long-term · context-bound.",
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
    name: "Values",
    color: "amber",
    cap: "the why beneath the what",
    body: "Named, colored tags that ride along with goals. Each value carries its own behavior list — short evidence sentences for what living this value looks like, this week.",
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
    name: "Bucket List",
    color: "rust",
    cap: "the things to do before dying",
    body: "Tag each item with the people you want to do it with. Not a checklist of trophies — a list of moments you'd grieve not having tried.",
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

const WHISPERS = [
  {
    body: "It's the first place I've written anything down where I don't feel watched by a streak. I missed three weeks and it didn't punish me. I came back because I wanted to.",
    who: "Designer, 34",
    duration: "4 months in",
  },
  {
    body: "I used the People section to write down what I needed from my brother for ten years. We had the conversation a month later. He cried. I didn't know I knew it that clearly until it was on the page.",
    who: "Engineer, 41",
    duration: "1 year in",
    dark: true,
  },
  {
    body: "It is the only app I've ever used that doesn't make me feel slightly worse about myself when I open it. I open it more.",
    who: "Therapist, 52",
    duration: "8 months in",
    compact: true,
  },
  {
    body: "My goals don't feel like a checklist anymore. They feel like questions I'm asking myself. The weight thing — where importance is just visible — changed how I think about ambition.",
    who: "Founder, 29",
    duration: "6 months in",
    compact: true,
  },
  {
    body: "The Self page is something I'd never have written by myself. The prompts are gentle. “How do I apologize.” “How I love when I love well.” I'd never have asked. I'm glad someone did.",
    who: "Writer, 38",
    duration: "1 year in",
    dark: true,
  },
  {
    body: "I run a 40-person team. anansi is the only software I have that's just for me. That distinction matters more than I expected.",
    who: "Director, 46",
    duration: "2 years in",
    compact: true,
  },
];

export default function LandingPage() {
  return (
    <GoalsProvider>
      <LandingPageInner />
    </GoalsProvider>
  );
}

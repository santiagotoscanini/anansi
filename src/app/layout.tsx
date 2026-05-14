import "~/styles/globals.css";
import { Suspense, type PropsWithChildren } from "react";
import { cookies } from "next/headers";
import { Cormorant_Garamond, Instrument_Serif, Newsreader, Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react";
import { TRPCProvider } from "~/trpc/react";
import ThemeSync from "~/components/ThemeSync";
import I18nProvider from "~/i18n/Provider";
import { STORAGE_KEY as LOCALE_COOKIE, FALLBACK_LOCALE, coerceLocale } from "~/i18n/constants";
import LocaleQueryParam from "~/i18n/LocaleQueryParam";

// The Anansi type stack. Five typefaces, each playing a single role:
//   brand   — italic Cormorant Garamond is the wordmark + inline accent
//   display — Instrument Serif handles page headlines
//   text    — Newsreader is the warm body serif for prose
//   ui      — Geist is the sans-serif everywhere else
//   mono    — Geist Mono for eyebrows, dates, and quiet citations
// Each next/font declares a CSS var globals.css reads via var(--font-…).
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["italic", "normal"],
  variable: "--font-cormorant",
  display: "swap",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["italic", "normal"],
  variable: "--font-instrument-serif",
  display: "swap",
});
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["italic", "normal"],
  variable: "--font-newsreader",
  display: "swap",
});
const geist = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-geist",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
  display: "swap",
});

// Theme bootstrap previously lived here as a raw <script> in <head> so the
// warm-cream → coffee-dark swap happened before first paint. Removed because
// React 19 warns about any <script> element in the rendered tree (including
// next/script's <Script strategy="beforeInteractive">), and the warning is
// noisy in dev. Result: dark-mode users see a brief light flash on initial
// paint before ThemeSync (client) reads localStorage and flips data-theme.
// For true flash-free theming, refactor to cookie-based: ThemeSync writes
// the resolved theme to a cookie; this layout reads it via `next/headers`
// and renders `<html data-theme={cookie}>` directly. Same pattern would
// also handle SSR-correct locale for anonymous users.

export default async function RootLayout({ children }: PropsWithChildren) {
  const fontClass = [
    cormorant.variable,
    instrumentSerif.variable,
    newsreader.variable,
    geist.variable,
    geistMono.variable,
  ].join(" ");

  // SSR-correct locale: read the `anansi:locale` cookie that the client
  // mirrors on every i18n.changeLanguage (via the detector's `caches`
  // config). I18nProvider applies it synchronously before the first render
  // commits, so the SSR output and the client hydration agree from the
  // start — no "Looking for your threads…" → "Buscando tus hilos…" flicker.
  const cookieStore = await cookies();
  const initialLocale = coerceLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  const htmlLang = initialLocale ?? FALLBACK_LOCALE;

  return (
    <html className={`h-full ${fontClass}`} lang={htmlLang} data-theme="light" suppressHydrationWarning>
      <body className="h-full">
        <ThemeSync />
        <I18nProvider initialLocale={initialLocale}>
          {/* `?locale=es` override for shareable links. Wrapped in Suspense
              because useSearchParams requires it in App Router; the component
              renders null either way. Mounted inside I18nProvider so it can
              call i18n.changeLanguage via useTranslation. */}
          <Suspense fallback={null}>
            <LocaleQueryParam />
          </Suspense>
          <TRPCProvider>{children}</TRPCProvider>
        </I18nProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}

export const metadata = {
  title: "anansi",
  description: "A thinking surface for what you want, who you love, and who you're becoming.",
};

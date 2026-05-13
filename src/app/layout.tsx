import "~/styles/globals.css";
import type { PropsWithChildren } from "react";
import { Cormorant_Garamond, Instrument_Serif, Newsreader, Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react";
import { TRPCProvider } from "~/trpc/react";
import ThemeSync from "~/components/ThemeSync";

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

// Theme bootstrap — runs synchronously before paint so the warm-cream
// → coffee-dark swap happens without a flash. Reads an explicit user
// preference from localStorage (`anansi:theme` = "light" | "dark" |
// "system"); falls back to the OS `prefers-color-scheme` query. The
// useTheme hook in `~/lib/theme.ts` keeps it live while the tab is
// open and writes the user's choice back to localStorage.
const themeBootScript = `(() => {
  try {
    const stored = localStorage.getItem('anansi:theme');
    const pref = stored === 'light' || stored === 'dark' ? stored : null;
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', pref ?? system);
  } catch { /* SSR or storage blocked — leave default */ }
})();`;

export default function RootLayout({ children }: PropsWithChildren) {
  const fontClass = [
    cormorant.variable,
    instrumentSerif.variable,
    newsreader.variable,
    geist.variable,
    geistMono.variable,
  ].join(" ");
  return (
    <html className={`h-full ${fontClass}`} lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="h-full">
        {/* Listens to prefers-color-scheme and flips data-theme without
            a reload. The inline boot script in <head> handles the
            first-paint value. */}
        <ThemeSync />
        <TRPCProvider>{children}</TRPCProvider>
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

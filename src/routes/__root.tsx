import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { Toaster } from 'react-hot-toast'
import { z } from 'zod'

import ThemeSync from '~/components/ThemeSync'
import LocaleQueryParam from '~/i18n/LocaleQueryParam'
import I18nProvider from '~/i18n/Provider'
import { FALLBACK_LOCALE, SUPPORTED_LOCALES, coerceLocale } from '~/i18n/constants'
import { ensureLocaleLoaded } from '~/i18n/resources'
import { getShellPrefs } from '~/server/fn/shell.fn'

// Order matters: fonts.css declares the five --font-* variables that
// globals.css immediately reads to build --font-brand/display/text/ui/mono.
import fontsCss from '~/styles/fonts.css?url'
import globalsCss from '~/styles/globals.css?url'
// The faces the first screen is set in, fetched with the stylesheet instead of
// after it, so they usually land before the first paint.
import cormorantItalicUrl from '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff2?url'
import geistUrl from '@fontsource/geist/files/geist-latin-400-normal.woff2?url'
import geistMediumUrl from '@fontsource/geist/files/geist-latin-500-normal.woff2?url'
import geistMonoUrl from '@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2?url'
import instrumentUrl from '@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url'
import instrumentItalicUrl from '@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2?url'
import newsreaderItalicUrl from '@fontsource/newsreader/files/newsreader-latin-400-italic.woff2?url'
import newsreaderUrl from '@fontsource/newsreader/files/newsreader-latin-400-normal.woff2?url'

// The QueryClient is provided by getRouter() and flows through every route's
// context, so loaders can call queryClient.ensureQueryData(...).
export interface RouterContext {
  queryClient: QueryClient
}

// `?locale=es` override for shareable links. Under Next this was a client
// component reading useSearchParams inside a Suspense boundary; here it is a
// typed search param on the root route, so every route inherits it and
// LocaleQueryParam can read it through the router instead.
const rootSearchSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES.map((l) => l.code) as [string, ...string[]]).optional(),
})

export const Route = createRootRouteWithContext<RouterContext>()({
  validateSearch: rootSearchSchema,
  // `?locale=` participates in the loader so the SERVER renders the requested
  // language. Without this the param was applied only after hydration, which
  // meant a shared /?locale=es link server-rendered English, hydrated English,
  // then re-rendered Spanish — a hydration mismatch React repairs by
  // regenerating the tree, and a page crawlers only ever see in English.
  loaderDeps: ({ search }) => ({ locale: search.locale }),
  // Translations are code-split per language, so the bundle has to be in the
  // i18next store before anything calls t(). On the server this loader is that
  // guarantee; on the client the same guarantee is src/client.tsx, which awaits
  // the chunk before hydrateRoot (this loader does not re-run on hydration).
  loader: async ({ deps }) => {
    const prefs = await getShellPrefs()
    // Query param beats cookie: it is the more specific, more recent intent.
    const initialLocale = coerceLocale(deps.locale) ?? prefs.locale
    await ensureLocaleLoaded(initialLocale ?? FALLBACK_LOCALE)
    return { initialLocale, initialTheme: prefs.theme, initialSidebar: prefs.sidebar }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'anansi' },
      {
        name: 'description',
        content: "A thinking surface for what you want, who you love, and who you're becoming.",
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'anansi' },
      {
        property: 'og:description',
        content: "A quiet place for what you want, who you love, and who you're becoming.",
      },
    ],
    links: [
      ...[
        instrumentUrl,
        instrumentItalicUrl,
        cormorantItalicUrl,
        newsreaderUrl,
        newsreaderItalicUrl,
        geistUrl,
        geistMediumUrl,
        geistMonoUrl,
      ].map((href) => ({
        rel: 'preload',
        as: 'font',
        type: 'font/woff2',
        href,
        crossOrigin: 'anonymous' as const,
      })),
      { rel: 'stylesheet', href: fontsCss },
      { rel: 'stylesheet', href: globalsCss },
      { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/icon.png', type: 'image/png' },
      { rel: 'apple-touch-icon', href: '/apple-icon.png' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { initialLocale, initialTheme } = Route.useLoaderData()

  return (
    // `data-theme` comes from the `anansi:theme-resolved` cookie that ThemeSync
    // writes on every theme change, so a returning dark-mode visitor is served
    // dark markup and never sees the warm-cream → coffee-dark flash. Falls back
    // to light only when there is no cookie to read — a first visit, or the
    // first load after the OS theme changed while they were away. ThemeSync
    // corrects those on the same paint and leaves a cookie for next time.
    //
    // `data-locale-explicit` distinguishes "the server was told which language
    // to use" (?locale= or a cookie) from "the server fell back to en". They
    // both render lang="en" when English, so the attribute is the only way
    // src/client.tsx can tell whether it is free to apply a stored localStorage
    // preference — applying it in the explicit case would silently override the
    // link the visitor just followed.
    <html
      className="h-full"
      lang={initialLocale ?? FALLBACK_LOCALE}
      data-locale-explicit={initialLocale ? '' : undefined}
      data-theme={initialTheme ?? 'light'}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>
      <body className="h-full">
        <ThemeSync />
        <I18nProvider initialLocale={initialLocale}>
          {/* Applies `?locale=es` on any URL. Must be INSIDE I18nProvider —
              it reaches i18next through useTranslation. Under Next this
              needed a <Suspense> wrapper because it read useSearchParams;
              here `locale` is a typed search param on this route, so it
              reads from the router and needs no boundary. */}
          <LocaleQueryParam />
          {children}
          {/* Mounted once for the whole app. Under Next this was repeated in
              three separate page files; a single root-level Toaster is the
              behaviour react-hot-toast actually expects. */}
          <Toaster position="bottom-right" />
        </I18nProvider>
        <Scripts />
      </body>
    </html>
  )
}

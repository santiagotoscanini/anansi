import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { Toaster } from 'react-hot-toast'
import { z } from 'zod'

import ThemeSync from '~/components/ThemeSync'
import I18nProvider from '~/i18n/Provider'
import { FALLBACK_LOCALE, SUPPORTED_LOCALES } from '~/i18n/constants'
import { getInitialLocale } from '~/server/fn/locale.fn'

// Order matters: fonts.css declares the five --font-* variables that
// globals.css immediately reads to build --font-brand/display/text/ui/mono.
import fontsCss from '~/styles/fonts.css?url'
import globalsCss from '~/styles/globals.css?url'

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
  loader: () => getInitialLocale(),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'anansi' },
      {
        name: 'description',
        content: "A thinking surface for what you want, who you love, and who you're becoming.",
      },
    ],
    links: [
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
  const initialLocale = Route.useLoaderData()

  return (
    // `data-theme="light"` is the SSR default; ThemeSync flips it after
    // hydration from localStorage / prefers-color-scheme. That means dark-mode
    // users still see a brief light flash on first paint — the same known
    // defect documented in src/app/layout.tsx, carried over deliberately so
    // this phase changes nothing visible. Phase 4c fixes it properly with a
    // theme cookie, which is only possible now that the shell can read
    // request headers.
    <html className="h-full" lang={initialLocale ?? FALLBACK_LOCALE} data-theme="light" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="h-full">
        <ThemeSync />
        <I18nProvider initialLocale={initialLocale}>
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

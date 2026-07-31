import { useState, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'

import i18n from './config'
import { FALLBACK_LOCALE, SUPPORTED_LOCALES, type Locale } from './constants'

// Locale handshake between the server render and client hydration.
//
// `initialLocale` is the validated `anansi:locale` cookie, read server-side by
// the root route's loader. Applying it through `useState`'s initializer means it
// lands once, before the first render commits, so the SSR pass and the matching
// hydration agree on the language. No flash, no mismatch warning.
//
// **The server gets its own instance; the client uses the singleton.**
//
// i18next's default export is a module singleton, and `changeLanguage` mutates
// it. On a server that is shared by every concurrent request, so a request that
// set Spanish left the singleton on Spanish for whoever rendered next — a
// visitor with no cookie was served `lang="en"` wrapped around Spanish body
// text, and hydrated into a guaranteed mismatch. The window is small but the
// failure is silent, order-dependent and gets worse under load.
//
// `cloneInstance` shares the resource store (so the lazily-loaded bundles in
// ./resources.ts are still fetched once and reused) while giving this render its
// own `language`. On the client there is exactly one request in flight and the
// singleton is what `useTranslation()` hands to useLocale/LocaleQueryParam, so
// cloning there would silently disconnect the language picker.
export default function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [instance] = useState(() => {
    const requested =
      initialLocale && SUPPORTED_LOCALES.some((l) => l.code === initialLocale) ? initialLocale : undefined

    if (typeof window === 'undefined') {
      // `forkResourceStore` defaults to false, which is the point: the clone
      // shares the parent's store, so the lazily-loaded bundles are fetched
      // once and every request reuses them. Only `language` is per-instance.
      return i18n.cloneInstance({ lng: requested ?? FALLBACK_LOCALE })
    }

    // Client: keep the singleton. Both entry paths (src/client.tsx before
    // hydrateRoot, the root loader on the server) have already awaited this
    // locale's bundle, so changeLanguage resolves synchronously here.
    if (requested && i18n.resolvedLanguage !== requested) {
      void i18n.changeLanguage(requested)
    }
    return i18n
  })

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>
}

import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

// Re-export pure constants for callers that want them alongside the i18next
// instance. Server components MUST import from "./constants" directly so they
// don't pull this module's browser-side init code into the server bundle.
export { SUPPORTED_LOCALES, FALLBACK_LOCALE, STORAGE_KEY, coerceLocale } from './constants'
export type { Locale } from './constants'

import { FALLBACK_LOCALE, STORAGE_KEY, SUPPORTED_LOCALES } from './constants'

// Only initialize once. Under Vite HMR the module can be re-evaluated;
// re-initing throws warnings and clobbers in-flight subscriptions.
//
// `init()` is ASYNCHRONOUS and the promise is exported, because callers now have
// to wait for it. While resources were passed into init() they were in the store
// the moment it processed them, so nothing could observe the gap. Now that
// bundles are added afterwards (see ./resources.ts), calling addResourceBundle
// before init settles drops them on the floor, and t() answers with the key
// path. That surfaced as `t('landing.manifesto.isnt', { returnObjects: true })`
// handing the landing page a string where it expected an array — the page threw
// on .map, but only on the client, and only after hydration.
export const i18nReady: Promise<unknown> = i18n.isInitialized
  ? Promise.resolve()
  : i18n
      .use(LanguageDetector)
      .use(initReactI18next)
      .init({
        // No `resources` here — bundles arrive through ensureLocaleLoaded() in
        // ./resources.ts, which code-splits them per language. See that file for
        // why. `partialBundledLanguages` tells i18next that resources may be
        // added after init, so it does not treat an empty store as "no
        // translations exist" and give up on the language.
        partialBundledLanguages: true,
        fallbackLng: FALLBACK_LOCALE,
        supportedLngs: SUPPORTED_LOCALES.map((l) => l.code),
        interpolation: { escapeValue: false },
        detection: {
          // Cookie first so client-side init matches what the server rendered;
          // localStorage as the next fallback (legacy users + cross-tab sync);
          // navigator.language for first-ever visitors.
          order: ['cookie', 'localStorage', 'navigator'],
          lookupCookie: STORAGE_KEY,
          lookupLocalStorage: STORAGE_KEY,
          // Auto-mirror to both stores on i18n.changeLanguage. cookieMinutes
          // = 1 year so a visitor's choice survives well beyond a session.
          caches: ['localStorage', 'cookie'],
          cookieMinutes: 60 * 24 * 365,
          cookieDomain: undefined,
        },
        returnNull: false,
      })

export default i18n

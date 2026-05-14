import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import es from "./locales/es.json";

// Re-export pure constants for callers that want them alongside the i18next
// instance. Server components MUST import from "./constants" directly so they
// don't pull this module's browser-side init code into the server bundle.
export { SUPPORTED_LOCALES, FALLBACK_LOCALE, STORAGE_KEY, coerceLocale } from "./constants";
export type { Locale } from "./constants";

import { FALLBACK_LOCALE, STORAGE_KEY, SUPPORTED_LOCALES } from "./constants";

// Only initialize once. In Next.js dev / HMR the module can be re-evaluated;
// re-initing throws warnings and clobbers in-flight subscriptions.
if (!i18n.isInitialized) {
  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        es: { translation: es },
      },
      fallbackLng: FALLBACK_LOCALE,
      supportedLngs: SUPPORTED_LOCALES.map((l) => l.code),
      interpolation: { escapeValue: false },
      detection: {
        // Cookie first so client-side init matches what the server rendered;
        // localStorage as the next fallback (legacy users + cross-tab sync);
        // navigator.language for first-ever visitors.
        order: ["cookie", "localStorage", "navigator"],
        lookupCookie: STORAGE_KEY,
        lookupLocalStorage: STORAGE_KEY,
        // Auto-mirror to both stores on i18n.changeLanguage. cookieMinutes
        // = 1 year so a visitor's choice survives well beyond a session.
        caches: ["localStorage", "cookie"],
        cookieMinutes: 60 * 24 * 365,
        cookieDomain: undefined,
      },
      returnNull: false,
    });
}

export default i18n;

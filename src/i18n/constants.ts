// Pure constants and types — no React, no i18next, no browser APIs. Safe to
// import from server components (the layout reads the locale cookie here).
//
// To add a new language:
//   1. Drop `src/i18n/locales/<code>.json` mirroring en.json's shape.
//   2. Add the code + label to SUPPORTED_LOCALES below.
//   3. Add a `import('./locales/<code>.json')` entry to the `loaders` map in
//      src/i18n/resources.ts — it is typed by Locale, so step 2 breaks the
//      build until you do.
//   4. Bump the Zod enum on setLocale in src/lib/api/types.ts.

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]['code']

export const FALLBACK_LOCALE: Locale = 'en'

// Same key used for the localStorage cache (set by i18next-browser-
// languagedetector) AND the cookie the server reads on every request. Both
// stay in sync because the detector's `caches` config writes to both.
export const STORAGE_KEY = 'anansi:locale'

// Server-side helper: validate a raw cookie value against SUPPORTED_LOCALES.
// Returns the validated locale, or undefined if missing/unrecognized — the
// layout passes this to I18nProvider; an undefined value leaves i18next at
// its fallback for SSR and lets the client detector take over post-hydration.
export function coerceLocale(raw: string | undefined): Locale | undefined {
  if (!raw) return undefined
  return SUPPORTED_LOCALES.some((l) => l.code === raw) ? (raw as Locale) : undefined
}

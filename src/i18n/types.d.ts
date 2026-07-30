import type en from './locales/en.json'

// Type-safe translation keys — `t('common.save')` is checked against en.json
// at build time. Treat en.json as the source of truth for shape; es.json must
// mirror it (TS won't enforce that — we rely on lint / human review).
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en }
    returnNull: false
  }
}

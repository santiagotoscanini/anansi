import i18n, { i18nReady } from './config'
import type { Locale } from './constants'

// Lazily-loaded translation bundles.
//
// en.json + es.json are ~122 KB raw / ~55 KB gzipped. Statically imported they
// landed in a chunk that BOTH the marketing landing page and /app pulled in on
// first paint, so every visitor downloaded both languages before anything
// rendered — over half the size of the main bundle, to display one of them.
//
// This is a hand-rolled two-function loader rather than a backend plugin
// (i18next-resources-to-backend) on purpose: the whole job is "call import()
// and hand the result to addResourceBundle", and this repo runs a 7-day
// supply-chain cooldown, so a dependency needs to earn its place.
//
// The map is written out one key at a time instead of `import('./locales/' +
// locale + '.json')`. A template-literal import makes Rollup glob the whole
// directory and emit chunks for files nothing asks for; explicit keys keep the
// chunk list exactly as long as SUPPORTED_LOCALES, and adding a language is a
// type error here until it is added.
const loaders: Record<Locale, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import('./locales/en.json'),
  es: () => import('./locales/es.json'),
}

// Cache the in-flight promise, not just the completed result. Two components
// asking for the same locale in the same tick must share one network request,
// and the second caller must still await it rather than racing ahead to
// changeLanguage with no resources loaded.
const inFlight = new Map<Locale, Promise<void>>()

/**
 * Make `locale`'s translations available, loading them if needed. Idempotent
 * and safe to call concurrently.
 *
 * Waits on `i18nReady` as well as the chunk: `i18n.init()` is async, and
 * addResourceBundle before it settles is silently discarded.
 *
 * **Await this before every `changeLanguage`.** i18next does not block on
 * missing resources — it renders the raw key path instead ("app.nav.goals"),
 * so switching first and loading second shows a frame of visible key soup.
 */
export async function ensureLocaleLoaded(locale: Locale): Promise<void> {
  const existing = inFlight.get(locale)
  if (existing) return existing
  if (i18n.isInitialized && i18n.hasResourceBundle(locale, 'translation')) return

  const promise = Promise.all([i18nReady, loaders[locale]()])
    .then(([, mod]) => {
      // `deep` and `overwrite` both false: a bundle already present wins, which
      // keeps this a no-op if two paths raced past the hasResourceBundle check.
      i18n.addResourceBundle(locale, 'translation', mod.default, false, false)
    })
    .catch((err) => {
      // Drop the failed promise so a later attempt can retry instead of
      // permanently resolving to nothing (a chunk fetch fails on flaky
      // networks and after a deploy swaps the hashed filenames).
      inFlight.delete(locale)
      throw err
    })

  inFlight.set(locale, promise)
  return promise
}

/** Load `locale` if needed, then switch to it. The safe pairing of the two. */
export async function switchLocale(locale: Locale): Promise<void> {
  await ensureLocaleLoaded(locale)
  await i18n.changeLanguage(locale)
}

import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'

import i18n from '~/i18n/config'
import { FALLBACK_LOCALE, coerceLocale } from '~/i18n/constants'
import { ensureLocaleLoaded, switchLocale } from '~/i18n/resources'

// Custom client entry (TanStack resolves `src/client.tsx` by convention). It is
// Start's default entry plus one thing: the active locale's translation chunk is
// awaited BEFORE hydrateRoot.
//
// That await is the whole reason the entry exists. Translations are code-split
// per language now (see src/i18n/resources.ts), and i18next does not block on a
// missing bundle — it renders the raw key path. Hydrating before the chunk lands
// would paint "app.nav.goals" over server HTML that says "Goals", which React
// treats as a hydration mismatch and repairs by re-rendering the subtree. The
// user-visible result is a flash of key soup on every cold load.
//
// The locale is read off `<html lang>` rather than re-derived from the cookie.
// That attribute is what the server actually rendered with, so matching it is
// matching the HTML in front of us — a re-derivation could disagree (the cookie
// can change between the response and hydration) and disagreeing is precisely
// the failure being avoided.
const ssrLocale = coerceLocale(document.documentElement.lang) ?? FALLBACK_LOCALE

// i18next's browser detector (cookie → localStorage → navigator) already chose a
// language when config.ts initialized, and it can disagree with the server: the
// server sees `?locale=` and the cookie, so a visitor with neither but with a
// localStorage preference gets served `en` while the detector wants `es`.
//
// Previously both bundles were present, so that divergence hydrated as mismatched
// text. Now it is resolved in the correct order — render what the server sent,
// then move to the preference afterwards as an ordinary language change.
//
// Only when the server had NO explicit signal, though. If it did, that signal is
// the visitor's most recent intent (a /?locale=es link they just clicked) and a
// stale localStorage value must not overrule it.
const serverWasExplicit = document.documentElement.hasAttribute('data-locale-explicit')
const detected = serverWasExplicit ? undefined : coerceLocale(i18n.resolvedLanguage ?? i18n.language)

function hydrate() {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    )
  })
}

void ensureLocaleLoaded(ssrLocale)
  // The detector may have left i18next pointed at a language we are not about to
  // render. Align it before hydrating; resources for ssrLocale are loaded above.
  .then(() => (i18n.resolvedLanguage === ssrLocale ? undefined : i18n.changeLanguage(ssrLocale)))
  .catch((err: unknown) => {
    // A failed chunk fetch must not cost the user the whole app. i18next falls
    // back to rendering key paths, which is degraded but navigable.
    console.error('[i18n] failed to load translations for', ssrLocale, err)
  })
  .then(() => {
    hydrate()
    if (detected && detected !== ssrLocale) {
      void switchLocale(detected).catch((err: unknown) => {
        console.error('[i18n] failed to apply the stored locale preference', detected, err)
      })
    }
  })

import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { SUPPORTED_LOCALES, type Locale } from './config'
import { switchLocale } from './resources'

// Honors `?locale=es` (or any other supported code) on any URL by calling
// i18n.changeLanguage once when the param is present. Designed for shareable
// marketing links — e.g. `/?locale=es` so a campaign in Spanish renders in
// Spanish without the visitor having to find the picker.
//
// Side effects:
//   - The detector's localStorage cache (key `anansi:locale`) will pick up
//     the new value via i18next's change event, so the choice sticks for the
//     visitor's next visit. This matches user expectation for shared links —
//     if you wanted ephemeral-per-tab behavior we'd need a separate
//     "preview" mode and a detector reconfiguration.
//   - Renders nothing.
export default function LocaleQueryParam() {
  // `locale` is declared on the root route's validateSearch, so it is a typed
  // param on every route in the tree — no Suspense boundary needed around this
  // component the way `useSearchParams` required under Next.
  const requested = useRouterState({ select: (s) => (s.location.search as { locale?: string }).locale })
  const { i18n } = useTranslation()

  useEffect(() => {
    if (!requested) return
    const isSupported = SUPPORTED_LOCALES.some((l) => l.code === requested)
    if (!isSupported) return
    if (requested === i18n.resolvedLanguage) return
    // switchLocale, not changeLanguage: the requested language's bundle is
    // code-split and may not be loaded — switching first would render key paths
    // until the chunk arrives.
    void switchLocale(requested as Locale)
  }, [requested, i18n])

  return null
}

'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'

import { SUPPORTED_LOCALES } from './config'

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
  const params = useSearchParams()
  const { i18n } = useTranslation()
  const requested = params.get('locale')

  useEffect(() => {
    if (!requested) return
    const isSupported = SUPPORTED_LOCALES.some((l) => l.code === requested)
    if (!isSupported) return
    if (requested === i18n.resolvedLanguage) return
    void i18n.changeLanguage(requested)
  }, [requested, i18n])

  return null
}

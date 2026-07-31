import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { qk } from '~/lib/queries/keys'
import { meQueryOptions, type Me } from '~/lib/queries/session'
import { setLocale as setLocaleFn } from '~/server/fn/auth.fn'
import { FALLBACK_LOCALE, SUPPORTED_LOCALES, type Locale } from './config'
import { switchLocale } from './resources'

// Locale storage rules:
//   - localStorage (`anansi:locale`) is the source of truth for unauthenticated
//     users and is what the i18next browser detector reads on first render.
//   - When the user is authenticated, the DB column `users.locale` becomes
//     authoritative: on every `me` success we mirror the DB value into
//     i18next (and thus into localStorage), and on user-initiated changes we
//     write through to the DB so the choice follows them across devices.
//
// Why the useEffect's deps array deliberately excludes `current`: the effect
// runs after every render, and `current` flips the moment i18next changes
// language. If `current` were a dep, clicking the picker would synchronously
// trigger:
//   1. i18n.changeLanguage(next)   — language updates, all useTranslation
//                                    subscribers re-render
//   2. effect re-runs (deps changed via `current`)
//   3. effect reads the still-cached me.locale (the OLD value) and reverts
//      the language back to it
// The user reported this as "clicking does nothing": the flip happens but
// is immediately clobbered a few ms later. Gating the effect on `me?.locale`
// only — combined with optimistically updating the query cache from the
// mutation — means DB→client only fires when the DB value actually changes,
// never as a side effect of a local change.
export function useLocale() {
  const { i18n } = useTranslation()
  const current = (i18n.resolvedLanguage ?? i18n.language ?? FALLBACK_LOCALE) as Locale
  const queryClient = useQueryClient()

  // `useQuery`, not `useSuspenseQuery`: the language picker renders on the
  // public pages too, where nobody is signed in and this 401s. `retry: false`
  // so an anonymous visitor doesn't burn three requests discovering that.
  const { data: me } = useQuery({ ...meQueryOptions(), retry: false })

  const setLocaleMutation = useMutation({
    mutationFn: (locale: Locale) => setLocaleFn({ data: { locale } }),
    onSuccess: (updated) => {
      // Prime the `me` cache with the new locale so the DB→client mirror sees
      // the value it just wrote and doesn't try to apply a stale "old" value
      // on its next pass.
      queryClient.setQueryData<Me>(qk.me, (old) => (old ? { ...old, ...updated } : old))
    },
  })

  // Guard against re-applying the same DB value across query refetches.
  const lastAppliedFromDb = useRef<string | null>(null)

  useEffect(() => {
    const dbLocale = me?.locale
    if (!dbLocale) return
    if (dbLocale === lastAppliedFromDb.current) return
    const isSupported = SUPPORTED_LOCALES.some((l) => l.code === dbLocale)
    if (!isSupported) return
    if (dbLocale !== i18n.resolvedLanguage) {
      void switchLocale(dbLocale as Locale)
    }
    lastAppliedFromDb.current = dbLocale
  }, [me?.locale, i18n])

  const setLocale = (next: Locale) => {
    // Loads the language's chunk before switching. On a cold switch this makes
    // the picker's effect land one network round-trip later than it used to;
    // the alternative is rendering raw key paths in the interim.
    void switchLocale(next)
    // For authenticated users, write through to the DB. The mutation's
    // onSuccess updates the query cache, which keeps the ref guard in sync
    // and prevents the DB→client effect from firing again on the same value.
    if (me) {
      lastAppliedFromDb.current = next
      setLocaleMutation.mutate(next)
    }
  }

  return {
    locale: current,
    setLocale,
    supported: SUPPORTED_LOCALES,
  }
}

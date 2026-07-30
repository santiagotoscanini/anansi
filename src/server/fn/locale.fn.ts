import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { STORAGE_KEY as LOCALE_COOKIE, coerceLocale, type Locale } from '~/i18n/constants'

// EXPORTS ONLY SERVER FUNCTIONS — see the `.fn.ts` convention note in
// CLAUDE.md. A plain runtime value exported from this module makes the Start
// compiler treat it as mixed and mis-register the function ids; `vite build`
// tolerates it but `vite dev` throws "Invalid server function ID" at call
// time, which hides until someone exercises the code path.

/**
 * The SSR half of the locale handshake, replacing the `cookies()` read in
 * src/app/layout.tsx.
 *
 * A route loader runs on BOTH server and client, so this cannot be a plain
 * function in the loader body — `getRequestHeader` only exists server-side.
 * As a server fn it runs on the server during SSR and, on a client-side
 * navigation, returns the same value over the wire.
 *
 * Returns `undefined` for a user with no cookie yet, which leaves i18next at
 * its fallback for SSR and lets the browser detector take over after
 * hydration. That is the existing behaviour, preserved deliberately.
 */
export const getInitialLocale = createServerFn({ method: 'GET' }).handler((): Locale | undefined => {
  const cookieHeader = getRequestHeader('cookie')
  if (!cookieHeader) return undefined

  // Hand-parsed rather than pulled from a cookie library: this is the only
  // cookie the shell reads, and the value is validated against
  // SUPPORTED_LOCALES immediately below, so a malformed header degrades to
  // `undefined` rather than to a wrong language.
  const match = cookieHeader.split(';').find((part) => part.trim().startsWith(`${LOCALE_COOKIE}=`))
  if (!match) return undefined

  const raw = match.trim().slice(LOCALE_COOKIE.length + 1)
  return coerceLocale(decodeURIComponent(raw))
})

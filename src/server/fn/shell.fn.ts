import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { STORAGE_KEY as LOCALE_COOKIE, coerceLocale, type Locale } from '~/i18n/constants'
import { readCookie } from '~/lib/cookies'
import { SIDEBAR_COOKIE, coerceSidebarGeometry, type SidebarGeometry } from '~/lib/sidebar'
import { THEME_COOKIE, coerceTheme, type Theme } from '~/lib/theme'

// EXPORTS ONLY SERVER FUNCTIONS — see the `.fn.ts` convention note in
// CLAUDE.md. A plain runtime value exported from this module makes the Start
// compiler treat it as mixed and mis-register the function ids; `vite build`
// tolerates it but `vite dev` throws "Invalid server function ID" at call
// time, which hides until someone exercises the code path.

export interface ShellPrefs {
  /** Validated `anansi:locale`; undefined when the visitor has no cookie yet. */
  locale: Locale | undefined
  /** Validated `anansi:theme-resolved`; undefined on a first visit. */
  theme: Theme | undefined
  /** Validated `anansi:sidebar`; undefined until the shell has rendered once. */
  sidebar: SidebarGeometry | undefined
}

/**
 * Everything the document shell needs to render correctly on the first paint,
 * read from request cookies. Replaces the `cookies()` reads in the old
 * src/app/layout.tsx.
 *
 * **One server fn for both values, deliberately.** A route loader runs on the
 * server AND the client, so these cannot be plain functions in the loader body
 * — `getRequestHeader` only exists server-side. Two separate server fns would
 * mean the root loader awaits two sequential round trips on any client-side
 * re-run; one fn reading one header is a single hop.
 *
 * Both fields are `undefined` rather than defaulted when the cookie is missing,
 * so callers can distinguish "the visitor chose English/light" from "we do not
 * know yet" — src/client.tsx depends on exactly that distinction for the locale.
 */
export const getShellPrefs = createServerFn({ method: 'GET' }).handler((): ShellPrefs => {
  const cookieHeader = getRequestHeader('cookie')
  return {
    locale: coerceLocale(readCookie(cookieHeader, LOCALE_COOKIE)),
    theme: coerceTheme(readCookie(cookieHeader, THEME_COOKIE)),
    sidebar: coerceSidebarGeometry(readCookie(cookieHeader, SIDEBAR_COOKIE)),
  }
})

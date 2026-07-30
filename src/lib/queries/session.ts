import { queryOptions } from '@tanstack/react-query'
import { fetchSession } from '~/server/fn/auth.fn'
import { qk } from './keys'

/**
 * Is anyone signed in, and who.
 *
 * Drives the `/app` route guard, which is why it is separate from `me` rather
 * than merged with it: this answer comes from the cookie alone, so it is cheap
 * enough to await in `beforeLoad` on every navigation. `me` hits the database
 * for the live profile (avatar, locale) — the cookie's copies of those go stale
 * the moment the user edits them.
 *
 * `staleTime: Infinity` because a session cookie cannot change without one of
 * the auth server functions running, and each of those invalidates this key
 * explicitly. Expiry mid-session is caught by the 401 from the next server-fn
 * call, not by polling this.
 */
export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: qk.session,
    queryFn: () => fetchSession(),
    staleTime: Infinity,
  })

export type SessionSummary = Awaited<ReturnType<typeof fetchSession>>

import { queryOptions } from '@tanstack/react-query'
import { fetchMe, fetchSession } from '~/server/fn/auth.fn'
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
    queryFn: ({ signal }) => fetchSession({ signal }),
    staleTime: Infinity,
  })

export type SessionSummary = Awaited<ReturnType<typeof fetchSession>>

/**
 * The signed-in user's `users` row.
 *
 * Kept apart from the session for the reason above, and it is not just
 * tidiness: `avatarUrl` and `locale` are not in the cookie at all, and the
 * cookie's `name`/`email` are frozen at sign-in. ProfileModal writes here and
 * invalidates this key; the session key is untouched by a profile edit.
 *
 * Nullable — the row is gone if the account was deleted mid-session, in which
 * case the next server-fn 401 is what actually resolves it.
 */
export const meQueryOptions = () =>
  queryOptions({
    queryKey: qk.me,
    queryFn: ({ signal }) => fetchMe({ signal }),
  })

export type Me = Awaited<ReturnType<typeof fetchMe>>

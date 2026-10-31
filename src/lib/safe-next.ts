/**
 * Sanitize a `?next=` redirect target so it can only point back into this
 * app. Defence against an attacker handing out a `/login?next=https://evil`
 * link and having the app perform the redirect after a successful sign-in.
 *
 * The `next` parameter is what lets /oauth/authorize bounce an unauthenticated
 * MCP client through /login and resume the consent flow afterwards, so it
 * cannot simply be dropped.
 *
 * Two rules, both necessary:
 *   - must start with `/`, which rules out any absolute URL with a scheme;
 *   - must resolve to this app, parsed the way a browser parses it. `//evil.com`
 *     is protocol-relative, and browsers also read `/\evil.com` the same way and
 *     drop tabs and newlines from `/<tab>/evil.com`, so a prefix check on `//`
 *     alone leaves those open. The base host is a placeholder that nothing real
 *     can match.
 *
 * Anything else falls back to `/app`.
 *
 * Lives here rather than in a route file because both the Next pages and the
 * TanStack Start route validators need it during the migration, and a
 * security guard duplicated across two files is a guard that drifts. Takes
 * `null` as well as `undefined` so it accepts `URLSearchParams.get()` and a
 * validated search object without a cast at either call site.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next?.startsWith('/')) return '/app'
  return new URL(next, 'https://anansi.invalid').host === 'anansi.invalid' ? next : '/app'
}

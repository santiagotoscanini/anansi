// Baseline security headers, set on every response. CSP is intentionally
// not included here — React's hydration scripts and our React Flow / emoji
// picker bundles need `unsafe-inline` styles + dynamic `unsafe-eval` in
// places, which makes a useful CSP a separate, careful iteration. The
// headers below are the no-tradeoff ones every production app should ship:
//
//   X-Frame-Options: DENY
//     Stops the entire app from being framed. Anansi has reflection
//     prompts and CRM notes — exactly the surface a phishing iframe
//     would clickjack ("type your password to confirm sharing"). DENY
//     instead of SAMEORIGIN because there's no in-product iframe use.
//
//   Referrer-Policy: strict-origin-when-cross-origin
//     Outbound clicks (privacy policy, ToS, etc.) leak only the origin,
//     never the full URL — so a click from /app/people/abc-def doesn't
//     hand the destination an internal id.
//
//   X-Content-Type-Options: nosniff
//     Stops Chrome from content-sniffing a misdeclared MIME and
//     executing it. Pairs with the magic-byte file-upload validator.
//
//   Strict-Transport-Security: max-age=2y, includeSubDomains, preload
//     Forces HTTPS for two years on this hostname and every subdomain;
//     `preload` is the opt-in to the browser-shipped HSTS preload list.
//     Only set this once you're confident every subdomain you'll ever
//     serve on this apex is HTTPS — removing preload is hard.
//
//   Permissions-Policy: camera=(), microphone=(), geolocation=(), …
//     Closes powerful APIs the app doesn't use. If a stored-XSS ever
//     does land, this denies the script access to mic/camera/etc.
//
//   X-DNS-Prefetch-Control: on
//     Modest perf win; harmless from a security standpoint.
//
// These were `next.config.js`'s `headers()` with `source: '/:path*'`. They are
// applied now by the global request middleware in src/start.ts.
export const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
  [
    'Permissions-Policy',
    ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()', 'usb=()', 'interest-cohort=()'].join(', '),
  ],
  ['X-DNS-Prefetch-Control', 'on'],
]

/**
 * Return `response` carrying every security header — mutated in place when its
 * headers allow it, rebuilt when they don't. **Use the return value**; it is not
 * always the object you passed in.
 *
 * It deliberately does not overwrite a header a route already set. Nothing does
 * today, but a route wanting a narrower `X-Frame-Options` should win over the
 * blanket default rather than silently lose to middleware that runs later.
 *
 * The rebuild branch is not defensive padding. `Response.redirect()` returns a
 * response whose headers guard is *immutable* per spec, so `headers.set()` on
 * one throws `TypeError: immutable` — and since this runs in global middleware,
 * that TypeError becomes a 500 on a route that was otherwise correct. The three
 * `Response.redirect()` calls in `oauth.authorize.decision.ts` hit exactly that:
 * approve, deny and the no-session bounce all 500'd, which took down the entire
 * MCP consent flow while every page, server fn and server route kept working.
 * Responses returned straight from `fetch()` carry the same guard, so a future
 * proxy route would have rediscovered this the same expensive way.
 */
export function applySecurityHeaders(response: Response): Response {
  const missing = SECURITY_HEADERS.filter(([key]) => !response.headers.has(key))
  if (missing.length === 0) return response

  try {
    for (const [key, value] of missing) response.headers.set(key, value)
    return response
  } catch {
    // Immutable guard. Copy into a fresh Headers, which is always mutable, and
    // re-wrap the same body — the body is a stream reference, not a copy, so
    // this stays O(1) regardless of payload size.
    const headers = new Headers(response.headers)
    for (const [key, value] of missing) headers.set(key, value)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}

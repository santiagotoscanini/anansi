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
 * Set every header on `response`, in place.
 *
 * `Headers` is mutable for any Response we construct or that Start hands back,
 * so this is a plain loop. It deliberately does not overwrite a header that a
 * route already set — nothing does today, but a route that wants a narrower
 * `X-Frame-Options` should win over the blanket default rather than silently
 * lose to middleware that runs after it.
 */
export function applySecurityHeaders(response: Response): void {
  for (const [key, value] of SECURITY_HEADERS) {
    if (!response.headers.has(key)) response.headers.set(key, value)
  }
}

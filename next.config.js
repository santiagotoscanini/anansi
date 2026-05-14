// Baseline security headers, set on every response. CSP is intentionally
// not included here — Next's hydration scripts and our React Flow / emoji
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
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Permissions-Policy",
    value: ["camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()", "interest-cohort=()"].join(", "),
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // No remotePatterns: avatars / people photos / attachments come from
  // Supabase Storage and are rendered via `<Image unoptimized>`, which
  // bypasses Next's optimizer and its hostname allow-list. If we ever turn
  // optimization back on, add the Supabase project hostname here.
  //
  // No CORS headers: the app is a single-origin Next.js deployment. tRPC and
  // /api/auth/* are called from the same origin, so allowing cross-origin
  // requests with credentials would only widen the attack surface (the prior
  // `Access-Control-Allow-Origin: *` plus `Allow-Credentials: true` was an
  // invalid combo per spec but signalled confused intent). If a separate
  // client domain is ever needed, add a strict allow-list here.
  async headers() {
    return [
      {
        // Apply to every response. The matcher excludes Next's internal
        // `_next/*` static asset paths is unnecessary — these headers are
        // safe on static assets too.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;

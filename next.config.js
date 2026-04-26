/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    // User-uploaded files (avatars, person pictures, attachments) are served
    // by our /uploads/[...path] route on the same origin. Next/Image's
    // optimizer rejects local paths by default — allow-list /uploads/** so
    // the <Image> component can request them.
    localPatterns: [{ pathname: "/uploads/**" }],
  },
  // No CORS headers: the app is a single-origin Next.js deployment. tRPC and
  // /api/auth/* are called from the same origin, so allowing cross-origin
  // requests with credentials would only widen the attack surface (the prior
  // `Access-Control-Allow-Origin: *` plus `Allow-Credentials: true` was an
  // invalid combo per spec but signalled confused intent). If a separate
  // client domain is ever needed, add a strict allow-list here.
};

export default nextConfig;

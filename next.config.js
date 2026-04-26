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
  // Add this section to ensure API routes work correctly
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

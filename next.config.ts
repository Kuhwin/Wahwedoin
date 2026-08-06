import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Private work app — keep every page out of search indexes.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google-analytics.com https://js.stripe.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com https://www.google.com",
  "frame-src blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://oauth2.googleapis.com https://www.googleapis.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // Standalone output lets the same build run on the fallback VPS (see
  // support/fallback.md) with `node server.js`. Harmless on Vercel.
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "ssl.gstatic.com" },
      { protocol: "https", hostname: "www.gstatic.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "lh4.googleusercontent.com" },
      { protocol: "https", hostname: "lh5.googleusercontent.com" },
      { protocol: "https", hostname: "lh6.googleusercontent.com" },
      { protocol: "https", hostname: "docs.google.com" },
      { protocol: "https", hostname: "drive.google.com" },
    ],
  },
  async redirects() {
    return [
      {
        source: "/teams",
        destination: "/manage",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: csp },
        ],
      },
      {
        source: "/api/(.*)",
        headers: [
          // All API routes are same-origin (browser) or server-to-server
          // (OAuth redirects, Vercel cron), so no CORS allow-list is needed.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

// Allowlists only what's actually loaded: Google Fonts (see app/layout.tsx)
// and Razorpay Checkout (script + its iframe + its API calls, see
// app/book/[id]/pay/PayPageClient.tsx). Verified by browser-testing every
// page type after adding this, not just written and assumed correct.
//
// script-src needs 'unsafe-inline': Next.js injects its own inline
// bootstrap/hydration scripts, which a strict script-src blocks outright
// (confirmed empirically — without this the app throws a real runtime
// error, not just a console warning). The fully-strict alternative is a
// nonce-based CSP, but that requires Proxy/middleware generating a nonce
// per request AND forces every page (including the currently-static home
// and /book pages) into dynamic rendering — a much bigger change than this
// pass warrants. This is Next's own documented fallback for apps that
// don't implement nonces, not an ad-hoc shortcut.
//
// script-src also needs the *.razorpay.com wildcard, not just
// checkout.razorpay.com: Checkout.js loads a second script of its own
// (a risk-detection bundle from cdn.razorpay.com) — confirmed by watching
// the actual CSP violation in the browser console, not guessed in advance.
const isDev = process.env.NODE_ENV === "development";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://*.razorpay.com${isDev ? " 'unsafe-eval'" : ""}`, // unsafe-eval: React dev-mode debugging only, never used in production
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://*.razorpay.com",
  "connect-src 'self' https://*.razorpay.com",
  "frame-src https://*.razorpay.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;

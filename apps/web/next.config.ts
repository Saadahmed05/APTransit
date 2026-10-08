import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { SECURITY_HEADERS } from "./lib/csp";

// Same origin API (docs/06, Basics): the browser calls /api/v1 on the web origin and Next
// forwards it to the NestJS API. This keeps the refresh cookie first party.
const apiUrl = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Our rules live in the root AGENTS.md. Stop `next dev` from writing its own AGENTS.md and
  // CLAUDE.md into apps/web (they break pnpm check:dashes).
  agentRules: false,
  transpilePackages: ["@aptransit/ui"],
  // docs: next/dist/docs/01-app/02-guides/progressive-web-apps.md. The worker is never cached by HTTP.
  async headers() {
    return [
      // docs/12: on every response. The CSP itself is per request (proxy.ts, it needs a nonce).
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiUrl}/api/v1/:path*` }];
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);

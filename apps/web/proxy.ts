import { type NextRequest, NextResponse } from "next/server";
import { buildCsp } from "./lib/csp";

// docs/08 "Web route guards": fast redirect to /login?next= for routes that need login.
// The proxy cannot see apt_rt (Path=/api/v1/auth), so it checks the apt_session marker (D-016).
// This is a UX nicety only: pages check permissions after useMe, and the API is the real check.

export const SESSION_COOKIE = "apt_session";

/** Route prefixes that need a logged in user (permission checks happen in the page). */
export const PROTECTED_PREFIXES = [
  "/book",
  "/tickets",
  "/passes",
  "/free-travel",
  "/account",
  "/updates",
  "/driver",
  "/conductor",
  "/ops",
  "/gov",
  "/admin",
] as const;

export function needsLogin(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (needsLogin(pathname) && !request.cookies.has(SESSION_COOKIE)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(login);
  }

  // docs/12: a fresh CSP nonce for every page response. Next reads it from the request header.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV === "development",
    wsUrl: process.env.NEXT_PUBLIC_WS_URL,
    mapStyleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Every page (for the CSP), but not the API rewrite, static files, the service worker or prefetches.
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

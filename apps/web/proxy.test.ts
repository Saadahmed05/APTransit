import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { buildCsp } from "./lib/csp";
import { config, needsLogin, proxy } from "./proxy";

const req = (path: string, cookie?: string) =>
  new NextRequest(new URL(path, "http://localhost:3000"), { headers: cookie ? { cookie } : {} });

describe("proxy route guard (docs/08, D-016)", () => {
  it("knows which routes need login", () => {
    expect(needsLogin("/account")).toBe(true);
    expect(needsLogin("/tickets/abc")).toBe(true);
    expect(needsLogin("/ops")).toBe(true);
    expect(needsLogin("/")).toBe(false);
    expect(needsLogin("/search")).toBe(false);
    expect(needsLogin("/timetable/route/x")).toBe(false);
    expect(needsLogin("/opsx")).toBe(false);
  });

  it("redirects to /login with next when the session marker is missing", () => {
    const res = proxy(req("/tickets/t1?tab=qr"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/tickets/t1?tab=qr");
  });

  it("lets the request through with the marker", () => {
    const res = proxy(req("/account", "apt_session=1"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("ignores apt_rt, which pages never receive (Path=/api/v1/auth)", () => {
    expect(proxy(req("/account", "apt_rt=abc")).status).toBe(307);
  });

  it("runs on pages but not on the API, static files or the service worker", () => {
    const re = new RegExp("^" + config.matcher[0]!.source + "$");
    for (const path of ["/", "/tickets/t1", "/gov/district/x", "/feedback"]) expect(re.test(path)).toBe(true);
    for (const path of ["/api/v1/health", "/_next/static/a.js", "/sw.js", "/manifest.webmanifest"]) {
      expect(re.test(path)).toBe(false);
    }
  });

  it("sets a CSP with a fresh nonce on every page response (docs/12)", () => {
    const a = proxy(req("/")).headers.get("content-security-policy")!;
    const b = proxy(req("/")).headers.get("content-security-policy")!;
    expect(a).toMatch(/script-src [^;]*'nonce-[^']+' 'strict-dynamic'/);
    expect(a).not.toBe(b);
  });
});

describe("CSP (docs/12)", () => {
  const csp = buildCsp("abc", { dev: false, wsUrl: "https://api.example.com" });

  it("allows Razorpay, the map tiles and the socket origin, and nothing broad", () => {
    expect(csp).toContain("frame-src https://checkout.razorpay.com https://api.razorpay.com");
    expect(csp).toContain(
      "connect-src 'self' https://api.example.com wss://api.example.com https://api.razorpay.com https://tiles.openfreemap.org",
    );
    expect(csp).toContain("img-src 'self' data: blob: https://tiles.openfreemap.org");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });
});

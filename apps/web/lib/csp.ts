// docs/12 "Web security headers". The CSP is built per request in proxy.ts with a fresh nonce;
// Next adds the nonce to its own scripts (next/dist/docs/01-app/02-guides/content-security-policy.md).
// 'strict-dynamic' lets scripts we load (Razorpay checkout) run because a nonce'd script added them.
// Styles allow 'unsafe-inline': MapLibre, Recharts and Radix position elements with style attributes.

const MAP_ORIGIN = "https://tiles.openfreemap.org";
const RAZORPAY = ["https://checkout.razorpay.com", "https://api.razorpay.com"];

/** http(s) origin plus its ws(s) twin, for the Socket.IO server. */
function socketOrigins(wsUrl: string | undefined): string[] {
  if (!wsUrl) return [];
  try {
    const url = new URL(wsUrl);
    const ws = url.protocol === "https:" ? "wss:" : "ws:";
    return [url.origin, `${ws}//${url.host}`];
  } catch {
    return [];
  }
}

export function buildCsp(nonce: string, opts: { dev: boolean; wsUrl?: string; mapStyleUrl?: string }): string {
  let mapOrigin = MAP_ORIGIN;
  try {
    if (opts.mapStyleUrl) mapOrigin = new URL(opts.mapStyleUrl).origin;
  } catch {
    // keep the default map origin
  }
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...RAZORPAY.slice(0, 1), ...(opts.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", mapOrigin],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...socketOrigins(opts.wsUrl), RAZORPAY[1]!, mapOrigin, ...(opts.dev ? ["ws:"] : [])],
    "frame-src": RAZORPAY,
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${[...new Set(v)].join(" ")}`);
  if (!opts.dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** Static headers for every response (next.config.ts headers()). */
export const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
  { key: "X-Frame-Options", value: "DENY" },
];

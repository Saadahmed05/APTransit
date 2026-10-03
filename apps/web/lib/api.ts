import { AuthRefreshResponse, ErrorResponse } from "@aptransit/shared";
import type { ZodType } from "zod";
import { sessionStore } from "./session";

// Small fetch wrapper (docs/04: no axios). Same origin /api/v1 through the Next rewrite (docs/06).
// Every response is validated with the zod Dto from @aptransit/shared.

export const API_BASE = "/api/v1";

/** Codes the client adds to the docs/06 list: no connection, or a response that broke the contract. */
export type ClientErrorCode = "NETWORK" | "BAD_RESPONSE";

export class ApiError extends Error {
  constructor(
    /** A docs/06 error code, or NETWORK and BAD_RESPONSE from the client. */
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
    /** Seconds to wait, from Retry-After or details.retryAfter on RATE_LIMITED. */
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

type UnauthenticatedHandler = () => void;

/** Default: full page redirect to the login screen with the current path as `next`. AuthProvider may replace it. */
let onUnauthenticated: UnauthenticatedHandler = () => {
  if (typeof window === "undefined") return;
  const next = `${window.location.pathname}${window.location.search}`;
  // Fallback outside React only. AuthProvider swaps in a router based handler on mount.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
};

export function setUnauthenticatedHandler(handler: UnauthenticatedHandler): void {
  onUnauthenticated = handler;
}

export interface ApiOptions<T> {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Response schema. Omit for 204 responses. */
  schema?: ZodType<T>;
  /** Query string values; undefined ones are skipped. */
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  /** Extra request headers, for example Idempotency-Key. */
  headers?: Record<string, string>;
  /**
   * Send the user to /login when the session cannot be refreshed. True for pages that need login.
   * Public data (places, search) sets false so an expired session never blocks it.
   */
  redirectOn401?: boolean;
}

function buildUrl(path: string, query?: ApiOptions<unknown>["query"]): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function toApiError(res: Response): Promise<ApiError> {
  const retryHeader = Number(res.headers.get("retry-after"));
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Not JSON (a proxy error page, for example)
  }
  const parsed = ErrorResponse.safeParse(body);
  if (!parsed.success) {
    const code = res.status >= 500 ? "INTERNAL" : "BAD_RESPONSE";
    return new ApiError(code, res.status, `HTTP ${res.status}`);
  }
  const { code, message, details, requestId } = parsed.data.error;
  const retryDetail = Number((details as { retryAfter?: unknown } | undefined)?.retryAfter);
  const retryAfterSec =
    Number.isFinite(retryHeader) && retryHeader > 0
      ? retryHeader
      : Number.isFinite(retryDetail) && retryDetail > 0
        ? retryDetail
        : undefined;
  return new ApiError(code, res.status, message, details as Record<string, unknown> | undefined, requestId, retryAfterSec);
}

async function send(path: string, options: ApiOptions<unknown>, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "same-origin",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("NETWORK", 0, "Network request failed");
  }
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshOnce(): Promise<string | null> {
  const res = await send("/auth/refresh", { method: "POST" }, null);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) return null;
    throw await toApiError(res);
  }
  const { accessToken } = AuthRefreshResponse.parse(await res.json());
  return accessToken;
}

/**
 * POST /auth/refresh, single flight. Parallel calls in this tab share one promise, and the
 * Web Lock makes other tabs wait their turn (D-012: two tabs racing with one cookie would give
 * one of them a 401). Returns the new access token, or null when the session is gone.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    const run = async () => {
      try {
        const token =
          typeof navigator !== "undefined" && navigator.locks
            ? await navigator.locks.request("apt-refresh", refreshOnce)
            : await refreshOnce();
        if (token) sessionStore.setAccessToken(token);
        else sessionStore.clear();
        return token;
      } finally {
        refreshInFlight = null;
      }
    };
    refreshInFlight = run();
  }
  return refreshInFlight;
}

/**
 * Calls the API and returns the parsed body. On 401 it refreshes once (shared by parallel
 * requests), retries once, and otherwise clears the session and sends the user to /login.
 */
export async function api<T = void>(path: string, options: ApiOptions<T> = {}): Promise<T> {
  const { redirectOn401 = true } = options;
  let res = await send(path, options, sessionStore.get().accessToken);

  const isAuthCall = path.startsWith("/auth/");
  if (res.status === 401 && !isAuthCall) {
    const token = await refreshAccessToken();
    if (token) {
      res = await send(path, options, token);
    }
    if (!token || res.status === 401) {
      sessionStore.clear();
      if (redirectOn401) onUnauthenticated();
    }
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204 || !options.schema) return undefined as T;

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError("BAD_RESPONSE", res.status, "Response was not JSON");
  }
  const parsed = options.schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("BAD_RESPONSE", res.status, "Response did not match the contract", undefined, res.headers.get("x-request-id") ?? undefined);
  }
  return parsed.data;
}

/** i18n key for an error: `errors.<CODE>`, with unknown codes shown as INTERNAL. */
export function errorKey(error: unknown, known: (key: string) => boolean): string {
  if (isApiError(error)) {
    if (error.code === "NETWORK") return "errors.NETWORK";
    const key = `errors.${error.code}`;
    if (known(key)) return key;
  }
  return "errors.INTERNAL";
}

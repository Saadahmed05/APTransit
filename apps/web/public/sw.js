/*
 * AP TransitOS service worker (Day 10, docs/04: hand written, no plugin).
 * - Versioned caches; old ones are removed on activate.
 * - Precache: /offline and the app icons.
 * - Navigations: network first with a 4 s timeout, then the cached page, then /offline.
 * - /_next/static: cache first (file names are content hashed).
 * - /api/v1: never cached, except GET /api/v1/tickets and /api/v1/passes (network first with a
 *   cache fallback), so a saved ticket still opens offline. Cleared on logout.
 * - A new version waits until the page asks it to take over (the "Update available" toast).
 */

const VERSION = "v1";
const STATIC_CACHE = `apt-static-${VERSION}`;
const PAGE_CACHE = `apt-pages-${VERSION}`;
const API_CACHE = `apt-api-${VERSION}`;
const CURRENT = [STATIC_CACHE, PAGE_CACHE, API_CACHE];
const PRECACHE = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"];
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("apt-") && !CURRENT.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
  // Logout: nothing of the old session stays in the caches
  if (event.data === "CLEAR_USER_DATA") {
    event.waitUntil(Promise.all([caches.delete(API_CACHE), caches.delete(PAGE_CACHE)]));
  }
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
    if (response.ok && response.type === "basic") cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return (await caches.match("/offline")) || Response.error();
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(STATIC_CACHE)).put(request, response.clone());
  return response;
}

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/v1/")) {
    if (url.pathname.startsWith("/api/v1/tickets") || url.pathname.startsWith("/api/v1/passes")) {
      event.respondWith(networkFirstApi(request));
    }
    return; // every other API call goes straight to the network, never cached
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstStatic(request));
  }
});

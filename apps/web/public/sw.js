/* Techlio Pulse service worker.
 * - Static build assets (content-hashed) and icons: cache-first → fast loads.
 * - Pages: always from the network (they are per-user and must be current);
 *   if offline, a branded offline page instead of the browser error.
 * - API requests (a different origin) and downloads are never touched.
 */
// Precache (offline page + app icons). Bump when those files change.
const VERSION = "pulse-v2";
// Runtime cache for content-hashed build files; capped because every deploy
// adds new hashes and nothing else would ever remove the old ones.
const RUNTIME = "pulse-runtime-v2";
const RUNTIME_MAX_ENTRIES = 200;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/logo.svg", "/icons/icon-192.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API and third parties: untouched
  if (url.pathname.startsWith("/downloads/")) return; // installers: straight from the network

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Content-hashed build files never change: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(RUNTIME).then((cache) => cache.put(req, copy).then(() => trim(cache)));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Icons can change between deploys: serve the cached copy, refresh it in the background.
  const icon =
    url.pathname.startsWith("/icons/") || url.pathname === "/favicon.ico" || url.pathname === "/apple-touch-icon.png";
  if (!icon) return;
  event.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req).then((hit) => {
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || refresh;
      }),
    ),
  );
});

/** Keep the runtime cache to the newest RUNTIME_MAX_ENTRIES files. */
function trim(cache) {
  return cache.keys().then((keys) => {
    const excess = keys.length - RUNTIME_MAX_ENTRIES;
    return excess > 0 ? Promise.all(keys.slice(0, excess).map((k) => cache.delete(k))) : undefined;
  });
}

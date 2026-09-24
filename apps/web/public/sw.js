/* Techlio Pulse service worker.
 * - Static build assets (content-hashed) and icons: cache-first → fast loads.
 * - Pages: always from the network (they are per-user and must be current);
 *   if offline, a branded offline page instead of the browser error.
 * - API requests (a different origin) and downloads are never touched.
 */
const VERSION = "pulse-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/logo.svg", "/icons/icon-192.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
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

  const cacheable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/apple-touch-icon.png";
  if (!cacheable) return;

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

// Roots Local service worker. It only ever serves this build's own static
// files so the app works offline after the first visit. It never sees DNA
// data: files are read in the page's worker and never requested over HTTP.
const VERSION = "__VERSION__";
const FILES = __FILES__;
const CACHE = `roots-local-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("roots-local-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// A new version waits until the page asks it to take over.
self.addEventListener("message", (event) => {
  if (event.data === "activate-update") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const key = request.mode === "navigate" ? "/" : url.pathname;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(key))
      .then((cached) => cached ?? fetch(request)),
  );
});

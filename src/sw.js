// Roots Local service worker. It only ever serves this build's own static
// files so the app works offline after the first visit. It never sees DNA
// data: files are read in the page's worker and never requested over HTTP.
const VERSION = "__VERSION__";
const FILES = __FILES__;
const CACHE = `roots-local-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
});

async function precache() {
  const cache = await caches.open(CACHE);
  try {
    for (let start = 0; start < FILES.length; start += 4) {
      const batch = FILES.slice(start, start + 4);
      const results = await Promise.allSettled(batch.map(async ([path, integrity]) => {
        const response = await staticFile(path, integrity, "default").catch(() =>
          staticFile(path, integrity, "reload"),
        );
        await cache.put(path, response);
      }));
      const failed = batch.filter((_, index) => results[index].status === "rejected");
      if (failed.length) throw new Error(`Could not cache ${failed.map(([path]) => path).join(", ")}`);
    }
  } catch (error) {
    await caches.delete(CACHE);
    throw error;
  }
}

async function staticFile(path, integrity, cache) {
  const response = await fetch(path, { integrity, cache, redirect: "error" });
  if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${path}`);
  return response;
}

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
  if (event.data !== "activate-update") return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (windows.some((client) => client.id !== event.source?.id)) {
      event.ports[0]?.postMessage("other-tabs");
      return;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const key = url.pathname === "/index.html" ? "/" : url.pathname;
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(key))
      .then((cached) => cached ?? fetch(request)),
  );
});

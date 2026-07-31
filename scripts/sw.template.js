// Hand-rolled service worker — no Workbox. This is a TEMPLATE: placeholders
// below are stamped by scripts/gen-sw.mjs (a postbuild step) into dist/sw.js
// on every build. Do not edit dist/sw.js directly — it's regenerated.
//
// Strategy:
//   - Navigations: network-first (NAV_TIMEOUT_MS), else the runtime pages
//     cache, else the precached /offline/ shell.
//   - /_astro/* (content-hashed build assets): cache-first.
//   - /pagefind/* + icons/manifest: stale-while-revalidate.
//   - Everything else (API-ish/cross-origin/non-GET): passthrough, untouched.
//
// SW_DISABLED is the kill-switch: flip to true and ship a deploy — every
// active service worker purges its caches, unregisters itself, and every
// fetch passes straight through, no client-side rollback needed.
const BUILD_ID = '__BUILD_ID__';
const PRECACHE_URLS = __PRECACHE_URLS__;
const SW_DISABLED = false;

// EVERY cache is scoped to the build. The precache always was; the other two
// were pinned to a literal 'v1' and never purged, which is how a returning
// visitor could be served the previous release: the pages cache still held the
// OLD HTML, and because /_astro/* is cache-first the old hashed assets it
// referenced were still there to render it. Any navigation that fell back to
// cache — a slow network past NAV_TIMEOUT_MS, or offline — therefore rebuilt a
// coherent copy of the site as it was before the deploy, with no signal to the
// user that they were looking at stale content.
//
// Build-scoping means the first navigation after a deploy re-fetches. That is
// the point: /_astro/* URLs are content-hashed and CDN-cached, so unchanged
// files come back immediately, while HTML and the non-hashed /pagefind/* search
// index (which changes every build and is only stale-while-revalidate) can no
// longer survive across releases.
const PRECACHE = `oc-precache-${BUILD_ID}`;
const PAGES_CACHE = `oc-pages-${BUILD_ID}`;
const ASSETS_CACHE = `oc-assets-${BUILD_ID}`;
/** Cache names this build owns; `activate` deletes every other `oc-` cache. */
const CURRENT_CACHES = [PRECACHE, PAGES_CACHE, ASSETS_CACHE];
const PAGES_LIMIT = 60;
const ASSETS_LIMIT = 150;
const NAV_TIMEOUT_MS = 3500;

self.addEventListener('install', (event) => {
  if (SW_DISABLED) {
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => {
        /* a precache miss must never block activation — offline fallback
           just won't be available until the next successful install */
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (SW_DISABLED) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
        await self.registration.unregister();
        return self.clients.claim();
      }
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('oc-') && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      return self.clients.claim();
    })(),
  );
});

/** Trim a cache to `max` entries, oldest (by insertion order) first. */
async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  const excess = keys.length - max;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

function timeoutAfter(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('sw-nav-timeout')), ms));
}

async function handleNavigation(request) {
  try {
    const response = await Promise.race([fetch(request), timeoutAfter(NAV_TIMEOUT_MS)]);
    if (response && response.ok) {
      const cache = await caches.open(PAGES_CACHE);
      // Never let a caching failure surface as a navigation failure.
      cache.put(request, response.clone()).catch(() => {});
      trimCache(PAGES_CACHE, PAGES_LIMIT).catch(() => {});
      return response;
    }
    return response; // a real 4xx/5xx from the network — show it, don't mask it
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match('/offline/');
    return offline || Response.error();
  }
}

async function handleAssetCacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(ASSETS_CACHE);
      cache.put(request, response.clone()).catch(() => {});
      trimCache(ASSETS_CACHE, ASSETS_LIMIT).catch(() => {});
    }
    return response;
  } catch {
    return Response.error();
  }
}

async function handleStaleWhileRevalidate(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => undefined);
  if (cached) return cached;
  const fromNetwork = await network;
  return fromNetwork || Response.error();
}

self.addEventListener('fetch', (event) => {
  if (SW_DISABLED) return; // passthrough — the browser handles it natively

  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(handleAssetCacheFirst(request));
    return;
  }
  if (url.pathname.startsWith('/pagefind/') || /\.(?:png|svg|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(handleStaleWhileRevalidate(request));
  }
});

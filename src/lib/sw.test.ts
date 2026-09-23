// Service worker gate: loads scripts/sw.template.js, stamps its placeholders
// exactly the way scripts/gen-sw.mjs does, and runs it in a node:vm sandbox
// with a fake `self`, `fetch` and `caches`. The point is the failure mode that
// matters to a visitor: cache storage that throws (quota, private mode, a
// corrupted profile) must never cost them a response the network delivered.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'https://opscanopy.com';

/** The template as gen-sw.mjs:49-51 renders it into dist/sw.js. */
function renderTemplate(): string {
  const template = readFileSync(join(ROOT, 'scripts/sw.template.js'), 'utf-8');
  return template
    .replace(/__BUILD_ID__/g, 'test123')
    .replace('__PRECACHE_URLS__', JSON.stringify(['/offline/', '/_astro/offline.css']));
}

type Req = { url: string; method: string; mode: string };
type Handler = (event: unknown) => void;

const keyOf = (req: Req | string) => (typeof req === 'string' ? new URL(req, ORIGIN).href : req.url);

/** A working CacheStorage: named Map-backed caches, insertion-ordered. */
function workingCaches(seed: Record<string, Record<string, Response>> = {}) {
  const store = new Map<string, Map<string, Response>>();
  const openSync = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const entries = store.get(name)!;
    return {
      match: async (req: Req | string) => entries.get(keyOf(req))?.clone(),
      put: async (req: Req | string, res: Response) => void entries.set(keyOf(req), res),
      keys: async () => [...entries.keys()],
      delete: async (key: string) => entries.delete(key),
      addAll: async () => {},
    };
  };
  for (const [name, items] of Object.entries(seed)) {
    const entries = openSync(name);
    for (const [url, res] of Object.entries(items)) void entries.put(url, res);
  }
  return {
    store,
    open: async (name: string) => openSync(name),
    match: async (req: Req | string) => {
      for (const entries of store.values()) {
        const hit = entries.get(keyOf(req));
        if (hit) return hit.clone();
      }
      return undefined;
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
  };
}

/** CacheStorage whose every method throws synchronously (SecurityError-style). */
function throwingCaches() {
  const boom = () => {
    throw new Error('SecurityError: cache storage unavailable');
  };
  return { open: boom, match: boom, keys: boom, delete: boom };
}

/** CacheStorage whose every method returns a rejected promise (QuotaExceeded-style). */
function rejectingCaches() {
  const boom = () => Promise.reject(new Error('QuotaExceededError'));
  return { open: boom, match: boom, keys: boom, delete: boom };
}

interface Env {
  caches: unknown;
  fetch: (req: Req) => Promise<Response>;
  /** Default: a timer that never fires, so the nav timeout stays out of the way. */
  setTimeout?: (fn: () => void, ms: number) => unknown;
}

function loadSw(env: Env): Record<string, Handler> {
  const listeners: Record<string, Handler> = {};
  const self = {
    addEventListener: (type: string, fn: Handler) => {
      listeners[type] = fn;
    },
    location: { origin: ORIGIN },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    registration: { unregister: async () => true },
  };
  const context = vm.createContext({
    self,
    caches: env.caches,
    fetch: env.fetch,
    Response,
    URL,
    setTimeout: env.setTimeout ?? (() => 0),
    console,
  });
  vm.runInContext(renderTemplate(), context);
  return listeners;
}

/** Dispatch a fetch event; resolve to what respondWith was given, plus any waitUntil work. */
async function dispatch(listeners: Record<string, Handler>, path: string, mode: string) {
  let responded: Promise<Response> | undefined;
  const waits: Promise<unknown>[] = [];
  const event = {
    request: { url: new URL(path, ORIGIN).href, method: 'GET', mode },
    respondWith: (p: Promise<Response>) => {
      responded = p;
    },
    waitUntil: (p: Promise<unknown>) => {
      waits.push(p);
    },
  };
  listeners.fetch(event);
  expect(responded, `respondWith was not called for ${path}`).toBeDefined();
  const response = await responded!;
  await Promise.all(waits);
  return response;
}

const networkOk = (body = 'network') => async () => new Response(body, { status: 200 });

describe('service worker template', () => {
  it('stamps every placeholder (nothing left for gen-sw.mjs to miss)', () => {
    const rendered = renderTemplate();
    expect(rendered).not.toMatch(/__BUILD_ID__|__PRECACHE_URLS__/);
    expect(rendered).toContain("const BUILD_ID = 'test123';");
  });
});

for (const [label, makeCaches] of [
  ['throwing', throwingCaches],
  ['rejecting', rejectingCaches],
] as const) {
  describe(`cache storage ${label} — the network response still reaches the page`, () => {
    it('navigation', async () => {
      const sw = loadSw({ caches: makeCaches(), fetch: networkOk('page') });
      const res = await dispatch(sw, '/subnet-calculator/', 'navigate');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('page');
    });

    it('cache-first /_astro/ asset', async () => {
      const sw = loadSw({ caches: makeCaches(), fetch: networkOk('asset') });
      const res = await dispatch(sw, '/_astro/index.abc123.js', 'no-cors');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('asset');
    });

    it('stale-while-revalidate /pagefind/ asset', async () => {
      const sw = loadSw({ caches: makeCaches(), fetch: networkOk('index') });
      const res = await dispatch(sw, '/pagefind/pagefind.js', 'cors');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('index');
    });
  });
}

describe('working cache storage (control)', () => {
  it('navigation: returns the network page and caches it', async () => {
    const caches = workingCaches();
    const sw = loadSw({ caches, fetch: networkOk('page') });
    const res = await dispatch(sw, '/cron-expression-tester/', 'navigate');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('page');
    expect(caches.store.get('oc-pages-test123')?.has(`${ORIGIN}/cron-expression-tester/`)).toBe(true);
  });

  it('cache-first asset: serves the cached copy without touching the network', async () => {
    const caches = workingCaches({
      'oc-assets-test123': { '/_astro/a.js': new Response('cached', { status: 200 }) },
    });
    const sw = loadSw({
      caches,
      fetch: async () => {
        throw new Error('network must not be hit');
      },
    });
    const res = await dispatch(sw, '/_astro/a.js', 'no-cors');
    expect(await res.text()).toBe('cached');
  });

  it('cache-first asset: fetches and caches on a miss', async () => {
    const caches = workingCaches();
    const sw = loadSw({ caches, fetch: networkOk('asset') });
    const res = await dispatch(sw, '/_astro/b.js', 'no-cors');
    expect(await res.text()).toBe('asset');
    expect(caches.store.get('oc-assets-test123')?.has(`${ORIGIN}/_astro/b.js`)).toBe(true);
  });

  it('stale-while-revalidate: serves stale, refreshes in the background', async () => {
    const caches = workingCaches({
      'oc-assets-test123': { '/pagefind/pagefind.js': new Response('stale', { status: 200 }) },
    });
    const sw = loadSw({ caches, fetch: networkOk('fresh') });
    const res = await dispatch(sw, '/pagefind/pagefind.js', 'cors');
    expect(await res.text()).toBe('stale');
    // waitUntil (awaited in dispatch) or a settled microtask queue lands the refresh.
    await new Promise((r) => setTimeout(r, 10));
    const refreshed = await caches.store.get('oc-assets-test123')?.get(`${ORIGIN}/pagefind/pagefind.js`)?.clone().text();
    expect(refreshed).toBe('fresh');
  });

  it('navigation offline with nothing cached: serves the precached /offline/ shell', async () => {
    const caches = workingCaches({
      'oc-precache-test123': { '/offline/': new Response('offline shell', { status: 200 }) },
    });
    const sw = loadSw({
      caches,
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const res = await dispatch(sw, '/jwt-decoder/', 'navigate');
    expect(await res.text()).toBe('offline shell');
  });
});

describe('navigation timeout', () => {
  // A nav timer that fires at once, and a network that answers a moment later:
  // the page is slow, not offline.
  const fireNow = (fn: () => void) => setTimeout(fn, 0);
  const slowNetwork = (body: string) => () =>
    new Promise<Response>((resolve) => setTimeout(() => resolve(new Response(body, { status: 200 })), 30));

  it('with nothing cached, waits for the slow network instead of serving /offline/', async () => {
    const caches = workingCaches({
      'oc-precache-test123': { '/offline/': new Response('offline shell', { status: 200 }) },
    });
    const sw = loadSw({ caches, fetch: slowNetwork('slow page'), setTimeout: fireNow });
    const res = await dispatch(sw, '/subnet-splitter/', 'navigate');
    expect(await res.text()).toBe('slow page');
  });

  it('with the page cached, serves the cached copy on timeout', async () => {
    const caches = workingCaches({
      'oc-pages-test123': { '/subnet-splitter/': new Response('cached page', { status: 200 }) },
    });
    const sw = loadSw({ caches, fetch: slowNetwork('slow page'), setTimeout: fireNow });
    const res = await dispatch(sw, '/subnet-splitter/', 'navigate');
    expect(await res.text()).toBe('cached page');
  });
});

/**
 * The homepage devtools panel (`home/PrivacyProof.astro`) reports two numbers
 * this visit actually produced instead of asserting them: requests made by the
 * page and cookies this origin can see. The server renders a dash in both
 * cells (no number it cannot measure), which is what crawlers and no-JS
 * readers see; this module fills them once the page has loaded. `data-ssr` on
 * the requests cell is only the floor `countRequests` never reports below.
 *
 * Pure and DOM-shaped (like mark-changed.ts) so it is tested in node.
 *
 * Why the caller is HeroDemo's island and not a `<script>` in PrivacyProof:
 * Astro inlines a component script that imports nothing and is small, and
 * every inline script adds a hash to the CSP in `_headers`
 * (`scripts/inject-csp-hashes.mjs`). The inline set is pinned at 11 by the
 * ssr-diff postbuild comparison, so this rides the homepage's existing
 * external island instead. If HeroDemo ever leaves the homepage, the panel
 * keeps its server-rendered values: it degrades to the SSR text, never to a
 * wrong number.
 */

/** Cookies visible in a `document.cookie` string (empty pairs ignored). */
export function countCookies(cookie: string): number {
  if (!cookie) return 0;
  return cookie.split(';').filter((c) => c.trim()).length;
}

/**
 * Requests made by this page: the document itself plus every resource entry
 * (scripts, styles, fonts, the analytics beacon). Never below the SSR default.
 */
export function countRequests(resourceEntries: number, ssrDefault: number): number {
  const measured = resourceEntries + 1;
  return Math.max(measured, Number.isFinite(ssrDefault) ? ssrDefault : 1);
}

interface ReadoutCell {
  textContent: string | null;
  dataset: { ssr?: string };
}
interface ReadoutRoot {
  querySelector(selector: string): ReadoutCell | null;
}
export interface ReadoutEnv {
  /** `() => performance.getEntriesByType('resource').length`; may throw. */
  resources: () => number;
  /** `() => document.cookie`; may throw under some privacy settings. */
  cookie: () => string;
}

/**
 * Fill `[data-pp="requests"]` and `[data-pp="cookies"]` under `root`. A probe
 * that throws leaves that cell's server-rendered value in place.
 */
export function fillPrivacyReadout(root: ReadoutRoot | null, env: ReadoutEnv): void {
  if (!root) return;
  const req = root.querySelector('[data-pp="requests"]');
  const ck = root.querySelector('[data-pp="cookies"]');
  if (req) {
    try {
      req.textContent = String(countRequests(env.resources(), Number(req.dataset.ssr ?? '1')));
    } catch {
      /* Performance API unavailable: the SSR value stands. */
    }
  }
  if (ck) {
    try {
      ck.textContent = String(countCookies(env.cookie()));
    } catch {
      /* document.cookie threw: the SSR value stands. */
    }
  }
}

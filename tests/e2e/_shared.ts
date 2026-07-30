/**
 * Shared, tool-agnostic helpers for the E2E journey suite (J1–J8).
 *
 * Deliberately NOT in `tools.fixtures.ts`: that file is a merge hotspot every
 * wave builder appends to, so it stays a pure data table. Everything reusable
 * lives here instead.
 *
 * Selector policy: attribute selectors, never id prefixes. Every playground
 * uses its own prefix (`cdc-`, `snc-`, `jy-`, `jq-`…), so `#cdc-chips` would
 * only ever work for one tool. The conventions below are repo-wide and were
 * read out of `src/components/CidrCheckerPlayground.astro` +
 * `SubnetCalculatorPlayground.astro` (the two contract-compliant references):
 *
 *   - the island itself       `<section aria-label="… playground">` (29/29)
 *   - example chips           `[role="group"][aria-label="Examples"] > button`
 *   - per-row copy            `[data-copy]` (excluding the two below, which
 *                             also carry `data-copy` for the shared handler)
 *   - copy-all               `[data-copy-all]`
 *   - copy-link (share)      `[data-copy-link]` — hidden until valid, and
 *                             absent entirely on the no-deep-link tools
 *   - status summary          `[role="status"]` that is not `.sr-only`
 *   - copy status             `.sr-only[role="status"]`
 *   - snapshot row            ids all end `-snap-save` / `-snap-select` /
 *                             `-snap-delete` (wireSnapshotUI convention)
 *
 * SCOPE, and it matters: `#playground` is the PAGE SECTION, not the island.
 * Tool pages put sibling components inside that same section (visualizers,
 * copy-bearing code blocks…) — `/subnet-calculator/` has SIX `role="status"`
 * elements under `#playground` but only TWO in the island. So contract
 * assertions scope to `SEL.island`; only the analytics scope stays `#playground`,
 * because that is what Layout.astro's listeners themselves use.
 *
 * The island scope depends on the `aria-label="… playground"` convention that
 * all 29 existing playgrounds follow. New playgrounds must keep it (it is the
 * accessible name of the region, so it is worth having regardless).
 *
 * ERROR DETECTION is deliberately NOT selector-based. `role="alert"` is not a
 * dependable marker: SubnetCalculatorPlayground's `renderError` takes an
 * `isAlert` flag and omits the role for typed input on purpose, so a
 * mid-composition diagnostic is not announced assertively. The dependable,
 * tool-agnostic signals are the fixture's own pinned `calmErrorString` in the
 * results plus `aria-invalid="true"` on the input — see `errorSignals`.
 */
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { ToolFixture } from './tools.fixtures';

/**
 * The UX-contract hint line, copied byte-for-byte out of
 * `src/components/CidrCheckerPlayground.astro` (line 40). The dash is U+2014 EM
 * DASH, not a hyphen. Asserted in ENGLISH on every locale by J8 — playground UI
 * strings are intentionally untranslated (CLAUDE.md, "Localized pages").
 */
export const HINT_LINE = 'Results update as you type — press Enter to run now.';

/** localStorage key read by Layout.astro's pre-paint Consent Mode v2 block. */
export const CONSENT_KEY = 'oc-analytics-consent';

/** The analytics scope — what Layout.astro's own listeners use. */
const PLAYGROUND = '#playground';
/** The island scope — the playground component only, excluding page siblings. */
const ISLAND = '#playground section[aria-label$="playground"]';

/** Tool-agnostic selectors. Everything contract-related is island-scoped. */
export const SEL = {
  playground: PLAYGROUND,
  island: ISLAND,
  chips: `${ISLAND} [role="group"][aria-label="Examples"] button`,
  /** Per-row copy buttons only: copy-all and copy-link also carry `data-copy`. */
  copyRow: `${ISLAND} [data-copy]:not([data-copy-all]):not([data-copy-link])`,
  copyAll: `${ISLAND} [data-copy-all]`,
  copyLink: `${ISLAND} [data-copy-link]`,
  anyCopy: `${ISLAND} [data-copy], ${ISLAND} [data-copy-all], ${ISLAND} [data-copy-link]`,
  /** The one-line visible live region (the sole visible live region). */
  summaryStatus: `${ISLAND} [role="status"]:not(.sr-only)`,
  /** The screen-reader-only copy-status span. */
  copyStatus: `${ISLAND} .sr-only[role="status"]`,
  /** Assertive diagnostic, where a tool chooses to announce one. See `errorSignals`. */
  alert: `${ISLAND} [role="alert"]`,
  snapSave: `${ISLAND} [id$="-snap-save"]`,
  snapSelect: `${ISLAND} [id$="-snap-select"]`,
  snapDelete: `${ISLAND} [id$="-snap-delete"]`,
  cmContent: `${ISLAND} .cm-content`,
  cmEditor: `${ISLAND} .cm-editor`,
} as const;

/** `/slug/` or `/de/slug/`. Trailing slash: the site builds directory-format URLs. */
export function toolPath(slug: string, locale?: string): string {
  return locale ? `/${locale}/${slug}/` : `/${slug}/`;
}

/**
 * Keep the suite fully offline. Layout.astro's inline gtag shim defines
 * `window.gtag` and pushes into `window.dataLayer` whether or not the remote
 * gtag.js ever loads, so blocking the request changes nothing we assert — it
 * only removes a network dependency (and its flake) from every run.
 */
export async function blockAnalytics(page: Page): Promise<void> {
  await page.route(/googletagmanager\.com|google-analytics\.com/, (route) => route.abort());
}

export type ConsentState = 'granted' | 'denied' | 'absent';

/**
 * Seed the consent choice BEFORE any page script runs — Layout.astro reads the
 * key in a pre-paint inline block, so setting it after navigation would be too
 * late to affect the `consent update` push.
 */
export async function seedConsent(context: BrowserContext, state: ConsentState): Promise<void> {
  await context.addInitScript(
    ([key, value]: [string, string | null]) => {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        /* storage blocked — the page guards its own read the same way */
      }
    },
    [CONSENT_KEY, state === 'absent' ? null : state] as [string, string | null],
  );
}

export function resultsOf(page: Page, fixture: ToolFixture): Locator {
  return page.locator(fixture.resultsSelector);
}

export function inputOf(page: Page, fixture: ToolFixture): Locator {
  return page.locator(fixture.inputSelector);
}

/** Snapshot of every calm-error signal at one instant. See the header note. */
export interface ErrorSignals {
  /** The engine's pinned diagnostic is visible in the results. */
  diagnostic: boolean;
  /** The input carries the red-border flag. */
  ariaInvalid: boolean;
  /** An assertive `role="alert"` card exists (some tools omit it on purpose). */
  alerts: number;
}

export async function errorSignals(page: Page, fixture: ToolFixture): Promise<ErrorSignals> {
  const [text, ariaInvalid, alerts] = await Promise.all([
    resultsOf(page, fixture)
      .innerText()
      .catch(() => ''),
    inputOf(page, fixture).getAttribute('aria-invalid'),
    page.locator(SEL.alert).count(),
  ]);
  return {
    diagnostic: text.includes(fixture.calmErrorString),
    ariaInvalid: ariaInvalid === 'true',
    alerts,
  };
}

/** True when NO calm-error signal is showing. */
export function isCalm(signals: ErrorSignals): boolean {
  return !signals.diagnostic && !signals.ariaInvalid && signals.alerts === 0;
}

/**
 * Wait until the island has booted and its engine is usable. For `cm-wasm` that
 * includes the jq WASM fetch + instantiation, which the playground covers with
 * a "loading jq 1.8.2" placeholder — generous timeout because the first visit
 * downloads ~350 KB compressed.
 */
export async function waitForEngineReady(page: Page, fixture: ToolFixture): Promise<void> {
  await expect(page.locator(SEL.playground)).toBeVisible();
  await expect(inputOf(page, fixture).first()).toBeVisible();
  if (fixture.family !== 'textarea') {
    await expect(page.locator(SEL.cmContent).first()).toBeVisible();
  }
  if (fixture.family === 'cm-wasm') {
    await expect(resultsOf(page, fixture)).not.toContainText(/loading jq/i, { timeout: 60_000 });
  }
}

export interface OpenToolOptions {
  /** Locale prefix, e.g. `'de'`. Omit for the un-prefixed English route. */
  locale?: string;
  /** Fragment appended verbatim to the URL, e.g. `'#s=10.0.0.0%2F8'`. */
  hash?: string;
  /** Skip the boot-ready wait (for pages expected to render a diagnostic only). */
  skipReadyWait?: boolean;
}

/** Block analytics, navigate to the tool, wait for boot. */
export async function openTool(
  page: Page,
  fixture: ToolFixture,
  options: OpenToolOptions = {},
): Promise<void> {
  await blockAnalytics(page);
  await page.goto(toolPath(fixture.slug, options.locale) + (options.hash ?? ''));
  if (!options.skipReadyWait) await waitForEngineReady(page, fixture);
}

/** Focus the input and empty it, for `<textarea>`/`<input>` and CodeMirror alike. */
export async function clearInput(page: Page, fixture: ToolFixture): Promise<void> {
  const input = inputOf(page, fixture);
  await input.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
}

/** Real keystrokes, one at a time — the only way to exercise debounce timing. */
export async function typeInput(
  page: Page,
  fixture: ToolFixture,
  text: string,
  delay = 40,
): Promise<void> {
  await clearInput(page, fixture);
  await inputOf(page, fixture).pressSequentially(text, { delay });
}

/** Fast set (no per-key delay) for tests that are not about typing timing. */
export async function setInput(page: Page, fixture: ToolFixture, text: string): Promise<void> {
  await inputOf(page, fixture).fill(text);
}

/**
 * Read the input back. CodeMirror virtualizes long documents, so for `cm` /
 * `cm-wasm` this is only dependable for short inputs — round-trip assertions on
 * large documents should compare the RESULTS text instead.
 */
export async function readInputText(page: Page, fixture: ToolFixture): Promise<string> {
  const input = inputOf(page, fixture);
  if (fixture.family === 'textarea') return input.inputValue();
  return input.innerText();
}

/**
 * `window.dataLayer` normalized to arrays. Every `gtag(...)` call pushes an
 * `arguments` object, which JSON-serializes as `{0:…,1:…}` and would compare
 * wrong — so convert in-page, before it crosses the bridge.
 */
export async function readDataLayer(page: Page): Promise<unknown[][]> {
  return page.evaluate(() => {
    const dl = (window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer;
    if (!dl) return [] as unknown[][];
    return Array.from(dl).map((entry) =>
      entry && typeof entry === 'object' ? Array.from(entry as ArrayLike<unknown>) : [entry],
    );
  });
}

/** Payloads of every `gtag('consent', mode, {...})` call, in push order. */
export function consentPayloads(
  dataLayer: unknown[][],
  mode: 'default' | 'update',
): Record<string, unknown>[] {
  return dataLayer
    .filter((entry) => entry[0] === 'consent' && entry[1] === mode)
    .map((entry) => (entry[2] ?? {}) as Record<string, unknown>);
}

/** Names of every `gtag('event', name, {...})` call, in push order. */
export function gaEventNames(dataLayer: unknown[][]): string[] {
  return dataLayer.filter((entry) => entry[0] === 'event').map((entry) => String(entry[1]));
}

/** Current URL fragment as the browser sees it (`''` when absent). */
export function readHash(page: Page): Promise<string> {
  return page.evaluate(() => window.location.hash);
}

/** True when focus is inside a CodeMirror editor. */
export function focusIsInCodeMirror(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const active = document.activeElement;
    return !!(active && active.closest('.cm-editor'));
  });
}

/**
 * Assert every visible element matched by `selector` meets the coarse-pointer
 * tap-target floor. Hidden controls (`copy-link`/`copy-all` before a valid
 * result) have no box and are skipped — they are measured once visible.
 */
export async function assertTapTargets(
  page: Page,
  selector: string,
  minPx = 44,
): Promise<number> {
  const all = page.locator(selector);
  const count = await all.count();
  let measured = 0;
  for (let i = 0; i < count; i += 1) {
    const control = all.nth(i);
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    expect(box, `tap target ${selector} #${i} has no bounding box`).not.toBeNull();
    expect(
      box!.height,
      `tap target ${selector} #${i} is ${box!.height}px tall, contract floor is ${minPx}px`,
    ).toBeGreaterThanOrEqual(minPx);
    measured += 1;
  }
  return measured;
}

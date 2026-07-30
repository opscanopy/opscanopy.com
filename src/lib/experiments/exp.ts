/**
 * A/B experiment assignment — one versioned localStorage blob (`oc-exp-v1`),
 * read/written only through this module, mirroring [[tool-prefs/prefs]]: pure
 * parse/serialize/transform helpers (unit-tested directly) plus the two thin
 * storage-touching wrappers `getVariant` uses. Never throws — a blocked,
 * missing or over-quota localStorage, and any junk in the stored JSON, all
 * degrade to variant `'a'` (the control), never to an error.
 *
 * **No-flicker by construction**: callers branch inside their boot closure
 * BEFORE first render of the experimental element. Nothing here may ever run
 * from the pre-paint theme/consent inline scripts.
 *
 * **`ACTIVE_EXPERIMENTS` is the kill switch**: an id not in that list is
 * never assigned, never persisted, and always returns `'a'` — removing an id
 * ends the experiment for everyone on the next page view, with no code change
 * in the playground that reads it.
 *
 * **Analytics stays a caller concern**: `exposurePayload()` returns the plain
 * event params and nothing more (no `gtag`, no `window`) — the playground
 * fires `exp_exposure` itself through `safeGtag`. Only enum-shaped values
 * (validated ids and the `'a'`/`'b'` literal) ever reach the payload, so user
 * input, hostnames and tool payloads cannot leak into analytics from here.
 *
 * No live-sync across tabs (same accepted tradeoff as [[tool-prefs/prefs]]):
 * each read-modify-write reads the CURRENT value, last-writer-wins. Two tabs
 * racing a first assignment could land on different variants for one visitor;
 * at 50/50 over thousands of exposures that is noise, not bias.
 */

export const EXP_PREFS_KEY = 'oc-exp-v1';

export type Variant = 'a' | 'b';

export interface Assignment {
  variant: Variant;
  /** ISO timestamp of the read that first assigned this variant. */
  at: string;
}

export interface ExpPrefs {
  v: 1;
  assignments: Record<string, Assignment>;
}

export interface ExposurePayload {
  experiment_id: string;
  variant: Variant;
  tool: string;
}

/** Result of a pure assignment attempt — `prefs` is unchanged unless `assigned`. */
export interface AssignResult {
  prefs: ExpPrefs;
  variant: Variant;
  /** True only when this call minted a NEW assignment the caller should persist. */
  assigned: boolean;
}

/** Far above the 5 planned experiments — a cap only a corrupt/hostile blob hits. */
const MAX_ASSIGNMENTS = 20;

const EMPTY: ExpPrefs = { v: 1, assignments: {} };

/**
 * The five experiments defined by the validation-layer A/B program, as the
 * kebab-case ids their playgrounds will pass to `getVariant()`. They are
 * documented here rather than exported so a tool can opt in by adding exactly
 * one string to `ACTIVE_EXPERIMENTS` — and opt out by removing it:
 *
 * - `jq-wasm-load-timing` — jq playground: eager-idle WASM load (A, the plan
 *   default) vs load-on-first-interaction (B). Primary `first_result`
 *   elapsed_ms; guardrail `engine_load_failed` rate.
 * - `chip-count-4-vs-6` — json-yaml + url-encoder: 4 example chips (A) vs 6
 *   (B). Primary `example_chip_click`/exposure; guardrail `tool_engaged` ±3%.
 * - `terraform-copy-placement` — terraform tool: Copy-summary-as-Markdown
 *   button above the report (A) vs below it (B). Primary `result_copied`.
 * - `cert-hostname-visibility` — certificate decoder: hostname-match field
 *   visible (A) vs collapsed (B). Primary `hostname_checked` rate (boolean
 *   only — never the hostname itself).
 * - `data-size-band-default` — data-size converter: transfer band expanded
 *   (A) vs collapsed (B) by default. Primary `band_opened`/input.
 *
 * Guardrails that live outside this module: experiments only on the 10 NEW
 * tools, max ONE experiment per tool page, and no UX-contract item (hint
 * line, debounce, calm-error hold, copy affordances, `role="status"`,
 * glossary caption, 44px coarse targets, `escapeHtml`) is ever experimentable.
 */
export const ACTIVE_EXPERIMENTS: readonly string[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Experiment ids never collide with these — reject explicitly (see tool-prefs/prefs.ts). */
const RESERVED = new Set(['constructor', 'prototype', '__proto__']);

/**
 * True for a plausible experiment id / tool slug: lowercase letters, digits,
 * internal hyphens. Doubles as the tool-slug guard in `exposurePayload`, which
 * is what keeps free-text out of analytics params structurally.
 */
function isExpId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) &&
    !RESERVED.has(value)
  );
}

function isVariant(value: unknown): value is Variant {
  return value === 'a' || value === 'b';
}

/**
 * Defensively parse the raw localStorage string. Never throws: null, empty,
 * non-JSON garbage, arrays, and wrong-shaped JSON all salvage to empty.
 *
 * Unlike [[tool-prefs/prefs]] — which ignores `v` and salvages field by field
 * — an unrecognized version is discarded wholesale. A preference read from an
 * unknown schema is a cosmetic mistake; an ASSIGNMENT read from one silently
 * mixes two schemas' cohorts into one experiment's numbers, so a stale blob is
 * better re-rolled than half-trusted.
 */
export function parseExpPrefs(raw: string | null): ExpPrefs {
  if (raw === null || raw === '') return EMPTY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (!isRecord(parsed) || parsed.v !== 1) return EMPTY;
  if (!isRecord(parsed.assignments)) return EMPTY;
  const assignments: Record<string, Assignment> = {};
  for (const [expId, a] of Object.entries(parsed.assignments)) {
    if (!isExpId(expId) || !isRecord(a)) continue;
    if (!isVariant(a.variant)) continue;
    if (typeof a.at !== 'string' || Number.isNaN(Date.parse(a.at))) continue;
    assignments[expId] = { variant: a.variant, at: a.at };
    if (Object.keys(assignments).length >= MAX_ASSIGNMENTS) break;
  }
  return { v: 1, assignments };
}

export function serializeExpPrefs(prefs: ExpPrefs): string {
  return JSON.stringify(prefs);
}

/** True when `expId` is currently running — the kill switch every read passes through. */
export function isActive(expId: string): boolean {
  return isExpId(expId) && ACTIVE_EXPERIMENTS.includes(expId);
}

/** The variant already stored for `expId`, or null when unassigned/malformed. */
export function storedVariant(prefs: ExpPrefs, expId: string): Variant | null {
  if (!isExpId(expId)) return null;
  return prefs.assignments[expId]?.variant ?? null;
}

/**
 * Pure 50/50 assignment with the coin flip INJECTED (`roll` in `[0, 1)`, as
 * from `Math.random()`): `roll < 0.5` → `'a'`, `roll >= 0.5` → `'b'`. Existing
 * assignments are returned untouched, which is what makes a variant stable
 * across page views. Note this does NOT consult `ACTIVE_EXPERIMENTS` — the
 * kill switch is applied by `getVariant()`, so tests can exercise assignment
 * math with nothing live.
 *
 * A malformed id or an out-of-range/non-finite `roll` yields the control with
 * `assigned: false` and prefs unchanged — never persist a coin flip we did not
 * actually make.
 */
export function assignVariant(
  prefs: ExpPrefs,
  expId: string,
  roll: number,
  atIso?: string,
): AssignResult {
  if (!isExpId(expId)) return { prefs, variant: 'a', assigned: false };

  const existing = prefs.assignments[expId];
  if (existing && isVariant(existing.variant)) {
    return { prefs, variant: existing.variant, assigned: false };
  }

  if (typeof roll !== 'number' || !Number.isFinite(roll) || roll < 0 || roll >= 1) {
    return { prefs, variant: 'a', assigned: false };
  }
  if (Object.keys(prefs.assignments).length >= MAX_ASSIGNMENTS) {
    return { prefs, variant: 'a', assigned: false };
  }

  const variant: Variant = roll < 0.5 ? 'a' : 'b';
  const at =
    typeof atIso === 'string' && !Number.isNaN(Date.parse(atIso))
      ? atIso
      : new Date().toISOString();
  return {
    prefs: { v: 1, assignments: { ...prefs.assignments, [expId]: { variant, at } } },
    variant,
    assigned: true,
  };
}

/**
 * The GA4 `exp_exposure` params for one exposure — a plain object, nothing
 * else. Deliberately does NOT touch `gtag`/`window`: the playground fires the
 * event through `safeGtag` on boot. Anything that isn't a valid kebab-case id
 * or an `'a'`/`'b'` literal is replaced with `''`/`'a'`, so no user content,
 * hostname or payload can ever ride along.
 */
export function exposurePayload(
  expId: string,
  variant: Variant,
  toolSlug: string,
): ExposurePayload {
  return {
    experiment_id: isExpId(expId) ? expId : '',
    variant: isVariant(variant) ? variant : 'a',
    tool: isExpId(toolSlug) ? toolSlug : '',
  };
}

/* --- storage-touching halves (SSR-safe, never throw) --------------------- */

/** `localStorage` when usable, else null — absent under SSR, throws when blocked. */
function storageOrNull(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readExpPrefs(store: Storage): ExpPrefs {
  try {
    return parseExpPrefs(store.getItem(EXP_PREFS_KEY));
  } catch {
    return EMPTY;
  }
}

/** False when the write was refused (blocked storage, quota exceeded). */
function writeExpPrefs(store: Storage, prefs: ExpPrefs): boolean {
  try {
    store.setItem(EXP_PREFS_KEY, serializeExpPrefs(prefs));
    return true;
  } catch {
    return false;
  }
}

/**
 * The one call a playground makes, inside its boot closure. Returns `'a'` when
 * `expId` is not in `ACTIVE_EXPERIMENTS` (kill switch) and on ANY failure;
 * otherwise reads the blob, assigns 50/50 and persists on first read, and
 * returns that same value on every later read.
 *
 * An assignment we cannot PERSIST is not stable, so unavailable storage and a
 * refused write both serve the control rather than a variant that would re-roll
 * on the visitor's next page view and smear their behaviour across both arms.
 * That also makes the function deterministic under SSR (no localStorage → the
 * control), which is what keeps a variant from ever flickering in.
 */
export function getVariant(expId: string): Variant {
  try {
    if (!isActive(expId)) return 'a';
    const store = storageOrNull();
    if (store === null) return 'a';
    const result = assignVariant(readExpPrefs(store), expId, Math.random());
    if (!result.assigned) return result.variant;
    return writeExpPrefs(store, result.prefs) ? result.variant : 'a';
  } catch {
    return 'a';
  }
}

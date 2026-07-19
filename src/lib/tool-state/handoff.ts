/**
 * Secret-safe cross-tool handoff — one sessionStorage key (`oc-handoff-v1`),
 * read exactly once. Unlike the R2/R3 URL-hash share links, a value carried
 * this way never touches the URL bar, browser history, a referrer header, or
 * a wiki/chat link-unfurler — the reason those tools (jwt-decoder, hash-
 * generator, base64-encoder-decoder, env-example-checker) were excluded from
 * `#`-based sharing in the first place. sessionStorage (not localStorage) so
 * it never outlives the tab; read-once so a stale or replayed value can't
 * silently reappear on a later visit to the destination page.
 *
 * `parseHandoff`/`buildHandoff` are pure and unit-tested directly.
 * `writeHandoff`/`readHandoffOnce` bind them to sessionStorage — untestable
 * under this project's node-environment vitest config (same as every other
 * storage-writing wrapper here), verified instead via Playwright.
 */

export const HANDOFF_KEY = 'oc-handoff-v1';

export function buildHandoff(value: string): string {
  return JSON.stringify({ value });
}

/** Defensively parse the raw sessionStorage string. Never throws. */
export function parseHandoff(raw: string | null): string | null {
  if (raw === null || raw === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const value = (parsed as Record<string, unknown>).value;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Write a value for one destination tool to read exactly once. */
export function writeHandoff(value: string): void {
  try {
    sessionStorage.setItem(HANDOFF_KEY, buildHandoff(value));
  } catch {
    /* storage blocked — the destination tool just won't find a handoff */
  }
}

/** Read the handed-off value, clearing it immediately so it can never be read twice. */
export function readHandoffOnce(): string | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(HANDOFF_KEY);
  } catch {
    return null;
  }
  if (raw !== null) {
    try {
      sessionStorage.removeItem(HANDOFF_KEY);
    } catch {
      /* non-fatal: worst case the value is read again on a rare storage-error retry */
    }
  }
  return parseHandoff(raw);
}

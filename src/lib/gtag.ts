/**
 * Guarded `gtag()` dispatch — never throws, never breaks a page when GA is
 * blocked, absent, or not yet loaded. Variadic so it covers both call shapes
 * in use: `('event', name, params)` and `('consent', 'update', {...})`.
 *
 * NOT usable from `is:inline` classic scripts (they can't import) — the one
 * such site (the GA bootstrap itself, src/layouts/Layout.astro) keeps a
 * local copy of this exact guard, with a comment pointing here.
 */
export function safeGtag(...args: unknown[]): void {
  try {
    const g = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    if (typeof g === 'function') g(...args);
  } catch {
    /* analytics is best-effort — never let it break the page */
  }
}

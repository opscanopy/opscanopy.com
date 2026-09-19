/**
 * mark-changed — the amber "this value just changed" tick on instrument rows.
 *
 * A playground renders its result panel from scratch on every eval, so the
 * user cannot see *which* numbers moved when they edit the input. This helper
 * diffs the keyed values before and after a render and flags the rows whose
 * text changed with `data-changed`, which global.css colours amber for a
 * moment (`[data-changed] { color: var(--color-inverse-accent) }`, with a
 * 120ms colour transition that the reduced-motion guard zeroes).
 *
 * Contract inside a playground:
 *
 *   const prev = snapshotValues(container);   // before renderResult(...)
 *   renderResult(container, result);
 *   markChanged(container, prev);             // pass new Map() on boot/hash seed
 *
 * Rows opt in with a stable key attribute on the VALUE element:
 * `<span data-k="row:Network">10.0.0.0</span>`. Keys present in only one of
 * the two snapshots (a row that appeared or disappeared) are never marked —
 * the tick means "changed", not "new".
 *
 * DOM-shaped rather than DOM-typed so it is testable in vitest's node env.
 */

export interface KeyedElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  textContent: string | null;
}

export interface KeyedRoot {
  /** A NodeList, an array, or any array-like — `Array.from` normalises it. */
  querySelectorAll(selector: string): ArrayLike<KeyedElement> | Iterable<KeyedElement>;
}

export const CHANGED_ATTR = 'data-changed';

/** Keys present in BOTH snapshots whose value differs, in `next` order. */
export function diffKeys(prev: Map<string, string>, next: Map<string, string>): string[] {
  const out: string[] = [];
  for (const [key, value] of next) {
    if (prev.has(key) && prev.get(key) !== value) out.push(key);
  }
  return out;
}

/** `{ key → trimmed text }` for every `[attr]` element under `root`. */
export function snapshotValues(root: KeyedRoot, attr = 'data-k'): Map<string, string> {
  const map = new Map<string, string>();
  for (const el of Array.from(root.querySelectorAll(`[${attr}]`))) {
    const key = el.getAttribute(attr);
    if (key !== null) map.set(key, (el.textContent ?? '').trim());
  }
  return map;
}

export interface MarkChangedOptions {
  /** How long the tick stays on. Default 700ms (120ms fade + a beat to read). */
  ttlMs?: number;
  /** Key attribute name. Default `data-k`. */
  attr?: string;
}

/* One timer per root so a fast second eval restarts the clock instead of
   clearing the fresh marks early. */
const timers = new WeakMap<object, ReturnType<typeof setTimeout>>();

/**
 * Compare `prev` (taken before the re-render) with the live DOM, set the
 * changed attribute on each changed keyed element, and clear all marks under
 * `root` after `ttlMs`. Returns the changed keys (for tests and status lines).
 */
export function markChanged(root: KeyedRoot, prev: Map<string, string>, opts: MarkChangedOptions = {}): string[] {
  const ttlMs = opts.ttlMs ?? 700;
  const attr = opts.attr ?? 'data-k';

  const next = snapshotValues(root, attr);
  const changed = new Set(diffKeys(prev, next));
  if (changed.size === 0) return [];

  const elements = Array.from(root.querySelectorAll(`[${attr}]`));
  for (const el of elements) {
    const key = el.getAttribute(attr);
    if (key !== null && changed.has(key)) el.setAttribute(CHANGED_ATTR, '');
  }

  const existing = timers.get(root);
  if (existing !== undefined) clearTimeout(existing);
  timers.set(
    root,
    setTimeout(() => {
      for (const el of Array.from(root.querySelectorAll(`[${CHANGED_ATTR}]`))) el.removeAttribute(CHANGED_ATTR);
      timers.delete(root);
    }, ttlMs),
  );

  return Array.from(changed);
}

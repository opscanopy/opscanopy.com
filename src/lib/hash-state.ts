/**
 * Generalized `#key=` deep-link fragment helpers, parameterized over the key
 * name — generalizes both halves of the `#ip=` pattern in `ip-hash.ts` (which
 * only has the defensive read; the Safari-guarded `replaceState` +
 * last-value-memo write half previously lived ad hoc in `IpConverterPlayground`).
 *
 * `parseHashValue`/`buildHashValue` are pure and unit-tested directly.
 * `createHashState` binds them to `window.location`/`history` for playground
 * scripts — untestable under the project's node-environment vitest config
 * (see `ip-hash.ts`, which is DOM-touching and has no test file either),
 * verified instead via the manual/Playwright runtime check.
 */

/**
 * Read via `new URL(...)` rather than `location.hash` directly: Firefox
 * returns `location.hash` already percent-decoded, so a value containing an
 * encoded `%` would make `decodeURIComponent` throw; the URL serializer is
 * never pre-decoded.
 */
export function parseHashValue(key: string, rawHash: string): string | null {
  const prefix = `#${key}=`;
  if (!rawHash.startsWith(prefix)) return null;
  try {
    const decoded = decodeURIComponent(rawHash.slice(prefix.length)).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

export function buildHashValue(key: string, value: string): string {
  return `#${key}=${encodeURIComponent(value)}`;
}

export interface HashState {
  /** Reads the current `#key=` fragment, or null if absent/malformed/empty. */
  read(): string | null;
  /** Builds the `#key=value` fragment string (share links, chip hrefs). */
  build(value: string): string;
  /**
   * Writes `value` into the URL via `history.replaceState`, deduped against
   * the last value this call wrote (repeated evaluations of the same input
   * are a no-op) and Safari-guarded: Safari throttles `replaceState` to
   * ~100/30s and throws past that — never let that break input. `null`
   * clears the fragment back to the bare path.
   */
  write(value: string | null): void;
}

/** One instance per playground script, so each owns its own write memo. */
export function createHashState(key: string): HashState {
  let lastWritten: string | null = null;
  return {
    read(): string | null {
      return parseHashValue(key, new URL(window.location.href).hash);
    },
    build(value: string): string {
      return buildHashValue(key, value);
    },
    write(value: string | null): void {
      const target = value ? buildHashValue(key, value) : '';
      if (target === lastWritten) return;
      try {
        if (value) {
          history.replaceState(null, '', target);
        } else {
          history.replaceState(null, '', location.pathname + location.search);
        }
        lastWritten = target;
      } catch {
        /* ignore — Safari's replaceState throttle must never break input */
      }
    },
  };
}

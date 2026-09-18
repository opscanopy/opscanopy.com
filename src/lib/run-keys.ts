/**
 * wireRunKeys — the playground keyboard contract in one place.
 *
 * The UX contract (CLAUDE.md) says a playground evaluates live on a debounce
 * and that Enter forces an immediate run. Thirteen tools implemented some of
 * that by hand and fourteen implemented none of it, so ⌘/Ctrl+Enter — the
 * shortcut every CodeMirror tool has — did nothing on the simple ones.
 *
 * Reference behaviour is CidrCheckerPlayground's handler, the tool CLAUDE.md
 * names as the implementation to port from:
 *
 *   ⌘/Ctrl+Enter  always runs immediately, and releases focus on a touch
 *                 device so the on-screen keyboard stops covering the result.
 *   Enter         depends on the field (see EnterBehaviour) — a textarea must
 *                 still be able to take a newline.
 *
 * Two things this adds over the hand-written copies:
 *
 *   - `isComposing` is respected. Enter commits a candidate in a CJK/IME
 *     composition; running (and on coarse pointers blurring) mid-composition
 *     loses the half-typed word.
 *   - Shift+Enter in a textarea is always a newline, never a run.
 */

/**
 * What plain Enter means for this field.
 *
 * - `run` — run now, and swallow the key. For single-line `<input>`s, and for
 *   the one textarea (case converter) whose contract is deliberately
 *   "Enter commits, Shift+Enter is the newline".
 * - `insert-then-run` — let the newline land, then flush on the next tick, once
 *   the value includes it. The correct choice for any multi-line input.
 * - `ignore` — only ⌘/Ctrl+Enter runs.
 */
export type EnterBehaviour = 'run' | 'insert-then-run' | 'ignore';

export interface RunKeyOptions {
  /** Plain-Enter behaviour. Defaults to `run` (the single-line input case). */
  enter?: EnterBehaviour;
  /**
   * Release focus after a ⌘/Ctrl+Enter (and after a plain-Enter `run`) when the
   * pointer is coarse, so the on-screen keyboard does not hide the result.
   * Defaults to true; pass false where the field is beside its own output.
   */
  blurOnCoarse?: boolean;
}

function isCoarsePointer(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

/**
 * Wire ⌘/Ctrl+Enter (and, per `enter`, plain Enter) on one field to `run`.
 * Safe to call on a null-ish element so callers can stay terse after their
 * own early-return guard.
 */
export function wireRunKeys(
  el: HTMLElement | null | undefined,
  run: () => void,
  opts: RunKeyOptions = {},
): void {
  if (!el) return;
  const enter: EnterBehaviour = opts.enter ?? 'run';
  const blurOnCoarse = opts.blurOnCoarse ?? true;

  el.addEventListener('keydown', (event) => {
    const e = event as KeyboardEvent;
    if (e.key !== 'Enter') return;
    // Mid-IME-composition Enter chooses a candidate; it is not a submit.
    if (e.isComposing) return;

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      run();
      if (blurOnCoarse && isCoarsePointer()) el.blur();
      return;
    }

    if (enter === 'ignore') return;

    if (enter === 'insert-then-run') {
      // No preventDefault: the newline must be inserted. Flush on the next
      // tick, once the field's value actually contains it.
      window.setTimeout(run, 0);
      return;
    }

    // enter === 'run'. In a textarea, Shift+Enter stays the newline.
    if (e.shiftKey && el instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    run();
    if (blurOnCoarse && isCoarsePointer()) el.blur();
  });
}

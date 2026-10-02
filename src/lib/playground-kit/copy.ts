/**
 * Copy plumbing for every playground — lifted from SubnetCalculatorPlayground
 * (the per-row copy, Copy all and Copy link handlers it carried inline), so
 * the 39 islands stop carrying 39 copies of it (plan "Batch C", Wave 0).
 *
 * One delegated click listener on the playground root handles every copy
 * button inside it, server-rendered or injected later by render.ts:
 *
 *   - a button is any `[data-copy]`, `[data-copy-all]` or `[data-copy-link]`
 *     element (the same three hooks Layout.astro's `result_copied` analytics
 *     listener keys on); its payload is `dataset.copy` (empty string if unset);
 *   - on success it swaps the copy icon for the check icon, sets the visible
 *     label to "Copied" (or, for an icon-only button, the aria-label), sets
 *     `data-copied`, and resets after `resetMs`;
 *   - the outcome is announced in the one sr-only `role="status"` span; on
 *     failure that span becomes a visible caption (`data-failed`), because a
 *     silent failed copy is worse than none.
 *
 * Icons and labels are found through the kit hooks (`[data-copy-icon]`,
 * `[data-check-icon]`, `[data-copy-text]`, CopyButton.astro) OR the legacy
 * `<p>-copy-icon` / `<p>-check-icon` / `<p>-copy-label` classes that the
 * render.ts builders still emit. The legacy half exists because Wave 1 must
 * leave the seeded result HTML byte-identical (ssr-diff), so render.ts keeps
 * its classes until a later wave rewrites it; the playground scripts never
 * name those classes themselves (the gate's `kit-selectors` rule).
 *
 * Everything is DOM-shaped (closest / querySelector / dataset / classList /
 * attributes) so src/lib/playground-kit/copy.test.ts drives it with fakes in
 * vitest's node environment, as mark-changed.test.ts does.
 */
import { copyTextToClipboard } from '../clipboard';

export const COPY_BUTTON_SELECTOR = '[data-copy], [data-copy-all], [data-copy-link]';
export const COPY_ICON_SELECTOR = "[data-copy-icon], [class*='-copy-icon']";
export const CHECK_ICON_SELECTOR = "[data-check-icon], [class*='-check-icon']";
export const COPY_LABEL_SELECTOR = "[data-copy-text], [class*='-copy-label']";

export const COPIED_TEXT = 'Copied';
export const STATUS_COPIED = 'Copied to clipboard.';
export const STATUS_FAILED = 'Copy failed — select the value manually.';
export const RESET_MS = 1800;

/** The slice of an element these helpers touch. */
export interface ClassListLike {
  toggle(token: string, force?: boolean): boolean;
}
/** An icon or label inside a button: `Element` fits. */
export interface CopyChildLike {
  textContent: string | null;
  classList: ClassListLike;
}
export interface CopyElLike extends CopyChildLike {
  dataset: Record<string, string | undefined>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(sel: string): CopyChildLike | null;
}
export interface CopyRootLike {
  addEventListener(type: 'click', fn: (e: { target: unknown }) => void): void;
  contains(node: unknown): boolean;
}

export interface CopyOptions {
  /** The sr-only `role="status"` span (ResultPanel's `#<p>-copy-status`). */
  status?: CopyElLike | null;
  /** Override for tests; defaults to the shared clipboard helper. */
  copy?: (text: string) => Promise<boolean>;
  resetMs?: number;
  /** Override for tests; defaults to the global timers. */
  setTimer?: (fn: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
}

/** Show `message` in the status span; a failure turns it into a visible caption. */
export function setCopyStatus(status: CopyElLike | null | undefined, message: string, failed: boolean): void {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('sr-only', !failed);
  if (failed) status.setAttribute('data-failed', '');
  else status.removeAttribute('data-failed');
}

/** Flip one button between its resting and "Copied" look. */
export function setCopied(btn: CopyElLike, copied: boolean): void {
  if (copied) btn.setAttribute('data-copied', '');
  else btn.removeAttribute('data-copied');
  btn.querySelector(COPY_ICON_SELECTOR)?.classList.toggle('hidden', copied);
  btn.querySelector(CHECK_ICON_SELECTOR)?.classList.toggle('hidden', !copied);
  const label = btn.querySelector(COPY_LABEL_SELECTOR);
  if (label) {
    label.textContent = copied ? COPIED_TEXT : (btn.dataset.copyLabel ?? 'Copy');
  } else if (copied) {
    if (btn.dataset.prevAriaLabel === undefined) btn.dataset.prevAriaLabel = btn.getAttribute('aria-label') ?? '';
    btn.setAttribute('aria-label', COPIED_TEXT);
  } else if (btn.dataset.prevAriaLabel !== undefined) {
    btn.setAttribute('aria-label', btn.dataset.prevAriaLabel);
    delete btn.dataset.prevAriaLabel;
  }
}

/** Copy one button's payload and run the feedback cycle. Resolves to the outcome. */
export async function copyFromButton(btn: CopyElLike, opts: CopyOptions = {}): Promise<boolean> {
  const copy = opts.copy ?? copyTextToClipboard;
  const setTimer = opts.setTimer ?? ((fn, ms) => Number(globalThis.setTimeout(fn, ms)));
  const clearTimer = opts.clearTimer ?? ((id) => globalThis.clearTimeout(id));
  const ok = await copy(btn.dataset.copy ?? '');
  if (!ok) {
    setCopyStatus(opts.status, STATUS_FAILED, true);
    return false;
  }
  setCopied(btn, true);
  setCopyStatus(opts.status, STATUS_COPIED, false);
  if (btn.dataset.copyTimer) clearTimer(Number(btn.dataset.copyTimer));
  btn.dataset.copyTimer = String(
    setTimer(() => {
      setCopied(btn, false);
      delete btn.dataset.copyTimer;
      if (opts.status && opts.status.textContent === STATUS_COPIED) setCopyStatus(opts.status, '', false);
    }, opts.resetMs ?? RESET_MS),
  );
  return true;
}

/** Find the copy button a click landed on, if it is inside `root`. */
export function copyButtonFor(root: CopyRootLike, target: unknown): CopyElLike | null {
  const t = target as { closest?: (sel: string) => CopyElLike | null } | null;
  const btn = t && typeof t.closest === 'function' ? t.closest(COPY_BUTTON_SELECTOR) : null;
  return btn && root.contains(btn) ? btn : null;
}

/** One delegated listener for every copy button under `root`. Call once per root. */
export function wireCopyButtons(root: CopyRootLike, opts: CopyOptions = {}): void {
  root.addEventListener('click', (e) => {
    const btn = copyButtonFor(root, e.target);
    if (btn) void copyFromButton(btn, opts);
  });
}

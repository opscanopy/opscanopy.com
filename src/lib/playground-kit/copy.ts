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
 *   - on success it swaps the copy icon for the check icon (when the button
 *     has one), sets the visible
 *     label to "Copied" (or, for an icon-only button, the aria-label), sets
 *     `data-copied`, and resets after `resetMs`;
 *   - the outcome is announced in the one sr-only `role="status"` span; on
 *     failure that span becomes a visible caption (`data-failed`), because a
 *     silent failed copy is worse than none.
 *
 * Icons and labels are found through the kit hooks (`[data-copy-icon]`,
 * `[data-check-icon]`, `[data-copy-text]`, CopyButton.astro) OR the legacy
 * classes the render.ts builders still emit — the hyphenated
 * `<p>-copy-icon` / `<p>-check-icon` / `<p>-copy-label` family and the BEM
 * `<p>-copy__icon` / `<p>-copyall__icon` / `<p>-copy__lbl` / `<p>-copyall__lbl`
 * family (env-checker, hash-generator). The legacy half exists because the
 * waves must leave the seeded result HTML byte-identical (ssr-diff), so
 * render.ts keeps its classes until a later pass rewrites it; the playground
 * scripts never name those classes themselves (the gate's `kit-selectors`
 * rule).
 *
 * The payload is `data-copy` by default. A tool whose rows carry the value
 * under another attribute passes `payloadAttr` ('data-value'), and one whose
 * payload is not an attribute at all (a multi-line block the row only points
 * at) passes `payload: (btn) => string` — both so the island binds nothing
 * per button.
 *
 * Everything is DOM-shaped (closest / querySelector / dataset / classList /
 * attributes) so src/lib/playground-kit/copy.test.ts drives it with fakes in
 * vitest's node environment, as mark-changed.test.ts does.
 */
import { copyTextToClipboard } from '../clipboard';

export const COPY_BUTTON_SELECTOR = '[data-copy], [data-copy-all], [data-copy-link]';
export const COPY_ICON_SELECTOR = "[data-copy-icon], [class*='-copy-icon'], [class*='-copy__icon'], [class*='copyall__icon']";
export const CHECK_ICON_SELECTOR = "[data-check-icon], [class*='-check-icon'], [class*='-check__icon']";
export const COPY_LABEL_SELECTOR = "[data-copy-text], [class*='-copy-label'], [class*='-copy__lbl'], [class*='copyall__lbl']";
export const DEFAULT_PAYLOAD_ATTR = 'data-copy';

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
  /** Compute the payload from the button instead of reading an attribute. Wins over `payloadAttr`. */
  payload?: (btn: CopyElLike) => string;
  /** Attribute holding the payload (default `data-copy`). */
  payloadAttr?: string;
}

/** `data-copy-value` → `copyValue` (the dataset key for a data-* attribute), or null for a non-data attribute. */
export function datasetKeyFor(attr: string): string | null {
  if (!attr.startsWith('data-')) return null;
  return attr.slice(5).replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** The text a button copies: `opts.payload(btn)`, else its `payloadAttr` (default `data-copy`), else ''. */
export function payloadOf(btn: CopyElLike, opts: CopyOptions = {}): string {
  if (opts.payload) return opts.payload(btn);
  const attr = opts.payloadAttr ?? DEFAULT_PAYLOAD_ATTR;
  const key = datasetKeyFor(attr);
  const viaDataset = key === null ? undefined : btn.dataset[key];
  return viaDataset ?? btn.getAttribute(attr) ?? '';
}

/** Show `message` in the status span; a failure turns it into a visible caption. */
export function setCopyStatus(status: CopyElLike | null | undefined, message: string, failed: boolean): void {
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('sr-only', !failed);
  if (failed) status.setAttribute('data-failed', '');
  else status.removeAttribute('data-failed');
}

/**
 * Flip one button between its resting and "Copied" look.
 *
 * The copy icon is hidden only when the button also has a check icon to show
 * in its place: the BEM render.ts buttons (env-checker, hash-generator) carry
 * a copy icon and no check icon, and blanking it would shrink the pill for
 * RESET_MS with nothing to replace it.
 *
 * The label's resting text is `data-copy-label` when the button carries one
 * (every kit and hyphenated-family button), else the text it showed before
 * the click, saved in `data-prev-label` for the cycle — so a render.ts
 * "Copy all" with no `data-copy-label` comes back as "Copy all", not "Copy".
 */
export function setCopied(btn: CopyElLike, copied: boolean): void {
  if (copied) btn.setAttribute('data-copied', '');
  else btn.removeAttribute('data-copied');
  const check = btn.querySelector(CHECK_ICON_SELECTOR);
  if (check) {
    btn.querySelector(COPY_ICON_SELECTOR)?.classList.toggle('hidden', copied);
    check.classList.toggle('hidden', !copied);
  }
  const label = btn.querySelector(COPY_LABEL_SELECTOR);
  if (label) {
    if (copied) {
      if (btn.dataset.prevLabel === undefined) btn.dataset.prevLabel = label.textContent ?? '';
      label.textContent = COPIED_TEXT;
    } else {
      label.textContent = btn.dataset.copyLabel ?? btn.dataset.prevLabel ?? 'Copy';
      delete btn.dataset.prevLabel;
    }
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
  const ok = await copy(payloadOf(btn, opts));
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

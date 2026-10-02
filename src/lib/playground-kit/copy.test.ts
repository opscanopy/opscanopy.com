/**
 * copy.ts against DOM-shaped fakes (node environment, like mark-changed.test.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  setCopied,
  setCopyStatus,
  copyFromButton,
  copyButtonFor,
  wireCopyButtons,
  COPY_BUTTON_SELECTOR,
  STATUS_COPIED,
  STATUS_FAILED,
  type CopyElLike,
} from './copy';

class FakeClassList {
  set = new Set<string>();
  constructor(init: string[] = []) {
    init.forEach((c) => this.set.add(c));
  }
  toggle(token: string, force?: boolean): boolean {
    const on = force ?? !this.set.has(token);
    if (on) this.set.add(token);
    else this.set.delete(token);
    return on;
  }
  has(t: string) {
    return this.set.has(t);
  }
}

type Fake = CopyElLike & { attrs: Map<string, string>; classList: FakeClassList; children: Record<string, Fake | null> };

function fake(opts: { dataset?: Record<string, string>; attrs?: Record<string, string>; classes?: string[]; text?: string; children?: Record<string, Fake | null> } = {}): Fake {
  const attrs = new Map(Object.entries(opts.attrs ?? {}));
  const children = opts.children ?? {};
  return {
    dataset: { ...(opts.dataset ?? {}) },
    textContent: opts.text ?? null,
    classList: new FakeClassList(opts.classes),
    attrs,
    children,
    getAttribute: (n) => attrs.get(n) ?? null,
    setAttribute: (n, v) => void attrs.set(n, v),
    removeAttribute: (n) => void attrs.delete(n),
    // Selector → child by the hook family it names (copy icon / check icon / label).
    querySelector: (sel) => {
      if (sel.includes('data-copy-icon')) return children.icon ?? null;
      if (sel.includes('data-check-icon')) return children.check ?? null;
      if (sel.includes('data-copy-text')) return children.label ?? null;
      return null;
    },
  };
}

function labeledButton(payload = 'https://x/#ip=1') {
  return fake({
    dataset: { copy: payload, copyLabel: 'Copy link' },
    children: { icon: fake(), check: fake({ classes: ['hidden'] }), label: fake({ text: 'Copy link' }) },
  });
}

describe('setCopied', () => {
  it('labeled button: swaps icons, label text and data-copied, and back', () => {
    const b = labeledButton();
    setCopied(b, true);
    expect(b.attrs.has('data-copied')).toBe(true);
    expect(b.children.icon!.classList.has('hidden')).toBe(true);
    expect(b.children.check!.classList.has('hidden')).toBe(false);
    expect(b.children.label!.textContent).toBe('Copied');
    setCopied(b, false);
    expect(b.attrs.has('data-copied')).toBe(false);
    expect(b.children.icon!.classList.has('hidden')).toBe(false);
    expect(b.children.check!.classList.has('hidden')).toBe(true);
    expect(b.children.label!.textContent).toBe('Copy link');
  });

  it('icon-only button: swaps the aria-label and restores it exactly', () => {
    const b = fake({ dataset: { copy: '10.0.0.0' }, attrs: { 'aria-label': 'Copy Network' }, children: { icon: fake(), check: fake({ classes: ['hidden'] }) } });
    setCopied(b, true);
    expect(b.getAttribute('aria-label')).toBe('Copied');
    // A second "copied" (double click) must not overwrite the saved label with "Copied".
    setCopied(b, true);
    setCopied(b, false);
    expect(b.getAttribute('aria-label')).toBe('Copy Network');
    expect(b.dataset.prevAriaLabel).toBeUndefined();
  });
});

describe('setCopyStatus', () => {
  it('success stays sr-only; failure becomes a visible caption', () => {
    const s = fake({ classes: ['sr-only'] });
    setCopyStatus(s, STATUS_COPIED, false);
    expect(s.textContent).toBe(STATUS_COPIED);
    expect(s.classList.has('sr-only')).toBe(true);
    expect(s.attrs.has('data-failed')).toBe(false);
    setCopyStatus(s, STATUS_FAILED, true);
    expect(s.classList.has('sr-only')).toBe(false);
    expect(s.attrs.has('data-failed')).toBe(true);
    setCopyStatus(null, 'x', true); // no status span: a no-op, never a throw
  });
});

describe('copyFromButton', () => {
  it('copies dataset.copy, marks copied, announces, then resets on the timer', async () => {
    const b = labeledButton('payload-1');
    const status = fake({ classes: ['sr-only'] });
    const copy = vi.fn(async () => true);
    let fire: (() => void) | null = null;
    const ok = await copyFromButton(b, { status, copy, setTimer: (fn) => ((fire = fn), 7), clearTimer: () => {} });
    expect(ok).toBe(true);
    expect(copy).toHaveBeenCalledWith('payload-1');
    expect(b.attrs.has('data-copied')).toBe(true);
    expect(status.textContent).toBe(STATUS_COPIED);
    expect(b.dataset.copyTimer).toBe('7');
    fire!();
    expect(b.attrs.has('data-copied')).toBe(false);
    expect(b.dataset.copyTimer).toBeUndefined();
    expect(status.textContent).toBe('');
  });

  it('a missing payload copies the empty string rather than "undefined"', async () => {
    const b = fake({ children: {} });
    const copy = vi.fn(async () => true);
    await copyFromButton(b, { copy, setTimer: () => 1, clearTimer: () => {} });
    expect(copy).toHaveBeenCalledWith('');
  });

  it('failure leaves the button alone and shows the failure caption', async () => {
    const b = labeledButton();
    const status = fake({ classes: ['sr-only'] });
    const ok = await copyFromButton(b, { status, copy: async () => false });
    expect(ok).toBe(false);
    expect(b.attrs.has('data-copied')).toBe(false);
    expect(status.textContent).toBe(STATUS_FAILED);
    expect(status.attrs.has('data-failed')).toBe(true);
  });

  it('a second copy before the reset clears the first timer', async () => {
    const b = labeledButton();
    const cleared: number[] = [];
    let n = 0;
    const opts = { copy: async () => true, setTimer: () => ++n, clearTimer: (id: number) => void cleared.push(id) };
    await copyFromButton(b, opts);
    await copyFromButton(b, opts);
    expect(cleared).toEqual([1]);
  });
});

describe('delegation', () => {
  it('the selector covers the three hooks Layout.astro analytics keys on', () => {
    for (const hook of ['[data-copy]', '[data-copy-all]', '[data-copy-link]']) expect(COPY_BUTTON_SELECTOR).toContain(hook);
  });

  it('copyButtonFor finds the closest copy button inside root only', () => {
    const btn = labeledButton();
    const inside = { closest: (sel: string) => (sel === COPY_BUTTON_SELECTOR ? btn : null) };
    const root = { addEventListener() {}, contains: (n: unknown) => n === btn };
    expect(copyButtonFor(root, inside)).toBe(btn);
    expect(copyButtonFor({ ...root, contains: () => false }, inside)).toBeNull();
    expect(copyButtonFor(root, { closest: () => null })).toBeNull();
    expect(copyButtonFor(root, null)).toBeNull();
    expect(copyButtonFor(root, {})).toBeNull(); // a text node has no closest()
  });

  it('wireCopyButtons registers one click listener that copies the clicked button', async () => {
    const btn = labeledButton('p');
    let handler: ((e: { target: unknown }) => void) | null = null;
    const root = { addEventListener: (_t: 'click', fn: (e: { target: unknown }) => void) => void (handler = fn), contains: () => true };
    const copy = vi.fn(async () => true);
    wireCopyButtons(root, { copy, setTimer: () => 1, clearTimer: () => {} });
    handler!({ target: { closest: () => btn } });
    await Promise.resolve();
    expect(copy).toHaveBeenCalledWith('p');
  });
});

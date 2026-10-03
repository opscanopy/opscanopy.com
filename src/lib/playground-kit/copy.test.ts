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
  payloadOf,
  datasetKeyFor,
  COPY_BUTTON_SELECTOR,
  COPY_ICON_SELECTOR,
  CHECK_ICON_SELECTOR,
  COPY_LABEL_SELECTOR,
  STATUS_COPIED,
  STATUS_FAILED,
  type CopyElLike,
} from './copy';
import { missingGroupHtml } from '../env-checker/render';
import { rowHtml as hashRowHtml } from '../hash-generator/render';
import { copyBtnHtml as subnetCopyBtnHtml } from '../subnet-calculator/render';

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

// ---------------------------------------------------------------------------
// Legacy class families. A fake whose querySelector really evaluates the
// `[data-x]` / `[class*='x']` alternatives of the kit selectors against its
// children's class strings, so the test proves the selector text, not a
// substring the fake was told to recognise.
// ---------------------------------------------------------------------------

function matches(sel: string, child: { cls: string; data: string[] }): boolean {
  return sel.split(',').some((alt) => {
    const a = alt.trim();
    const sub = /^\[class\*='([^']+)'\]$/.exec(a);
    if (sub) return child.cls.includes(sub[1]);
    const d = /^\[([a-z-]+)\]$/.exec(a);
    if (d) return child.data.includes(d[1]);
    throw new Error(`unexpected selector form ${a}`);
  });
}

function classedButton(children: Array<{ cls: string; data?: string[]; text?: string }>, dataset: Record<string, string> = {}) {
  const kids = children.map((c) => ({ ...c, data: c.data ?? [], el: fake({ text: c.text, classes: c.cls.split(' ') }) }));
  const btn = fake({ dataset });
  btn.querySelector = (sel) => kids.find((k) => matches(sel, k))?.el ?? null;
  return { btn, kids: kids.map((k) => k.el) };
}

describe('legacy render.ts class families', () => {
  it('hyphenated: <p>-copy-icon / <p>-check-icon / <p>-copy-label', () => {
    const { btn, kids } = classedButton([{ cls: 'snc-copy-icon' }, { cls: 'snc-check-icon hidden' }, { cls: 'snc-copy-label', text: 'Copy' }], { copyLabel: 'Copy' });
    setCopied(btn, true);
    expect(kids[0].classList.has('hidden')).toBe(true);
    expect(kids[1].classList.has('hidden')).toBe(false);
    expect(kids[2].textContent).toBe('Copied');
  });

  it('a copy icon with no check icon stays visible (nothing to swap it for)', () => {
    const { btn, kids } = classedButton([{ cls: 'x-copy__icon' }, { cls: 'x-copy__lbl', text: 'Copy' }]);
    setCopied(btn, true);
    expect(kids[0].classList.has('hidden')).toBe(false);
    setCopied(btn, false);
    expect(kids[0].classList.has('hidden')).toBe(false);
  });

  it('a label with no data-copy-label returns to the text it had, and data-prev-label is cleared', () => {
    const { btn, kids } = classedButton([{ cls: 'x-copy-label', text: 'Copy 3 blocks' }]);
    setCopied(btn, true);
    expect(kids[0].textContent).toBe('Copied');
    expect(btn.dataset.prevLabel).toBe('Copy 3 blocks');
    setCopied(btn, true); // a double click must not save "Copied" as the resting text
    setCopied(btn, false);
    expect(kids[0].textContent).toBe('Copy 3 blocks');
    expect(btn.dataset.prevLabel).toBeUndefined();
  });

  it('data-copy-label still wins over the saved text (the behaviour every kit button relies on)', () => {
    const { btn, kids } = classedButton([{ cls: 'copy-btn__label', data: ['data-copy-text'], text: 'stale' }], { copyLabel: 'Copy link' });
    setCopied(btn, true);
    setCopied(btn, false);
    expect(kids[0].textContent).toBe('Copy link');
  });

  it('the kit hooks still win and unrelated classes never match', () => {
    const { btn, kids } = classedButton([
      { cls: 'copy-btn__icon', data: ['data-copy-icon'] },
      { cls: 'copy-btn__icon hidden', data: ['data-check-icon'] },
      { cls: 'copy-btn__label', data: ['data-copy-text'], text: 'Copy link' },
      { cls: 'snc-copyright' },
    ]);
    setCopied(btn, true);
    expect(kids[0].classList.has('hidden')).toBe(true);
    expect(kids[1].classList.has('hidden')).toBe(false);
    expect(kids[2].textContent).toBe('Copied');
    expect(kids[3].classList.has('hidden')).toBe(false);
    for (const sel of [COPY_ICON_SELECTOR, CHECK_ICON_SELECTOR, COPY_LABEL_SELECTOR]) expect(matches(sel, { cls: 'snc-copyright', data: [] })).toBe(false);
  });

  it('a copy icon selector never matches a check icon and vice versa', () => {
    const icon = { cls: 'ec-copy__icon', data: [] };
    const check = { cls: 'ec-check-icon', data: [] };
    expect(matches(COPY_ICON_SELECTOR, icon)).toBe(true);
    expect(matches(CHECK_ICON_SELECTOR, icon)).toBe(false);
    expect(matches(CHECK_ICON_SELECTOR, check)).toBe(true);
    expect(matches(COPY_ICON_SELECTOR, check)).toBe(false);
    expect(matches(COPY_LABEL_SELECTOR, { cls: 'ec-copy__lbl', data: [] })).toBe(true);
    expect(matches(COPY_LABEL_SELECTOR, { cls: 'ec-copyall__lbl', data: [] })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Payload sources
// ---------------------------------------------------------------------------

describe('payloadOf', () => {
  it('maps a data-* attribute to its dataset key', () => {
    expect(datasetKeyFor('data-copy')).toBe('copy');
    expect(datasetKeyFor('data-copy-value')).toBe('copyValue');
    expect(datasetKeyFor('data-k')).toBe('k');
    expect(datasetKeyFor('title')).toBeNull();
  });

  it('defaults to data-copy, as before', () => {
    expect(payloadOf(fake({ dataset: { copy: 'a' } }))).toBe('a');
    expect(payloadOf(fake())).toBe('');
  });

  it('payloadAttr reads another data-* attribute through dataset, or any attribute through getAttribute', () => {
    const b = fake({ dataset: { copy: 'wrong', value: 'right' }, attrs: { title: 'from-title' } });
    expect(payloadOf(b, { payloadAttr: 'data-value' })).toBe('right');
    expect(payloadOf(b, { payloadAttr: 'title' })).toBe('from-title');
    expect(payloadOf(b, { payloadAttr: 'data-missing' })).toBe('');
  });

  it('payload() wins over every attribute and receives the button', () => {
    const b = fake({ dataset: { copy: 'attr' } });
    const payload = vi.fn((btn: CopyElLike) => `fn:${btn.dataset.copy}`);
    expect(payloadOf(b, { payload, payloadAttr: 'data-value' })).toBe('fn:attr');
    expect(payload).toHaveBeenCalledWith(b);
  });

  it('copyFromButton and wireCopyButtons honour both options', async () => {
    const b = labeledButton('attr-payload');
    b.dataset.value = 'row value';
    const copy = vi.fn(async () => true);
    await copyFromButton(b, { copy, payloadAttr: 'data-value', setTimer: () => 1, clearTimer: () => {} });
    expect(copy).toHaveBeenLastCalledWith('row value');
    let handler: ((e: { target: unknown }) => void) | null = null;
    const root = { addEventListener: (_t: 'click', fn: (e: { target: unknown }) => void) => void (handler = fn), contains: () => true };
    wireCopyButtons(root, { copy, payload: () => 'line 1\nline 2 "quoted"', setTimer: () => 1, clearTimer: () => {} });
    handler!({ target: { closest: () => b } });
    await Promise.resolve();
    expect(copy).toHaveBeenLastCalledWith('line 1\nline 2 "quoted"');
  });
});

// ---------------------------------------------------------------------------
// The literal markup the render.ts builders emit today. These fixtures are
// produced by the real builders (not hand-written fakes), so a button that
// carries no data-copy-label or no check icon is tested exactly as it ships.
// ---------------------------------------------------------------------------

interface ParsedEl {
  cls: string;
  data: string[];
  attrs: Record<string, string>;
  text: string;
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g)) out[m[1]] = m[2] ?? '';
  return out;
}

/** The `n`th <button> in `html`, as a fake whose querySelector evaluates the kit selectors against its real children. */
function buttonFromHtml(html: string, n = 0) {
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  const m = buttons[n];
  if (!m) throw new Error(`fixture has no button #${n}`);
  const attrs = parseAttrs(m[1]);
  const dataset: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) if (k.startsWith('data-')) dataset[datasetKeyFor(k)!] = v;
  const kids: ParsedEl[] = [...m[2].matchAll(/<(svg|span)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map((c) => {
    const a = parseAttrs(c[2]);
    return { cls: a.class ?? '', data: Object.keys(a).filter((k) => k.startsWith('data-')), attrs: a, text: c[3].replace(/<[^>]*>/g, '') };
  });
  if (kids.length === 0) throw new Error('fixture button has no children');
  const els = kids.map((k) => fake({ text: k.text, classes: k.cls.split(/\s+/).filter(Boolean) }));
  const btn = fake({ dataset, attrs });
  btn.querySelector = (sel) => {
    const i = kids.findIndex((k) => matches(sel, k));
    return i === -1 ? null : els[i];
  };
  return { btn, attrs, kids, els };
}

/** Run one full copy cycle with a manual timer; returns the mid-cycle and settled snapshots. */
async function cycle(btn: Fake, els: Fake[]) {
  let fire: (() => void) | null = null;
  const ok = await copyFromButton(btn, { copy: async () => true, setTimer: (fn) => ((fire = fn), 1), clearTimer: () => {} });
  const snap = () => ({
    copied: btn.attrs.has('data-copied'),
    hidden: els.map((e) => e.classList.has('hidden')),
    text: els.map((e) => e.textContent),
    aria: btn.getAttribute('aria-label'),
    prevLabel: btn.dataset.prevLabel,
  });
  const mid = snap();
  fire!();
  return { ok, mid, after: snap() };
}

describe('real render.ts markup', () => {
  it('env-checker Copy all (no data-copy-label, no check icon): back to "Copy all" on every cycle, icon never blanked', async () => {
    const { btn, attrs, kids, els } = buttonFromHtml(missingGroupHtml(['API_KEY', 'DB_URL']), 0);
    // Guard the fixture: this is the Copy all button and it really lacks both.
    expect(attrs['data-copy-all']).toBe('missing');
    expect(attrs['data-copy-label']).toBeUndefined();
    expect(kids.map((k) => k.cls)).toEqual(['ec-copyall__icon', 'ec-copyall__lbl']);
    for (let i = 0; i < 2; i++) {
      const { ok, mid, after } = await cycle(btn, els);
      expect(ok).toBe(true);
      expect(mid).toMatchObject({ copied: true, hidden: [false, false], text: [els[0].textContent, 'Copied'], prevLabel: 'Copy all' });
      expect(after).toEqual({ copied: false, hidden: [false, false], text: [els[0].textContent, 'Copy all'], aria: 'Copy all missing keys as .env lines', prevLabel: undefined });
    }
  });

  it('env-checker row: "Copy" → "Copied" → "Copy", aria-label untouched, icon never blanked', async () => {
    const { btn, attrs, kids, els } = buttonFromHtml(missingGroupHtml(['API_KEY']), 1);
    expect(attrs['data-copy']).toBe('API_KEY=');
    expect(kids.map((k) => k.cls)).toEqual(['ec-copy__icon', 'ec-copy__lbl']);
    const { mid, after } = await cycle(btn, els);
    expect(mid.text[1]).toBe('Copied');
    expect(mid.hidden).toEqual([false, false]);
    expect(after.text[1]).toBe('Copy');
    expect(after.aria).toBe('Copy API_KEY= line');
    expect(after.prevLabel).toBeUndefined();
  });

  it('hash-generator row: same, and the payload is the digest', async () => {
    const { btn, kids, els } = buttonFromHtml(hashRowHtml({ label: 'MD5', value: 'd41d8cd98f00b204e9800998ecf8427e', mono: true }, false));
    expect(kids.map((k) => k.cls)).toEqual(['hash-copy__icon', 'hash-copy__lbl']);
    const copy = vi.fn(async () => true);
    await copyFromButton(btn, { copy, setTimer: () => 1, clearTimer: () => {} });
    expect(copy).toHaveBeenCalledWith('d41d8cd98f00b204e9800998ecf8427e');
    expect(els[0].classList.has('hidden')).toBe(false);
    expect(els[1].textContent).toBe('Copied');
    setCopied(btn, false);
    expect(els[1].textContent).toBe('Copy');
  });

  it('subnet-calculator icon-only row (hyphenated family, has a check icon): icons swap and the aria-label round-trips, as on main', async () => {
    const { btn, kids, els } = buttonFromHtml(subnetCopyBtnHtml('Network', '10.0.0.0'));
    expect(kids.map((k) => k.cls)).toEqual(['snc-copy-icon', 'snc-check-icon hidden']);
    const { mid, after } = await cycle(btn, els);
    expect(mid).toMatchObject({ copied: true, hidden: [true, false], aria: 'Copied' });
    expect(after).toMatchObject({ copied: false, hidden: [false, true], aria: 'Copy Network' });
  });
});

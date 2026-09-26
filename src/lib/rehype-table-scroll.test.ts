/**
 * rehype-table-scroll — every markdown-body <table> sits in a keyboard-
 * focusable horizontal scroller, so a wide table scrolls inside the column
 * instead of widening the whole page on a phone (guides reached 644px at 390).
 */
import { describe, expect, it } from 'vitest';
import rehypeTableScroll from './rehype-table-scroll.mjs';

type Node = { type: string; tagName?: string; properties?: Record<string, unknown>; children?: Node[]; value?: string };

const table = (): Node => ({ type: 'element', tagName: 'table', properties: {}, children: [] });
const el = (tagName: string, children: Node[], properties: Record<string, unknown> = {}): Node => ({
  type: 'element',
  tagName,
  properties,
  children,
});

function run(root: Node): Node {
  rehypeTableScroll()(root);
  return root;
}

describe('rehypeTableScroll', () => {
  it('wraps a top-level table in a focusable, labelled scroll region', () => {
    const t = table();
    const root = run({ type: 'root', children: [t] });
    const wrap = root.children![0];
    expect(wrap.tagName).toBe('div');
    expect(wrap.properties).toEqual({ className: ['table-scroll'], tabIndex: 0, role: 'region', ariaLabel: 'Table' });
    expect(wrap.children).toEqual([t]);
  });

  it('labels the region with the table caption when there is one', () => {
    const t = el('table', [el('caption', [{ type: 'text', value: 'Symptoms and fixes' }])]);
    const root = run({ type: 'root', children: [t] });
    expect(root.children![0].properties!.ariaLabel).toBe('Symptoms and fixes');
  });

  it('wraps nested tables in place and keeps sibling order', () => {
    const before = el('p', []);
    const after = el('p', []);
    const t = table();
    const section = el('section', [before, t, after]);
    run({ type: 'root', children: [section] });
    expect(section.children!.map((n) => n.tagName)).toEqual(['p', 'div', 'p']);
    expect(section.children![1].children).toEqual([t]);
  });

  it('does not double-wrap a table already inside .table-scroll', () => {
    const t = table();
    const wrap = el('div', [t], { className: ['table-scroll'] });
    const root = run({ type: 'root', children: [wrap] });
    expect(root.children).toEqual([wrap]);
    expect(wrap.children).toEqual([t]);
  });

  it('leaves a tree without tables untouched', () => {
    const p = el('p', [{ type: 'text', value: 'x' }]);
    const root = run({ type: 'root', children: [p] });
    expect(root.children).toEqual([p]);
  });
});

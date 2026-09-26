/**
 * remark-callouts — a blockquote whose first paragraph opens with a bold,
 * recognised label is tagged `data-callout="<type>"` (styled in global.css for
 * guides, blog posts and Mission 90 days alike). Unknown labels stay plain.
 */
import { describe, expect, it } from 'vitest';
import remarkCallouts from './remark-callouts.mjs';

type Node = {
  type: string;
  value?: string;
  children?: Node[];
  data?: { hProperties?: Record<string, unknown> };
};

const text = (value: string): Node => ({ type: 'text', value });
const strong = (label: string): Node => ({ type: 'strong', children: [text(label)] });
const quote = (lead: Node, rest = ' body text.'): Node => ({
  type: 'blockquote',
  children: [{ type: 'paragraph', children: [lead, text(rest)] }],
});

function calloutOf(bq: Node): unknown {
  remarkCallouts()({ type: 'root', children: [bq] });
  return bq.data?.hProperties?.['data-callout'];
}

describe('remarkCallouts', () => {
  it.each([
    ['Note:', 'note'],
    ['Tip:', 'tip'],
    ['Warning:', 'warning'],
    ['Real world:', 'aside'],
    ['Real error:', 'real-error'],
  ])('tags %s as %s', (label, type) => {
    expect(calloutOf(quote(strong(label)))).toBe(type);
  });

  // Localized blog posts (de/es/fr/pt-br) write the label in their own language;
  // French typography puts a (narrow) no-break space before the colon.
  it.each([
    ['Achtung:', 'warning'], ['Tipp:', 'tip'], ['In der Praxis:', 'aside'], ['Wichtig:', 'note'], ['Hinweis:', 'note'],
    ['Cuidado:', 'warning'], ['Consejo:', 'tip'], ['En la práctica:', 'aside'], ['Importante:', 'note'],
    ['Attention :', 'warning'], ['Attention :', 'warning'], ['Astuce :', 'tip'], ['En pratique :', 'aside'], ['À retenir :', 'note'],
    ['Atenção:', 'warning'], ['Dica:', 'tip'], ['Na prática:', 'aside'], ['Resumo:', 'note'],
  ])('tags localized %s as %s', (label, type) => {
    expect(calloutOf(quote(strong(label)))).toBe(type);
  });

  it.each(['TL;DR:', 'tl;dr', 'TLDR:', 'tldr', 'Summary:', 'summary'])('tags %s as a note', (label) => {
    expect(calloutOf(quote(strong(label)))).toBe('note');
  });

  it('strips a trailing colon and surrounding space, case-insensitively', () => {
    expect(calloutOf(quote(strong('  KEY TAKEAWAY :  ')))).toBe('note');
  });

  it('leaves an unknown label untagged', () => {
    expect(calloutOf(quote(strong('Update:')))).toBeUndefined();
  });

  it('leaves a quote that does not lead with bold untagged', () => {
    expect(calloutOf(quote(text('Tip: '), 'not bold'))).toBeUndefined();
  });

  it('tags nested blockquotes and keeps existing hProperties', () => {
    const inner = quote(strong('Summary:'));
    inner.data = { hProperties: { id: 'x' } };
    const outer: Node = { type: 'blockquote', children: [{ type: 'paragraph', children: [text('plain')] }, inner] };
    remarkCallouts()({ type: 'root', children: [outer] });
    expect(outer.data).toBeUndefined();
    expect(inner.data?.hProperties).toEqual({ id: 'x', 'data-callout': 'note' });
  });
});

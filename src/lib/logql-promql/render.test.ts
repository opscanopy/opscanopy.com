/**
 * LogQL ↔ PromQL Helper — tests for the shared HTML builders.
 *
 * These builders are imported by BOTH the Astro frontmatter (which bakes the
 * first example's converted query, its notes and the direction toggle into the
 * static HTML) and the island's <script>. The tests below pin the contract the
 * SSR seed depends on: the notes markup, the summary wording, the empty/error
 * states, HTML escaping, and — the point of the whole pass — that the module is
 * PURE, so a build can run it without a DOM, a clock or a random source.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convert } from './engine';
import { examples } from './examples';
import {
  EMPTY_HTML,
  LOADING_HTML,
  errorHtml,
  filesFor,
  notesHtml,
  notesSummaryText,
  outputText,
} from './render';

/** The module's CODE, with comments stripped — the prose above describes the
 *  very APIs it must not call, so a naive scan of the whole file is useless. */
const RENDER_CODE = readFileSync(new URL('./render.ts', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('logql-promql/render — purity', () => {
  it('reaches for no browser, clock or random source', () => {
    // A build-time module: anything here must run identically in node and in
    // the browser, at any moment, on any machine.
    for (const forbidden of [
      'window',
      'document',
      'localStorage',
      'Date',
      'Math.random',
      'crypto',
      'localePath',
    ]) {
      expect(RENDER_CODE).not.toContain(forbidden);
    }
  });
});

describe('logql-promql/render — the seeded first example', () => {
  const seed = examples[0];
  const result = convert(seed.direction, seed.query);

  it('converts the first example without an error', () => {
    expect(seed.query).toBe('rate({app="api", env="prod"} |= "error" [5m])');
    expect(result.error).toBeUndefined();
    expect(outputText(result)).toBe('rate({app="api", env="prod"}[5m])');
  });

  it('names the editor chrome files for the example direction', () => {
    expect(filesFor(seed.direction)).toEqual({ input: 'query.logql', output: 'query.promql' });
    expect(filesFor('promql-to-logql')).toEqual({ input: 'query.promql', output: 'query.logql' });
  });

  it('renders every note of the seeded conversion', () => {
    const html = notesHtml(result.notes);
    expect(result.notes.length).toBe(2);
    expect(html).toContain('Conversion notes');
    expect((html.match(/lp-note__item/g) ?? []).length).toBe(2);
    expect(html).toContain('PromQL has no log-line filters');
  });

  it('summarises the note count', () => {
    expect(notesSummaryText(result.notes)).toBe('2 notes');
    expect(notesSummaryText(['one'])).toBe('1 note');
    expect(notesSummaryText([])).toBe('Converted');
  });

  it('falls back to the clean-mapping row when nothing was lost', () => {
    const html = notesHtml([]);
    expect(html).toContain('lp-ok');
    expect(html).toContain('Converted with a clean mapping');
    expect(html).not.toContain('lp-note__item');
  });
});

describe('logql-promql/render — escaping', () => {
  it('escapes angle brackets and ampersands in notes', () => {
    const html = notesHtml(['drop <script>alert(1)</script> & keep {a="b"}']);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('escapes the error detail', () => {
    const html = errorHtml('bad <input> & worse');
    expect(html).toContain('role="alert"');
    expect(html).toContain('&lt;input&gt;');
    expect(html).toContain('&amp;');
  });
});

describe('logql-promql/render — states', () => {
  it('keeps the empty and loading placeholders in sync with the markup', () => {
    expect(EMPTY_HTML).toContain('lp-empty');
    expect(EMPTY_HTML).toContain('Pick a direction');
    expect(LOADING_HTML).toContain('lp-loading');
  });

  it('returns an empty output string for an errored result', () => {
    expect(outputText({ output: '', notes: [], error: 'nope' })).toBe('');
    expect(outputText({ output: 'up', notes: [] })).toBe('up');
  });
});

import { describe, it, expect } from 'vitest';
import * as o200k from 'gpt-tokenizer/encoding/o200k_base';
import * as cl100k from 'gpt-tokenizer/encoding/cl100k_base';
import { countTokens, costUsd, ENCODINGS } from './engine';
import { examples } from './examples';
import type { Encoder } from './types';

/** One token per code point; the decoder yields the char for each id. */
const stub: Encoder = {
  encode: (t) => [...t].map((c) => c.codePointAt(0)!),
  *decodeGenerator(ids) {
    for (const id of ids) yield String.fromCodePoint(id);
  },
};

describe('countTokens (stub encoder)', () => {
  it('derives spans, chars, words, bytes and ratio', () => {
    const r = countTokens('hi é 👋', 'o200k_base', stub);
    expect(r.tokens).toHaveLength(6);
    expect(r.spans.map((s) => s.text).join('')).toBe('hi é 👋');
    expect(r.spans.every((s) => s.ids.length === 1)).toBe(true);
    expect(r.chars).toBe(6);
    expect(r.words).toBe(3);
    expect(r.bytes).toBe(2 + 1 + 2 + 1 + 4);
    expect(r.charsPerToken).toBe(1);
    expect(r.encoding).toBe('o200k_base');
  });
  it('empty text', () => {
    const r = countTokens('', 'cl100k_base', stub);
    expect(r).toMatchObject({ tokens: [], spans: [], chars: 0, words: 0, bytes: 0, charsPerToken: 0 });
  });
  it('costUsd', () => {
    expect(costUsd(1_000_000, 2.5)).toBe(2.5);
    expect(costUsd(500, 2)).toBeCloseTo(0.001, 10);
    expect(costUsd(0, 10)).toBe(0);
  });
  it('ENCODINGS lists both', () => {
    expect(ENCODINGS.map((e) => e.id)).toEqual(['o200k_base', 'cl100k_base']);
  });
});

describe('countTokens (gpt-tokenizer 4.0.0)', () => {
  const encs = [['o200k_base', o200k], ['cl100k_base', cl100k]] as const;

  it('pins examples[0] for both encodings (rank-drift tripwire)', () => {
    expect(countTokens(examples[0].input, 'o200k_base', o200k).tokens).toHaveLength(48);
    expect(countTokens(examples[0].input, 'cl100k_base', cl100k).tokens).toHaveLength(48);
  });

  for (const [id, enc] of encs) {
    it(`${id}: 'Hello, world!' is 4 tokens`, () => {
      expect(countTokens('Hello, world!', id, enc).tokens).toHaveLength(4);
    });
    it(`${id}: '<|endoftext|>' is text, not a special token`, () => {
      expect(() => countTokens('<|endoftext|>', id, enc)).not.toThrow();
      expect(countTokens('<|endoftext|>', id, enc).tokens.length).toBeGreaterThan(1);
    });
    it(`${id}: emoji + CJK spans rejoin to the input and cover every id`, () => {
      for (const text of ['👋🌍 日本語', ...examples.map((e) => e.input)]) {
        const r = countTokens(text, id, enc);
        const joined = r.spans.map((s) => s.text).join('');
        expect(joined).toBe(text);
        expect(joined).not.toContain('�');
        expect(r.spans.flatMap((s) => s.ids)).toEqual(r.tokens);
      }
    });
  }
});

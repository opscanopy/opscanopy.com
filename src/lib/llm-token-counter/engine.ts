/** LLM Token Counter — pure engine. No DOM, no clock; the encoder is a parameter. */
import type { Encoder, EncodingId, TokenCount, TokenSpan } from './types';

/** The one place model families are named (as of October 2026, per OpenAI's tiktoken mapping). */
export const ENCODINGS: readonly { id: EncodingId; label: string; models: string }[] = [
  { id: 'o200k_base', label: 'o200k_base', models: 'GPT-5, GPT-4.1, GPT-4o, o1 / o3 / o4-mini' },
  { id: 'cl100k_base', label: 'cl100k_base', models: 'GPT-4, GPT-3.5 Turbo, text-embedding-3' },
];

export const MAX_CHARS = 100_000;
/** Above this many tokens the visualiser is replaced by a note; stats still render. */
export const VIS_MAX_TOKENS = 2_000;

const NO_SPECIAL = new Set<string>();

export function countTokens(text: string, encoding: EncodingId, enc: Encoder): TokenCount {
  // Empty disallowed set: '<|endoftext|>' typed as text is encoded as ordinary text, never throws.
  const tokens = enc.encode(text, { disallowedSpecial: NO_SPECIAL });

  // decodeGenerator yields only when a character completes, so the ids pulled between two
  // yields are exactly the tokens behind that piece of text.
  const spans: TokenSpan[] = [];
  let pending: number[] = [];
  function* feed() {
    for (const id of tokens) {
      pending.push(id);
      yield id;
    }
  }
  for (const piece of enc.decodeGenerator(feed())) {
    spans.push({ text: piece, ids: pending });
    pending = [];
  }
  if (pending.length) spans.push({ text: '', ids: pending }); // trailing incomplete bytes

  const chars = [...text].length;
  const words = text.split(/\s+/).filter(Boolean).length;
  const bytes = new TextEncoder().encode(text).length;
  const charsPerToken = tokens.length ? chars / tokens.length : 0;
  return { encoding, tokens, spans, chars, words, bytes, charsPerToken };
}

export const costUsd = (tokens: number, pricePerMillion: number): number => (tokens / 1_000_000) * pricePerMillion;

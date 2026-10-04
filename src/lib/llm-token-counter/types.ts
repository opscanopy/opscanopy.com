/** LLM Token Counter — shared types. The encoder is passed in, so the engine stays pure and the
 * multi-megabyte rank tables load lazily in the island (and statically only in SSR frontmatter). */
export type EncodingId = 'o200k_base' | 'cl100k_base';

/** The subset of gpt-tokenizer's per-encoding module the engine uses. */
export interface Encoder {
  encode(text: string, opts?: { disallowedSpecial?: Set<string> }): number[];
  decodeGenerator(tokens: Iterable<number>): Generator<string, void, void>;
}

/** One visible piece of text and the token ids that produced it (several ids when a character
 * spans tokens, e.g. an emoji split into byte-level tokens). */
export interface TokenSpan {
  text: string;
  ids: number[];
}

export interface TokenCount {
  encoding: EncodingId;
  tokens: number[];
  spans: TokenSpan[];
  /** Unicode code points, so an emoji counts as one character. */
  chars: number;
  words: number;
  /** UTF-8 bytes. */
  bytes: number;
  /** 0 when there are no tokens. */
  charsPerToken: number;
}

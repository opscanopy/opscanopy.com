/**
 * GitHub Actions expression lexer — tokenizes the BODY of a `${{ … }}`.
 *
 * The grammar is small and has NO arithmetic: `*` is only the object-filter
 * ("splat") operator, valid after a `.`. Strings are single-quoted; a literal
 * single quote is written as two single quotes (`''`). The lexer is tolerant —
 * an unrecognised character becomes a single-char `op` token so the parser can
 * still report a useful error rather than throwing.
 */

export type TokenKind =
  | 'ident'
  | 'number'
  | 'string'
  | 'op'
  | 'dot'
  | 'star'
  | 'lbracket'
  | 'rbracket'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'eof';

export interface Token {
  kind: TokenKind;
  /** The raw source slice (for `string`, `value` holds the decoded text). */
  text: string;
  /** Decoded value for `string`/`number` literals. */
  value?: string | number;
  /** 0-based offsets into the lexed body. */
  from: number;
  to: number;
}

const MULTI_OPS = ['==', '!=', '<=', '>=', '&&', '||'];
const SINGLE_OPS = ['<', '>', '!'];

function isIdentStart(c: string): boolean {
  return /[A-Za-z_]/.test(c);
}
function isIdentPart(c: string): boolean {
  return /[A-Za-z0-9_-]/.test(c);
}
function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

/** Tokenize an expression body. Never throws. */
export function lex(body: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = body.length;

  const push = (kind: TokenKind, text: string, from: number, value?: string | number) =>
    tokens.push({ kind, text, from, to: from + text.length, value });

  while (i < n) {
    const c = body[i];

    // Whitespace.
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }

    // Single-quoted string with '' escape.
    if (c === "'") {
      const start = i;
      i++; // opening quote
      let decoded = '';
      while (i < n) {
        if (body[i] === "'") {
          if (body[i + 1] === "'") {
            decoded += "'";
            i += 2;
            continue;
          }
          i++; // closing quote
          break;
        }
        decoded += body[i];
        i++;
      }
      tokens.push({
        kind: 'string',
        text: body.slice(start, i),
        value: decoded,
        from: start,
        to: i,
      });
      continue;
    }

    // Number: decimal, float (.5), hex (0x..), exponent — parse with Number().
    if (isDigit(c) || (c === '.' && isDigit(body[i + 1] ?? ''))) {
      const start = i;
      // Hex.
      if (c === '0' && (body[i + 1] === 'x' || body[i + 1] === 'X')) {
        i += 2;
        while (i < n && /[0-9a-fA-F]/.test(body[i])) i++;
      } else {
        while (i < n && isDigit(body[i])) i++;
        if (body[i] === '.') {
          i++;
          while (i < n && isDigit(body[i])) i++;
        }
        if (body[i] === 'e' || body[i] === 'E') {
          i++;
          if (body[i] === '+' || body[i] === '-') i++;
          while (i < n && isDigit(body[i])) i++;
        }
      }
      const text = body.slice(start, i);
      push('number', text, start, Number(text));
      continue;
    }

    // Identifier / keyword.
    if (isIdentStart(c)) {
      const start = i;
      i++;
      while (i < n && isIdentPart(body[i])) i++;
      push('ident', body.slice(start, i), start);
      continue;
    }

    // Multi-char operators (longest match first).
    const two = body.slice(i, i + 2);
    if (MULTI_OPS.includes(two)) {
      push('op', two, i);
      i += 2;
      continue;
    }

    // Punctuation / single-char operators.
    switch (c) {
      case '.':
        push('dot', c, i);
        i++;
        continue;
      case '*':
        push('star', c, i);
        i++;
        continue;
      case '[':
        push('lbracket', c, i);
        i++;
        continue;
      case ']':
        push('rbracket', c, i);
        i++;
        continue;
      case '(':
        push('lparen', c, i);
        i++;
        continue;
      case ')':
        push('rparen', c, i);
        i++;
        continue;
      case ',':
        push('comma', c, i);
        i++;
        continue;
    }

    if (SINGLE_OPS.includes(c)) {
      push('op', c, i);
      i++;
      continue;
    }

    // Unknown char — emit as a lone op so the parser can report it.
    push('op', c, i);
    i++;
  }

  push('eof', '', i);
  return tokens;
}

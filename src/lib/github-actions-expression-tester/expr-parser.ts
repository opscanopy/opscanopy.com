/**
 * GitHub Actions expression parser — precedence-climbing (Pratt) parser that
 * turns a token stream into an `Expr` AST. It never throws: a syntax failure
 * returns `{ ast: { t:'error', raw }, error }` so the evaluator and UI can
 * still render something.
 *
 * Precedence (lowest → highest):
 *   ||  <  &&  <  == !=  <  < > <= >=  <  unary !  <  postfix(.prop / .* / [i] / call())  <  primary
 *
 * There is no arithmetic in the language; `*` is only the object-filter operator
 * and is only valid immediately after a `.`.
 */
import { lex, type Token } from './expr-lexer';
import type { GhaValue } from './types';

export type Expr =
  | { t: 'lit'; value: GhaValue; raw: string }
  | { t: 'ctx'; name: string }
  | { t: 'prop'; obj: Expr; name: string }
  | { t: 'index'; obj: Expr; index: Expr }
  | { t: 'filter'; obj: Expr }
  | { t: 'call'; name: string; args: Expr[] }
  | { t: 'not'; arg: Expr }
  | { t: 'logic'; op: '&&' | '||'; left: Expr; right: Expr }
  | { t: 'eq'; op: '==' | '!='; left: Expr; right: Expr }
  | { t: 'cmp'; op: '<' | '>' | '<=' | '>='; left: Expr; right: Expr }
  | { t: 'error'; raw: string };

export interface ParseResult {
  ast: Expr;
  error?: string;
}

const RESERVED: Record<string, GhaValue> = {
  true: true,
  false: false,
  null: null,
  // GitHub accepts these numeric literals in expressions.
  NaN: NaN,
  Infinity: Infinity,
};

class Parser {
  private toks: Token[];
  private pos = 0;
  error?: string;

  constructor(body: string) {
    this.toks = lex(body);
  }

  private peek(): Token {
    return this.toks[this.pos];
  }
  private next(): Token {
    return this.toks[this.pos++];
  }
  private fail(msg: string): Expr {
    if (!this.error) this.error = msg;
    return { t: 'error', raw: msg };
  }

  parse(): ParseResult {
    const ast = this.parseExpr(0);
    if (!this.error && this.peek().kind !== 'eof') {
      this.error = `Unexpected token "${this.peek().text || 'end'}" at position ${this.peek().from}.`;
    }
    return { ast: this.error ? { t: 'error', raw: this.error } : ast, error: this.error };
  }

  /** Binding power of the binary operator the current token starts, or -1. */
  private bp(): number {
    const t = this.peek();
    if (t.kind !== 'op') return -1;
    switch (t.text) {
      case '||':
        return 1;
      case '&&':
        return 2;
      case '==':
      case '!=':
        return 3;
      case '<':
      case '>':
      case '<=':
      case '>=':
        return 4;
      default:
        return -1;
    }
  }

  /** Precedence-climbing binary-expression parser. */
  private parseExpr(minBp: number): Expr {
    let left = this.parseUnary();
    for (;;) {
      const bp = this.bp();
      if (bp < 0 || bp < minBp) break;
      const op = this.next().text;
      const right = this.parseExpr(bp + 1); // left-associative
      if (op === '&&' || op === '||') {
        left = { t: 'logic', op, left, right };
      } else if (op === '==' || op === '!=') {
        left = { t: 'eq', op, left, right };
      } else {
        left = { t: 'cmp', op: op as '<' | '>' | '<=' | '>=', left, right };
      }
    }
    return left;
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (t.kind === 'op' && t.text === '!') {
      this.next();
      return { t: 'not', arg: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let node = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t.kind === 'dot') {
        this.next();
        const after = this.peek();
        if (after.kind === 'star') {
          this.next();
          node = { t: 'filter', obj: node };
        } else if (after.kind === 'ident') {
          this.next();
          node = { t: 'prop', obj: node, name: after.text };
        } else {
          return this.fail(`Expected a property name or "*" after "." at position ${after.from}.`);
        }
      } else if (t.kind === 'lbracket') {
        this.next();
        const index = this.parseExpr(0);
        if (this.peek().kind !== 'rbracket') {
          return this.fail(`Expected "]" at position ${this.peek().from}.`);
        }
        this.next();
        node = { t: 'index', obj: node, index };
      } else {
        break;
      }
    }
    return node;
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    switch (t.kind) {
      case 'number':
        this.next();
        return { t: 'lit', value: t.value as number, raw: t.text };
      case 'string':
        this.next();
        return { t: 'lit', value: (t.value as string) ?? '', raw: t.text };
      case 'ident': {
        this.next();
        // Reserved literal?
        if (Object.prototype.hasOwnProperty.call(RESERVED, t.text)) {
          return { t: 'lit', value: RESERVED[t.text], raw: t.text };
        }
        // Function call?
        if (this.peek().kind === 'lparen') {
          this.next();
          const args: Expr[] = [];
          if (this.peek().kind !== 'rparen') {
            for (;;) {
              args.push(this.parseExpr(0));
              if (this.peek().kind === 'comma') {
                this.next();
                continue;
              }
              break;
            }
          }
          if (this.peek().kind !== 'rparen') {
            return this.fail(`Expected ")" to close call to "${t.text}" at position ${this.peek().from}.`);
          }
          this.next();
          return { t: 'call', name: t.text, args };
        }
        // Bare identifier = a top-level context reference.
        return { t: 'ctx', name: t.text };
      }
      case 'lparen': {
        this.next();
        const inner = this.parseExpr(0);
        if (this.peek().kind !== 'rparen') {
          return this.fail(`Expected ")" at position ${this.peek().from}.`);
        }
        this.next();
        return inner;
      }
      case 'eof':
        return this.fail('Empty expression.');
      default:
        return this.fail(`Unexpected token "${t.text || 'end'}" at position ${t.from}.`);
    }
  }
}

/** Parse an expression body into an AST. Never throws. */
export function parse(body: string): ParseResult {
  try {
    return new Parser(body).parse();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not parse the expression.';
    return { ast: { t: 'error', raw: msg }, error: msg };
  }
}

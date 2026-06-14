/**
 * GitHub Actions expression function library.
 *
 * Every documented function is implemented with faithful semantics. Function
 * names are case-insensitive (the runner lowercases them). Two functions cannot
 * be reproduced honestly in the browser and are handled explicitly:
 *   • hashFiles(...) — needs the repo file tree + SHA-256 of contents → returns
 *     a clearly-marked sentinel and raises a `hashfiles-stub` info warning.
 *   • the full github.event payload — modelled as a user-editable mock object,
 *     never fetched.
 *
 * Where the real runner FAILS the run (bad format() index, invalid fromJSON),
 * we deliberately DEGRADE and warn instead of throwing — engines never throw.
 */
import type { EvalContext, ExprWarning, GhaValue } from './types';
import { castToNumber, isGhaArray, looseEquals, render } from './values';

export interface FnContext {
  ctx: EvalContext;
  warn: (w: ExprWarning) => void;
}

type Fn = (args: GhaValue[], f: FnContext) => GhaValue;

const HASHFILES_SENTINEL = '0000000000000000000000000000000000000000000000000000000000000000';

/** success()/failure()/always()/cancelled() resolve from the editable status. */
function statusSuccess(ctx: EvalContext): boolean {
  if (ctx.jobStatus) return ctx.jobStatus === 'success';
  if (ctx.stepConclusions && ctx.stepConclusions.length) {
    return !ctx.stepConclusions.some((c) => c === 'failure' || c === 'cancelled');
  }
  return true; // default: nothing failed yet
}
function statusFailure(ctx: EvalContext): boolean {
  if (ctx.jobStatus) return ctx.jobStatus === 'failure';
  if (ctx.stepConclusions && ctx.stepConclusions.length) {
    return ctx.stepConclusions.some((c) => c === 'failure');
  }
  return false;
}
function statusCancelled(ctx: EvalContext): boolean {
  return ctx.jobStatus === 'cancelled';
}

const FUNCTIONS: Record<string, Fn> = {
  contains(args) {
    const [search, item] = args;
    if (isGhaArray(search)) {
      return search.some((el) => looseEquals(el, item ?? null));
    }
    return render(search ?? null)
      .toLowerCase()
      .includes(render(item ?? null).toLowerCase());
  },

  startswith(args) {
    const [s, prefix] = args;
    return render(s ?? null)
      .toLowerCase()
      .startsWith(render(prefix ?? null).toLowerCase());
  },

  endswith(args) {
    const [s, suffix] = args;
    return render(s ?? null)
      .toLowerCase()
      .endsWith(render(suffix ?? null).toLowerCase());
  },

  format(args, f) {
    const [fmt, ...vals] = args;
    const template = render(fmt ?? null);
    let out = '';
    for (let i = 0; i < template.length; i++) {
      const c = template[i];
      if (c === '{') {
        if (template[i + 1] === '{') {
          out += '{';
          i++;
          continue;
        }
        // read the index
        let j = i + 1;
        let digits = '';
        while (j < template.length && template[j] >= '0' && template[j] <= '9') {
          digits += template[j];
          j++;
        }
        if (digits !== '' && template[j] === '}') {
          const idx = Number(digits);
          if (idx < vals.length) {
            out += render(vals[idx]);
          } else {
            // Runner errors here; we degrade and warn.
            out += `{${digits}}`;
            f.warn({
              id: 'format-index',
              severity: 'warning',
              message: `format() references {${digits}} but only ${vals.length} value(s) were supplied. The real runner fails the run here; this tool leaves the placeholder.`,
            });
          }
          i = j;
          continue;
        }
        out += c; // a lone '{' that isn't a valid placeholder
      } else if (c === '}') {
        if (template[i + 1] === '}') {
          out += '}';
          i++;
          continue;
        }
        out += c;
      } else {
        out += c;
      }
    }
    return out;
  },

  join(args) {
    const [arr, sep] = args;
    const separator = sep === undefined || sep === null ? ',' : render(sep);
    if (isGhaArray(arr)) return arr.map((el) => render(el)).join(separator);
    return render(arr ?? null);
  },

  tojson(args) {
    const [value] = args;
    return JSON.stringify(value ?? null, null, 2);
  },

  fromjson(args, f) {
    const [str] = args;
    const text = render(str ?? null);
    try {
      return JSON.parse(text) as GhaValue;
    } catch {
      f.warn({
        id: 'fromjson-parse',
        severity: 'warning',
        message: `fromJSON() received a string that is not valid JSON. The real runner fails the run here; this tool returns null.`,
      });
      return null;
    }
  },

  hashfiles(args, f) {
    f.warn({
      id: 'hashfiles-stub',
      severity: 'info',
      message:
        'hashFiles() cannot run in the browser — it hashes the contents of files in your repository, which this tool cannot see. A placeholder value is shown; the real hash is computed by the runner.',
    });
    void args;
    return HASHFILES_SENTINEL;
  },

  success(_args, f) {
    return statusSuccess(f.ctx);
  },
  failure(_args, f) {
    return statusFailure(f.ctx);
  },
  always() {
    return true;
  },
  cancelled(_args, f) {
    return statusCancelled(f.ctx);
  },
};

/** Is `name` (any case) a known function? */
export function isKnownFunction(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(FUNCTIONS, name.toLowerCase());
}

/** Call a function by name (case-insensitive). Unknown → null + a warning. */
export function callFunction(name: string, args: GhaValue[], f: FnContext): GhaValue {
  const fn = FUNCTIONS[name.toLowerCase()];
  if (!fn) {
    f.warn({
      id: 'unknown-function',
      severity: 'warning',
      message: `"${name}" is not a GitHub Actions expression function. Known functions: contains, startsWith, endsWith, format, join, toJSON, fromJSON, hashFiles, success, failure, always, cancelled.`,
    });
    return null;
  }
  return fn(args, f);
}

/** Coerce a value to a number for callers that need the runner's rule. */
export { castToNumber };

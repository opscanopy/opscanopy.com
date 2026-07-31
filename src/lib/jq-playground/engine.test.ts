/**
 * jq Playground — engine tests against the REAL jq 1.8.2 WebAssembly binary.
 *
 * No mocks and no fixtures-of-expected-output: `loadJq()` is called bare, which
 * makes jq-wasm read `node_modules/jq-wasm/dist/build/jq.wasm` off disk, so
 * every expectation below is a value the actual jq binary produced. That is the
 * point of the tool: if these vectors ever change, jq changed, and the page's
 * claims need to change with it.
 *
 * Two of the plan's pinned vectors were WRONG and are corrected here (both
 * verified by running jq 1.8.2):
 *   - `$__loc__` reports `"file":"<top-level>"`, not `<stdin>`.
 *   - `"ab"*0` is the empty string `""`, not `null`.
 *
 * One jq-wasm behaviour worth knowing while reading the assertions: the package
 * `.trim()`s both stdout and stderr, so jq's trailing newline never appears and
 * leading whitespace on the very first raw output is lost from `stdout`. The
 * engine reconstructs `outputs`/`outputText` from a JSON pass instead, which is
 * why those keep the whitespace `stdout` drops.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_INPUT_BYTES,
  MAX_NOTICES,
  MAX_OUTPUT_ROWS,
  MAX_PROGRAM_CHARS,
  buildFlags,
  byteColumnToCharColumn,
  getJq,
  getJqVersion,
  runJq,
  splitJsonOutputs,
  unboundedRiskHint,
} from './engine';
import { decodeState, encodeState } from './hash';
import { examples } from './examples';
import type { JqErr, JqOk } from './types';

/** Narrowing helper: assert success and return the ok result. */
function ok(result: Awaited<ReturnType<typeof runJq>>): JqOk {
  if (!result.ok) {
    throw new Error(
      `expected a successful run, got ${result.errorKind}: ${result.error} (exit ${result.exitCode})`,
    );
  }
  return result;
}

/** Narrowing helper: assert failure and return the error result. */
function err(result: Awaited<ReturnType<typeof runJq>>): JqErr {
  if (result.ok) {
    throw new Error(`expected a failed run, got outputs ${JSON.stringify(result.outputs)}`);
  }
  return result;
}

const OBJ = '{"a":1,"b":[1,2]}';

describe('the WASM handle', () => {
  it('loads and is memoized (same handle object twice)', async () => {
    const a = await getJq();
    const b = await getJq();
    expect(a).toBe(b);
  });

  it('reports jq-1.8.2 read from the binary, never a hardcoded string', async () => {
    // Vector 18. Read through the handle AND through the engine's helper, so a
    // future refactor cannot quietly substitute a literal.
    const handle = await getJq();
    expect(handle.version).toBe('jq-1.8.2');
    expect(await getJqVersion()).toBe('jq-1.8.2');
  });

  it('exposes the version on every result', async () => {
    const result = ok(await runJq('.', OBJ));
    expect(result.version).toBe('jq-1.8.2');
  });
});

describe('flag assembly', () => {
  it('emits nothing for the defaults', () => {
    expect(buildFlags({})).toEqual([]);
  });

  it('emits the four toggles in a stable order', () => {
    expect(
      buildFlags({ compact: true, nullInput: true, slurp: true, rawOutput: true }),
    ).toEqual(['-r', '-s', '-n', '-c']);
  });

  it('emits --indent only for a non-default pretty width', () => {
    expect(buildFlags({ tabWidth: 2 })).toEqual([]);
    expect(buildFlags({ tabWidth: 4 })).toEqual(['--indent', '4']);
    expect(buildFlags({ tabWidth: 0 })).toEqual(['--tab']);
  });

  it('never emits --indent alongside -c, because jq lets it win', () => {
    // Verified against jq 1.8.2: `-c --indent 4` pretty-prints. Emitting both
    // would make the -c chip silently do nothing.
    expect(buildFlags({ compact: true, tabWidth: 4 })).toEqual(['-c']);
  });

  it('clamps a hostile tabWidth instead of forwarding it', () => {
    expect(buildFlags({ tabWidth: 99 })).toEqual(['--indent', '7']);
    expect(buildFlags({ tabWidth: -3 })).toEqual([]);
    expect(buildFlags({ tabWidth: 2.7 })).toEqual([]);
    expect(buildFlags({ tabWidth: Number.NaN })).toEqual([]);
  });
});

describe('the 18 pinned jq 1.8.2 vectors', () => {
  it('1a. identity pretty-prints by default', async () => {
    const result = ok(await runJq('.', OBJ));
    expect(result.outputs).toEqual(['{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}']);
    expect(result.totalOutputs).toBe(1);
    expect(result.outputsExact).toBe(true);
    expect(result.flags).toEqual([]);
  });

  it('1b. identity with -c is one line', async () => {
    const result = ok(await runJq('.', OBJ, { compact: true }));
    expect(result.outputs).toEqual(['{"a":1,"b":[1,2]}']);
    expect(result.flags).toEqual(['-c']);
  });

  it('2. @base64d decodes to "hello"', async () => {
    expect(ok(await runJq('@base64d', '"aGVsbG8="')).outputs).toEqual(['"hello"']);
  });

  it('3. test("^AB";"i") is true — the regex flags argument works', async () => {
    expect(ok(await runJq('test("^AB";"i")', '"abc"')).outputs).toEqual(['true']);
  });

  it('4. limit(2;.[]) emits exactly two outputs', async () => {
    const result = ok(await runJq('limit(2;.[])', '[1,2,3,4]'));
    expect(result.outputs).toEqual(['1', '2']);
    expect(result.totalOutputs).toBe(2);
    expect(result.stdout).toBe('1\n2');
  });

  it('5. tostream emits the leaf then the closing path', async () => {
    const result = ok(await runJq('tostream', '{"a":1}', { compact: true }));
    expect(result.outputs).toEqual(['[["a"],1]', '[["a"]]']);
  });

  it('6. path/getpath round-trip', async () => {
    const paths = ok(await runJq('[path(.a.b)]', '{"a":{"b":5}}', { compact: true }));
    expect(paths.outputs).toEqual(['[["a","b"]]']);
    const value = ok(await runJq('getpath(["a","b"])', '{"a":{"b":5}}'));
    expect(value.outputs).toEqual(['5']);
  });

  it('7. ?// destructuring alternative picks per-shape bindings', async () => {
    const program =
      '.[] as [$x] ?// {$a} | if $x then "arr \\($x)" else "obj \\($a)" end';
    const result = ok(await runJq(program, '[[1,2],{"a":3}]'));
    expect(result.outputs).toEqual(['"arr 1"', '"obj 3"']);
  });

  it('8. $__loc__ reports file "<top-level>" (CORRECTED — not "<stdin>")', async () => {
    const result = ok(await runJq('$__loc__', 'null', { compact: true }));
    expect(result.outputs).toEqual(['{"file":"<top-level>","line":1}']);
  });

  it('9a. "ab"*3 repeats the string', async () => {
    expect(ok(await runJq('"ab"*3', 'null')).outputs).toEqual(['"ababab"']);
  });

  it('9b. "ab"*0 is the EMPTY STRING (CORRECTED — not null)', async () => {
    const result = ok(await runJq('"ab"*0', 'null'));
    expect(result.outputs).toEqual(['""']);
    expect(result.outputs).not.toEqual(['null']);
  });

  it('10. false // 42 takes the alternative', async () => {
    expect(ok(await runJq('false // 42', 'null')).outputs).toEqual(['42']);
  });

  it('11. try error("boom") catch . yields the message as a value', async () => {
    const result = ok(await runJq('try error("boom") catch .', 'null'));
    expect(result.outputs).toEqual(['"boom"']);
    expect(result.exitCode).toBe(0);
  });

  it('12. reduce emits one row, foreach emits one row per element', async () => {
    const reduced = ok(await runJq('reduce .[] as $x (0; . + $x)', '[1,2,3]'));
    expect(reduced.outputs).toEqual(['6']);
    expect(reduced.totalOutputs).toBe(1);
    const each = ok(await runJq('foreach .[] as $x (0; . + $x)', '[1,2,3]'));
    expect(each.outputs).toEqual(['1', '3', '6']);
    expect(each.totalOutputs).toBe(3);
  });

  it('13. null|.[]? produces zero outputs and still exits 0', async () => {
    const result = ok(await runJq('.[]?', 'null'));
    expect(result.outputs).toEqual([]);
    expect(result.totalOutputs).toBe(0);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('14. explode/implode carry non-ASCII code points exactly', async () => {
    const exploded = ok(await runJq('explode', '"héllo"', { compact: true }));
    expect(exploded.outputs).toEqual(['[104,233,108,108,111]']);
    const imploded = ok(await runJq('implode', '[104,233]'));
    expect(imploded.outputs).toEqual(['"hé"']);
  });

  it('15. -s slurps the stream into an array; -n + inputs reads it explicitly', async () => {
    const slurped = ok(await runJq('.', '1 2 3', { slurp: true, compact: true }));
    expect(slurped.outputs).toEqual(['[1,2,3]']);
    const pulled = ok(await runJq('[inputs]', '1 2 3', { nullInput: true, compact: true }));
    expect(pulled.outputs).toEqual(['[1,2,3]']);
  });

  it('16. -r on an object still prints JSON (it only unwraps strings)', async () => {
    const object = ok(await runJq('.', '{"a":1}', { rawOutput: true, compact: true }));
    expect(object.outputs).toEqual(['{"a":1}']);
    const string = ok(await runJq('.', '"hi"', { rawOutput: true }));
    expect(string.outputs).toEqual(['hi']);
  });

  it('17a. a compile error is exit 3, kind "compile", with a program position', async () => {
    const result = err(await runJq('.foo(', OBJ));
    expect(result.exitCode).toBe(3);
    expect(result.errorKind).toBe('compile');
    expect(result.error).toBe("syntax error, unexpected '(', expecting end of file");
    expect(result.errorLine).toBe(1);
    expect(result.errorColumn).toBe(5);
    expect(result.errorScope).toBe('program');
    expect(result.excerpt).toBe('    .foo(\n        ^');
  });

  it('17b. an input parse error is exit 5 with the "jq: parse error:" prefix', async () => {
    const result = err(await runJq('.', '{not json'));
    expect(result.exitCode).toBe(5);
    expect(result.errorKind).toBe('input');
    expect(result.error).toBe('Invalid numeric literal');
    expect(result.errorLine).toBe(1);
    expect(result.errorColumn).toBe(5);
    expect(result.errorScope).toBe('input');
  });

  it('17c. a runtime error is exit 5 WITHOUT that prefix — the same code, a different cause', async () => {
    const result = err(await runJq('.a[0]', '{"a":1}'));
    expect(result.exitCode).toBe(5);
    expect(result.errorKind).toBe('runtime');
    expect(result.error).toBe('Cannot index number with number (0)');
    // jq prints `/dev/stdin:0` for runtime errors — a placeholder, not a line.
    expect(result.errorLine).toBeUndefined();
    expect(result.errorScope).toBeNull();
  });

  it('18. the version is jq-1.8.2 (asserted in "the WASM handle" too)', async () => {
    expect(await getJqVersion()).toBe('jq-1.8.2');
  });
});

describe('error classification, beyond the three headline shapes', () => {
  it('an undefined function is a compile error, not a runtime one', async () => {
    const result = err(await runJq('nosuchfunc', '{}'));
    expect(result.errorKind).toBe('compile');
    expect(result.error).toBe('nosuchfunc/0 is not defined');
    expect(result.errorLine).toBe(1);
    expect(result.errorColumn).toBe(1);
    expect(result.excerpt).toBe('    nosuchfunc\n    ^^^^^^^^^^');
  });

  it('halt_error prints a bare message with no jq: prefix and is still runtime', async () => {
    const result = err(await runJq('halt_error', '"bye"'));
    expect(result.exitCode).toBe(5);
    expect(result.errorKind).toBe('runtime');
    expect(result.error).toBe('bye');
  });

  it('a non-string error value keeps jq’s own wording, unparenthesized', async () => {
    const result = err(await runJq('error({code:1})', 'null'));
    expect(result.errorKind).toBe('runtime');
    expect(result.error).toBe('not a string: {"code":1}');
  });

  it('reports partial outputs produced before a runtime error', async () => {
    const result = err(await runJq('.[]|.+1', '[1,"x",3]'));
    expect(result.errorKind).toBe('runtime');
    expect(result.error).toBe('string ("x") and number (1) cannot be added');
    expect(result.partialOutputs).toEqual(['2']);
    expect(result.totalPartialOutputs).toBe(1);
    expect(result.partialTruncated).toBe(false);
  });

  it('reports partial outputs produced before an INPUT parse error', async () => {
    const result = err(await runJq('.', '{"a":1} {', { compact: true }));
    expect(result.errorKind).toBe('input');
    expect(result.error).toBe('Unfinished JSON term at EOF');
    expect(result.errorLine).toBe(1);
    expect(result.errorColumn).toBe(9);
    expect(result.partialOutputs).toEqual(['{"a":1}']);
  });

  it('keeps the trailing "at EOF" that belongs to the message', async () => {
    const result = err(await runJq('.', '{"a":'));
    expect(result.error).toBe('Unfinished JSON term at EOF');
    expect(result.errorLine).toBe(1);
    expect(result.errorColumn).toBe(5);
  });

  it('jq exits 0 when only the LAST input succeeded — the errors survive as notices', async () => {
    // Verified against jq 1.8.2: the exit code reflects the final input only.
    // `1 "x" 2 "y" 3` fails twice and still exits 0, which is precisely the kind
    // of quietly-wrong answer this tool exists to surface — so the run reports
    // ok:true AND carries both errors.
    const result = ok(await runJq('.+1', '1 "x" 2 "y" 3'));
    expect(result.exitCode).toBe(0);
    expect(result.outputs).toEqual(['2', '3', '4']);
    expect(result.notices).toEqual([
      'string ("x") and number (1) cannot be added',
      'string ("y") and number (1) cannot be added',
    ]);
    expect(result.totalNotices).toBe(2);
    expect(result.noticesTruncated).toBe(false);
  });

  it('…and exits 5 when the last input is the one that failed', async () => {
    const result = err(await runJq('.+1', '1 "x"'));
    expect(result.exitCode).toBe(5);
    expect(result.errorKind).toBe('runtime');
    expect(result.error).toBe('string ("x") and number (1) cannot be added');
    expect(result.partialOutputs).toEqual(['2']);
    expect(result.totalPartialOutputs).toBe(1);
  });

  it('caps the notice list and reports the true total', async () => {
    // 41 bad inputs, the last of them bad too → exit 5, 41 stderr lines: the
    // first becomes `error` and the remaining 40 are notices, which must be
    // capped with an honest count.
    const input = Array.from({ length: 41 }, () => '"x"').join(' ');
    const result = err(await runJq('.+1', input));
    expect(result.totalNotices).toBe(40);
    expect(result.notices).toHaveLength(MAX_NOTICES);
    expect(result.noticesTruncated).toBe(true);
  });

  it('reports stderr from a successful run as notices (debug)', async () => {
    const result = ok(await runJq('.a|debug', '{"a":1}'));
    expect(result.outputs).toEqual(['1']);
    expect(result.notices).toEqual(['["DEBUG:",1]']);
    expect(result.totalNotices).toBe(1);
  });

  /*
   * REGRESSION (was: "confidently wrong error classification"). Exit 5 used to
   * be disambiguated by stderr line 0, but `debug`/`stderr` write to stderr from
   * inside the program, BEFORE jq's own diagnostic. `debug` + invalid JSON was
   * therefore reported as a RUNTIME error in the program, with the debug dump
   * `["DEBUG:",1]` as the error text and the red rule on the program pane, while
   * the real parse error was demoted to a secondary "jq also wrote to stderr"
   * notice. Classification now reads jq's own line wherever it sits.
   */
  it('classifies by jq’s OWN stderr line, not by a debug dump that precedes it', async () => {
    const result = err(await runJq('debug', '1 {oops'));
    expect(result.exitCode).toBe(5);
    expect(result.errorKind).toBe('input');
    expect(result.error).toBe('Invalid numeric literal at EOF');
    expect(result.errorLine).toBe(1);
    expect(result.errorColumn).toBe(7);
    expect(result.errorScope).toBe('input');
    // The debug dump survives as a notice instead of masquerading as the error.
    expect(result.notices).toEqual(['["DEBUG:",1]']);
  });

  it('recovers jq’s diagnostic when `stderr` glued it onto the same line', async () => {
    // `stderr` writes without a trailing newline, so jq 1.8.2 emits ONE line:
    // `1jq: parse error: Invalid numeric literal at EOF at line 1, column 7`.
    const result = err(await runJq('stderr|.', '1 {oops'));
    expect(result.errorKind).toBe('input');
    expect(result.error).toBe('Invalid numeric literal at EOF');
    expect(result.errorScope).toBe('input');
    expect(result.notices).toEqual(['1']);
  });

  it('does NOT mistake a halt_error message that quotes jq’s prefix for a parse error', async () => {
    // The glued-line recovery must not fire here: halt_error terminates jq, so
    // nothing of jq's own can follow the message on that line.
    const result = err(await runJq('halt_error', '"oops jq: parse error: fake at line 9, column 9"'));
    expect(result.errorKind).toBe('runtime');
    expect(result.errorScope).toBeNull();
    expect(result.error).toBe('oops jq: parse error: fake at line 9, column 9');
  });

  /*
   * REGRESSION (was: "jq's BYTE columns presented as editor columns"). jq counts
   * parse/compile columns in bytes; the card says "line 1, column N" and the
   * editors count UTF-16 units, so any non-ASCII before the error pushed the
   * number right — `{"café":1,}` reported column 12 for a `}` that is character
   * 11, and `{"日本語":1,}` reported 16 for character 10.
   */
  it('reports the CHARACTER column, not jq’s byte column, for a non-ASCII input line', async () => {
    const accented = err(await runJq('.', '{"café":1,}'));
    expect(accented.errorKind).toBe('input');
    expect(accented.error).toBe('Expected another key-value pair');
    expect(accented.errorColumn).toBe(11); // jq's stderr says 12 (bytes)
    const cjk = err(await runJq('.', '{"日本語":1,}'));
    expect(cjk.errorColumn).toBe(10); // jq's stderr says 16 (bytes)
    // ASCII is unaffected — the conversion is the identity there.
    expect(err(await runJq('.', '{"ab":1,}')).errorColumn).toBe(9);
  });

  it('converts the byte column on a non-ASCII PROGRAM line too', async () => {
    const result = err(await runJq('"ééé" | fooo', 'null'));
    expect(result.errorKind).toBe('compile');
    expect(result.errorLine).toBe(1);
    expect(result.errorColumn).toBe(9); // jq's stderr says 12 (bytes)
    expect(result.errorScope).toBe('program');
  });

  it('converts byte columns on later lines, and leaves an overshoot honest', () => {
    expect(byteColumnToCharColumn('{"ab":1,}', 9)).toBe(9);
    expect(byteColumnToCharColumn('{"café":1,}', 12)).toBe(11);
    expect(byteColumnToCharColumn('{"日本語":1,}', 16)).toBe(10);
    // An astral character is 4 bytes and 2 UTF-16 units, which is what
    // CodeMirror counts.
    expect(byteColumnToCharColumn('"😀"x', 6)).toBe(4);
    expect(byteColumnToCharColumn('"😀"x', 7)).toBe(5);
    expect(byteColumnToCharColumn('abc', 1)).toBe(1);
    expect(byteColumnToCharColumn('abc', 0)).toBe(0);
    // Past the end of the line (jq's "at EOF" shapes) keeps the overshoot.
    expect(byteColumnToCharColumn('é', 5)).toBe(4);
  });

  it('halt_error(n) sets an arbitrary exit code and is still the user’s runtime error', async () => {
    // Verified against jq 1.8.2: halt_error(1) exits 1 and halt_error(2) exits 2,
    // so "anything that is not 3 and not a parse error is a runtime error" is the
    // only classification that does not mislabel these as engine faults.
    const one = err(await runJq('halt_error(1)', '"msg"'));
    expect(one.exitCode).toBe(1);
    expect(one.errorKind).toBe('runtime');
    expect(one.error).toBe('msg');
    const two = err(await runJq('halt_error(2)', '"msg"'));
    expect(two.exitCode).toBe(2);
    expect(two.errorKind).toBe('runtime');
  });

  it('an empty program is an engine-side guard, not a jq compile error', async () => {
    const result = err(await runJq('   \n ', OBJ));
    expect(result.errorKind).toBe('compile');
    expect(result.error).toBe('Enter a jq program — "." is the identity filter and a fine start.');
    expect(result.exitCode).toBe(0);
  });
});

describe('output splitting', () => {
  it('splits pretty-printed multi-output text exactly', () => {
    const stdout = '{\n  "a": 1\n}\n{\n  "b": 2\n}';
    expect(splitJsonOutputs(stdout)).toEqual(['{\n  "a": 1\n}', '{\n  "b": 2\n}']);
  });

  it('splits scalars, strings, and empty input', () => {
    expect(splitJsonOutputs('1\n2')).toEqual(['1', '2']);
    expect(splitJsonOutputs('null\nfalse\n0')).toEqual(['null', 'false', '0']);
    expect(splitJsonOutputs('"a"\n"b"')).toEqual(['"a"', '"b"']);
    expect(splitJsonOutputs('')).toEqual([]);
    expect(splitJsonOutputs('   \n  ')).toEqual([]);
  });

  it('does not split on newlines or braces inside a string', () => {
    expect(splitJsonOutputs('"a\\nb"\n"}"')).toEqual(['"a\\nb"', '"}"']);
    expect(splitJsonOutputs('{"k":"}\\""}')).toEqual(['{"k":"}\\""}']);
  });

  it('returns null on text it cannot prove a split for', () => {
    expect(splitJsonOutputs('{"a":1')).toBeNull();
    expect(splitJsonOutputs('}')).toBeNull();
    expect(splitJsonOutputs('"unterminated')).toBeNull();
    expect(splitJsonOutputs('not json at all')).toBeNull();
  });

  it('pretty-prints a multi-output stream into real rows through the engine', async () => {
    const result = ok(await runJq('.[]', '[{"a":1},{"b":2}]'));
    expect(result.outputs).toEqual(['{\n  "a": 1\n}', '{\n  "b": 2\n}']);
    expect(result.outputsExact).toBe(true);
  });

  it('splits -r rows exactly, even when a raw string contains a newline', async () => {
    const result = ok(await runJq('.[]', '["a\\nb","c"]', { rawOutput: true }));
    expect(result.outputs).toEqual(['a\nb', 'c']);
    expect(result.totalOutputs).toBe(2);
    expect(result.outputsExact).toBe(true);
    // The single authoritative stdout cannot express that boundary at all.
    expect(result.stdout).toBe('a\nb\nc');
  });

  it('splits -r rows exactly when raw strings and JSON values are mixed', async () => {
    const result = ok(await runJq('.[]', '[{"a":1},"txt"]', { rawOutput: true }));
    expect(result.outputs).toEqual(['{\n  "a": 1\n}', 'txt']);
    expect(result.outputsExact).toBe(true);
  });

  it('recovers raw rows that jq-wasm’s stdout.trim() would have eaten', async () => {
    const result = ok(await runJq('.[]', '["  pad","",""]', { rawOutput: true }));
    expect(result.outputs).toEqual(['  pad', '', '']);
    expect(result.totalOutputs).toBe(3);
    expect(result.outputsExact).toBe(true);
    // stdout lost the leading pad AND both trailing blank lines.
    expect(result.stdout).toBe('pad');
    // Copy-all therefore comes from the rows, not from stdout.
    expect(result.outputText).toBe('  pad\n\n');
  });

  it('caps the row count and reports the true total', async () => {
    const result = ok(await runJq(`range(${MAX_OUTPUT_ROWS + 25})`, 'null'));
    expect(result.totalOutputs).toBe(MAX_OUTPUT_ROWS + 25);
    expect(result.outputs).toHaveLength(MAX_OUTPUT_ROWS);
    expect(result.truncated).toBe(true);
    // The full text is still available for copying, uncapped.
    expect(result.stdout.split('\n')).toHaveLength(MAX_OUTPUT_ROWS + 25);
  });

  it('caps by total characters as well as by row count', async () => {
    // 40 rows of ~30 000 chars each: under the row cap, far over the char cap.
    const result = ok(await runJq('range(40)|[range(6000)]|tostring', 'null', { rawOutput: true }));
    expect(result.totalOutputs).toBe(40);
    expect(result.truncated).toBe(true);
    expect(result.outputs.length).toBeLessThan(40);
    expect(result.outputs.join('').length).toBeLessThan(500_000);
  });
});

describe('guards — the engine never throws and never freezes on hostile input', () => {
  it('refuses input over the 2 MB cap with the exact byte count, never a rounded one', async () => {
    const big = '"' + 'x'.repeat(MAX_INPUT_BYTES + 1024) + '"';
    // 2,000,000 + 1024 payload bytes + the two quote characters.
    expect(big.length).toBe(2_001_026);
    const result = err(await runJq('.', big));
    expect(result.errorKind).toBe('input');
    expect(result.error).toBe(
      'The JSON input is 2,001,026 bytes — this playground caps input at 2 MB (2,000,000 bytes) ' +
        'so one paste can never freeze your tab. Trim it and try again.',
    );
    expect(result.exitCode).toBe(0);
  });

  it('measures the cap in UTF-8 BYTES, not JS characters', async () => {
    // 🌍 is 4 UTF-8 bytes but 2 JS chars: a char-based check would let ~2x
    // through, and jq's stdin is bytes.
    const emoji = '"' + '🌍'.repeat(600_000) + '"';
    expect(emoji.length).toBeLessThan(MAX_INPUT_BYTES);
    const result = err(await runJq('.', emoji));
    expect(result.errorKind).toBe('input');
    expect(result.error).toContain('caps input at 2 MB');
  });

  it('refuses an absurdly long program instead of compiling it', async () => {
    const program = '.' + '|.'.repeat(MAX_PROGRAM_CHARS);
    expect(program.length).toBe(40_001);
    const result = err(await runJq(program, '{}'));
    expect(result.errorKind).toBe('compile');
    expect(result.error).toBe(
      'The program is 40,001 characters — this playground caps it at 20,000 characters. ' +
        'Shorten it and try again.',
    );
  });

  it('survives empty, blank and truncated input', async () => {
    expect(ok(await runJq('.', '')).outputs).toEqual([]);
    expect(ok(await runJq('.', '   \n\t ')).outputs).toEqual([]);
    expect(err(await runJq('.', '{"a":')).errorKind).toBe('input');
    expect(err(await runJq('.', '[1,2')).errorKind).toBe('input');
  });

  it('survives garbage in both slots without throwing', async () => {
    const garbage = [
      ['', ''],
      [' ', ' '],
      ['((((((((', '}}}}}}'],
      ['.[" "]', '{" ":1}'],
      ['\ud800', '"\ud800"'],
      ['.a as $x | $y', '{}'],
      ['-'.repeat(500), '-'.repeat(500)],
      ['🌍', '🌍'],
      ['.[] | .[] | .[]', '[[[[[[1]]]]]]'],
      ['include "x";.', '{}'],
      ['import "x" as y;.', '{}'],
      ['$ENV.PATH', 'null'],
      ['input_filename', 'null'],
      ['1/0', 'null'],
      ['[limit(3;repeat(1))]', 'null'],
    ] as const;
    for (const [program, input] of garbage) {
      const result = await runJq(program, input);
      expect(typeof result.ok, `${program} / ${input}`).toBe('boolean');
      if (!result.ok) {
        expect(result.error.length, `${program} produced an empty diagnostic`).toBeGreaterThan(0);
        expect(['compile', 'runtime', 'input', 'engine']).toContain(result.errorKind);
      }
      expect(result.version).toBe('jq-1.8.2');
    }
  });

  it('handles a 1 MB input inside the cap without dropping data', async () => {
    const rows = 20_000;
    const input = JSON.stringify(Array.from({ length: rows }, (_, i) => ({ i })));
    expect(input.length).toBeGreaterThan(150_000);
    const result = ok(await runJq('length', input));
    expect(result.outputs).toEqual([String(rows)]);
  });

  it('accepts a non-string program/options without throwing', async () => {
    // The playground always passes strings, but a hand-edited deep link is
    // attacker-controlled input that arrives through the same door.
    const hostile = await runJq(undefined as unknown as string, OBJ);
    expect(hostile.ok).toBe(false);
    const badOptions = await runJq('.', OBJ, { tabWidth: 'x' as unknown as number });
    expect(badOptions.ok).toBe(true);
  });

  it('flags unbounded generators without refusing them', () => {
    expect(unboundedRiskHint('[limit(3;repeat("x"))]')).toBeNull();
    expect(unboundedRiskHint('.items[].name')).toBeNull();
    expect(unboundedRiskHint('recurse(.children[])')).toBeNull();
    expect(unboundedRiskHint('recurse(.children[]?)')).toBeNull();
    expect(unboundedRiskHint('[recurse(if . < 3 then . + 1 else empty end)]')).toBeNull();
    expect(unboundedRiskHint('..|numbers')).toBeNull();
    const hint = unboundedRiskHint('repeat(.+1)');
    expect(hint).toBe(
      'This program can generate an unbounded stream (repeat/range(infinite)). jq runs ' +
        'synchronously in this tab, so a filter that never ends will freeze the page until you ' +
        'reload — wrap it in limit(n; …) or first(…).',
    );
    expect(unboundedRiskHint('[range(infinite)]')).toBe(hint);
  });

  it('flags recurse(.field) — the shape that recurses on null for ever', () => {
    // REGRESSION: this hint used to promise flatly that "jq will exhaust its
    // memory and abort". MEASURED on jq 1.8.2: only a COLLECTED stream aborts
    // (`[repeat(1)]` ~1.7 s); a bare streaming `repeat(1)`/`recurse(.a)` was
    // still running after 40 s in node and blocks the tab until reload. The
    // hint must describe both outcomes.
    const hint =
      'recurse(.field) keeps recursing after it reaches the end: .field on the last node is ' +
      'null, and null.field is null again, forever — adding ? does not stop it. Collected ' +
      '([…], length, last) it exhausts jq’s memory and aborts after a second or two; left ' +
      'streaming it freezes this tab until you reload. Write recurse(.field?; . != null) instead.';
    expect(unboundedRiskHint('[recurse(.next) | .id]')).toBe(hint);
    expect(unboundedRiskHint('[recurse(.next?) | .id]')).toBe(hint);
    expect(unboundedRiskHint('[recurse(.a.b)]')).toBe(hint);
    // Two-argument recurse is the fix, not the trap.
    expect(unboundedRiskHint('[recurse(.next?; . != null) | .id]')).toBeNull();
  });

  it('the advice in that hint actually works on real jq', async () => {
    const linked = '{"id":1,"next":{"id":2,"next":{"id":3}}}';
    const fixed = ok(await runJq('[recurse(.next?; . != null) | .id]', linked, { compact: true }));
    expect(fixed.outputs).toEqual(['[1,2,3]']);
  });

  it('an aborting filter returns an engine error and leaves jq usable', async () => {
    // `[repeat(1)]` exhausts jq's WebAssembly heap; Emscripten calls abort(),
    // which THROWS out of jq.raw(). Verified: ~0.8s, and the module recovers.
    // This is the tab's real protection against a non-terminating filter, so it
    // must degrade into a diagnostic rather than an unhandled rejection.
    const result = err(await runJq('[repeat(1)]', 'null'));
    expect(result.errorKind).toBe('engine');
    expect(result.error).toMatch(/^jq aborted this run after [\d,]+ ms: it ran out of memory\./);
    expect(result.error).toContain('recurse(.field?; . != null)');
    // And the very next run still works — the memo was reset, not poisoned.
    expect(ok(await runJq('.a', '{"a":1}')).outputs).toEqual(['1']);
  }, 30_000);
});

/**
 * Every factual claim the tool PAGE makes about jq is pinned here. A page that
 * asserts something jq does not do would be exactly the confidently-wrong
 * answer this site exists to replace, and page copy has no other test.
 */
describe('claims the tool page makes', () => {
  it('jq 1.8.2 round-trips an integer JavaScript cannot hold exactly', async () => {
    // The reference table and the gap section both lean on this.
    expect(ok(await runJq('.n', '{"n":9007199254740993}')).outputs).toEqual(['9007199254740993']);
    expect(ok(await runJq('.', '{"n":9007199254740993}', { compact: true })).outputs).toEqual([
      '{"n":9007199254740993}',
    ]);
  });

  it('…but arithmetic on it drops to a double, and the page says so', async () => {
    expect(ok(await runJq('.n + 0', '{"n":9007199254740993}')).outputs).toEqual([
      '9007199254740992',
    ]);
    expect(ok(await runJq('9007199254740993 + 1', 'null')).outputs).toEqual(['9007199254740992']);
  });

  it('jq preserves the literal spelling of untouched numbers', async () => {
    expect(ok(await runJq('.n', '{"n":1.0}')).outputs).toEqual(['1.0']);
    expect(ok(await runJq('.n + 0', '{"n":1.0}')).outputs).toEqual(['1']);
    expect(ok(await runJq('.n', '{"n":1e2}')).outputs).toEqual(['1E+2']);
  });

  it('leaf_paths does NOT exist in jq 1.8.2 (the FAQ’s example of an invented builtin)', async () => {
    const result = err(await runJq('[leaf_paths]', '{"a":{"b":1}}'));
    expect(result.errorKind).toBe('compile');
    expect(result.error).toBe('leaf_paths/0 is not defined');
    // The replacement the FAQ recommends does work.
    expect(ok(await runJq('[paths(scalars)]', '{"a":{"b":1}}', { compact: true })).outputs).toEqual([
      '[["a","b"]]',
    ]);
  });

  it('keys sorts and keys_unsorted does not — the reference table’s row', async () => {
    expect(ok(await runJq('keys', '{"b":1,"a":2}', { compact: true })).outputs).toEqual(['["a","b"]']);
    expect(ok(await runJq('keys_unsorted', '{"b":1,"a":2}', { compact: true })).outputs).toEqual([
      '["b","a"]',
    ]);
  });

  it('// falls through on null and false but NOT on 0 or ""', async () => {
    expect(ok(await runJq('.a // "fallback"', '{"a":null}')).outputs).toEqual(['"fallback"']);
    expect(ok(await runJq('.a // "fallback"', '{"a":false}')).outputs).toEqual(['"fallback"']);
    expect(ok(await runJq('.a // "fallback"', '{"a":0}')).outputs).toEqual(['0']);
    expect(ok(await runJq('.a // "fallback"', '{"a":""}')).outputs).toEqual(['""']);
  });

  it('ascii_upcase only touches ASCII, exactly as the table says', async () => {
    expect(ok(await runJq('ascii_upcase', '"héllo"', { rawOutput: true })).outputs).toEqual([
      'HéLLO',
    ]);
  });

  it('@csv quotes strings and leaves numbers bare; @tsv uses a real tab', async () => {
    expect(ok(await runJq('@csv', '["web",3]', { rawOutput: true })).outputs).toEqual(['"web",3']);
    expect(ok(await runJq('@tsv', '["web",3]', { rawOutput: true })).outputs).toEqual(['web\t3']);
  });

  it('the -s / -n pair on the page produce what the page shows', async () => {
    expect(ok(await runJq('.', '1 2 3', { slurp: true, compact: true })).outputs).toEqual([
      '[1,2,3]',
    ]);
    expect(ok(await runJq('[inputs]', '1 2 3', { nullInput: true, compact: true })).outputs).toEqual(
      ['[1,2,3]'],
    );
  });

  it('length counts code points for strings and keys for objects', async () => {
    expect(ok(await runJq('length', '"héllo"')).outputs).toEqual(['5']);
    expect(ok(await runJq('length', '{"a":1,"b":2}')).outputs).toEqual(['2']);
  });
});

describe('#q= deep link', () => {
  const state = {
    program: '.items[] | .metadata.name',
    input: '{"items":[{"metadata":{"name":"web"}}]}',
    flags: { rawOutput: true, slurp: false, nullInput: false, compact: true },
  };

  it('round-trips program, input and all four flags', () => {
    const fragment = encodeState(state);
    expect(fragment.startsWith('#q=')).toBe(true);
    expect(decodeState(fragment)).toEqual(state);
  });

  it('round-trips multi-line programs and unicode input', () => {
    const tricky = {
      program: '.a\n  | select(.b == "café 🌍")\n  | @csv',
      input: '{"a":{"b":"café 🌍"}}',
      flags: { rawOutput: false, slurp: true, nullInput: true, compact: false },
    };
    expect(decodeState(encodeState(tricky))).toEqual(tricky);
  });

  it('treats a hand-written fragment as a PROGRAM with no input', () => {
    // `#q=.foo(` is what a typo or a shared-by-hand link looks like. The honest
    // degradation is "this is a program"; inventing an input would be a lie.
    const decoded = decodeState('#q=.foo(');
    expect(decoded).toEqual({
      program: '.foo(',
      input: null,
      flags: { rawOutput: false, slurp: false, nullInput: false, compact: false },
    });
  });

  it('percent-decodes a hand-written fragment', () => {
    expect(decodeState('#q=.a%20%7C%20.b')?.program).toBe('.a | .b');
  });

  it('keeps a fragment with a broken percent escape verbatim', () => {
    expect(decodeState('#q=.a%ZZ')?.program).toBe('.a%ZZ');
  });

  it('returns null for no fragment, another tool’s fragment, or an empty one', () => {
    expect(decodeState('')).toBeNull();
    expect(decodeState('#')).toBeNull();
    expect(decodeState('#s=abc')).toBeNull();
    expect(decodeState('#q=')).toBeNull();
    expect(decodeState('#q=%20%20')).toBeNull();
  });

  it('reads a payload that is not first in the fragment', () => {
    expect(decodeState('#x=1&q=' + encodeState(state).slice(3))?.program).toBe(state.program);
  });

  it('never throws on hostile fragments', () => {
    const hostile = [
      '#q=' + '%'.repeat(50),
      '#q=' + 'A'.repeat(5000),
      '#q=eyJwIjo',
      '#q=' + encodeURIComponent('{"p":123,"i":{},"f":9}'),
      '#q=null',
      '#q=[]',
      '#q= ',
    ];
    for (const fragment of hostile) {
      expect(() => decodeState(fragment)).not.toThrow();
    }
  });

  it('ignores a payload whose program is not a string', () => {
    // A base64url JSON payload with the wrong shape must not become
    // `program: "[object Object]"`.
    const wire = Buffer.from(JSON.stringify({ p: { evil: 1 }, i: 'x', f: '' }), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const decoded = decodeState('#q=' + wire);
    // Falls through to the raw-text reading, which is a program string.
    expect(typeof decoded?.program).toBe('string');
    expect(decoded?.input).toBeNull();
  });
});

describe('bundled examples', () => {
  it('ships exactly the six chips the plan specifies', () => {
    expect(examples).toHaveLength(6);
    const ids = examples.map((e) => e.id);
    expect(new Set(ids).size).toBe(6);
    for (const example of examples) {
      expect(example.label.length).toBeGreaterThan(0);
      expect(example.program.trim().length).toBeGreaterThan(0);
      expect(example.input.trim().length).toBeGreaterThan(0);
    }
  });

  it('every example is valid JSON input and runs clean on real jq', async () => {
    for (const example of examples) {
      expect(() => JSON.parse(example.input), `${example.id} input`).not.toThrow();
      const result = await runJq(example.program, example.input, example.flags);
      expect(result.ok, `${example.id}: ${result.ok ? '' : result.error}`).toBe(true);
      expect(ok(result).outputs.length, `${example.id} produced no output`).toBeGreaterThan(0);
    }
  });

  it('the first example is a top-level OBJECT, so a half-typed .field cannot error', async () => {
    // The boot seed is example 1 and the calm-error contract depends on it:
    // `.f` against an ARRAY is a runtime error, which would flash red while
    // someone types `.foo`. Against an object it is simply `null`.
    const parsed = JSON.parse(examples[0].input) as unknown;
    expect(Array.isArray(parsed)).toBe(false);
    expect(typeof parsed).toBe('object');
    for (const partial of ['.', '.f', '.fo', '.foo']) {
      const result = await runJq(partial, examples[0].input, examples[0].flags);
      expect(result.ok, `${partial} must not error against example 1`).toBe(true);
    }
  });

  it('every example fits the playground’s 2000-char deep-link cap, with headroom', () => {
    // The playground hides the share button and skips the hash write past 2000
    // chars, and J3 asserts that tapping chip 2 DOES write one. An example whose
    // own fragment overflows the cap would break that silently, so the budget is
    // pinned here with slack for the base64 expansion.
    for (const example of examples) {
      const length = encodeState({
        program: example.program,
        input: example.input,
        flags: example.flags,
      }).length;
      expect(length, `${example.id} fragment is ${length} chars`).toBeLessThanOrEqual(1800);
    }
  });

  it('example 1 renders the string the E2E fixture pins', async () => {
    const result = ok(await runJq(examples[0].program, examples[0].input, examples[0].flags));
    expect(result.outputText).toContain('web-7d9f8c-2xk4t');
  });

  it('the @csv example needs -r, and says so through its own flags', async () => {
    const csv = examples.find((e) => e.id === 'csv-report');
    expect(csv?.flags.rawOutput).toBe(true);
    const result = ok(await runJq(csv!.program, csv!.input, csv!.flags));
    // -r is the whole difference between a CSV line and a JSON string that
    // happens to contain one, so pin the escaping, not just the row text.
    expect(result.outputs[0]).toBe('"web",3,"nginx:1.27-alpine"');
    const quoted = ok(await runJq(csv!.program, csv!.input, { ...csv!.flags, rawOutput: false }));
    expect(quoted.outputs[0]).toBe('"\\"web\\",3,\\"nginx:1.27-alpine\\""');
  });
});

/**
 * JSON ↔ YAML Converter — pinned conformance vectors.
 *
 * Three milestones, in the order the plan prescribes:
 *   1. Happy paths (both directions, indent, sortKeys, detection, stats).
 *   2. The 24 pinned vectors — every semantic trap the tool exists to expose,
 *      each asserting the OUTPUT and (where the tool's whole value is the
 *      honesty) the DIAGNOSTIC WORDING byte-for-byte.
 *   3. Never-throws fuzz + `#s=` hash round-trip.
 *
 * The diagnostic strings below are the product, not an implementation detail:
 * the tool's differentiator is that it names what changed. Changing a message
 * here is a user-visible change and must be deliberate.
 */
import { describe, expect, it } from 'vitest';
import {
  convert,
  detectFormat,
  encodeState,
  decodeState,
  YAML_SEMANTICS,
} from './engine';
import { examples } from './examples';
import type { ConvertResult, Diagnostic, ShareState } from './types';

/* ────────────────────────────────────────────────────────────────────────── *
 *  Helpers
 * ────────────────────────────────────────────────────────────────────────── */

const y2j = (input: string, opts: { indent?: 2 | 4; sortKeys?: boolean } = {}): ConvertResult =>
  convert(input, { direction: 'yaml-to-json', ...opts });

const j2y = (input: string, opts: { indent?: 2 | 4; sortKeys?: boolean } = {}): ConvertResult =>
  convert(input, { direction: 'json-to-yaml', ...opts });

/** Every diagnostic message joined — for "does the report mention X" assertions. */
const said = (r: ConvertResult): string => r.diagnostics.map((d) => d.message).join('\n');

const byId = (r: ConvertResult, id: string): Diagnostic | undefined =>
  r.diagnostics.find((d) => d.id === id);

const ids = (r: ConvertResult): string[] => r.diagnostics.map((d) => d.id);

/* ────────────────────────────────────────────────────────────────────────── *
 *  Milestone 1 — happy paths
 * ────────────────────────────────────────────────────────────────────────── */

describe('milestone 1 — happy paths', () => {
  it('converts YAML to JSON with 2-space indent by default', () => {
    const r = y2j('name: web\nreplicas: 3\n');
    expect(r.ok).toBe(true);
    expect(r.output).toBe('{\n  "name": "web",\n  "replicas": 3\n}');
    expect(r.direction).toBe('yaml-to-json');
    expect(r.detected).toBe('yaml');
  });

  it('converts JSON to YAML', () => {
    const r = j2y('{"name":"web","replicas":3}');
    expect(r.ok).toBe(true);
    expect(r.output).toBe('name: web\nreplicas: 3\n');
    expect(r.detected).toBe('json');
  });

  it('honours indent 4 in both directions', () => {
    expect(y2j('a:\n  b: 1\n', { indent: 4 }).output).toBe('{\n    "a": {\n        "b": 1\n    }\n}');
    expect(j2y('{"a":{"b":{"c":[1,2]}}}', { indent: 4 }).output).toBe(
      'a:\n    b:\n        c:\n            - 1\n            - 2\n',
    );
  });

  it('reports doc / key / depth stats', () => {
    const r = y2j('a: 1\nb:\n  c: 2\n');
    expect(r.stats).toEqual({ docs: 1, keys: 3, depth: 2 });
    expect(y2j('- 1\n- 2\n').stats).toEqual({ docs: 1, keys: 0, depth: 1 });
    expect(y2j('hello\n').stats).toEqual({ docs: 1, keys: 0, depth: 0 });
  });

  it('detects format without converting', () => {
    expect(detectFormat('{"a":1}')).toBe('json');
    expect(detectFormat('  [1, 2]  ')).toBe('json');
    expect(detectFormat('a: 1')).toBe('yaml');
    expect(detectFormat('- 1\n- 2')).toBe('yaml');
    // Valid as both — never guess.
    expect(detectFormat('123')).toBe('ambiguous');
    expect(detectFormat('true')).toBe('ambiguous');
    expect(detectFormat('')).toBe('ambiguous');
    expect(detectFormat('   \n ')).toBe('ambiguous');
    // Broken JSON still reads as JSON *intent* — that drives the direction hint.
    expect(detectFormat('{"a": 1,}')).toBe('json');
  });

  it('exports the parser identity it is pinned to', () => {
    expect(YAML_SEMANTICS).toContain('YAML 1.2');
  });

  it('ships six examples that all convert cleanly in their own direction', () => {
    expect(examples).toHaveLength(6);
    for (const ex of examples) {
      const r = convert(ex.input, { direction: ex.direction });
      expect(r.ok, `${ex.id} should convert`).toBe(true);
      expect(r.output.length, `${ex.id} should produce output`).toBeGreaterThan(0);
    }
  });

  it('seeds the first example as a Kubernetes Deployment → JSON', () => {
    const first = examples[0];
    expect(first.direction).toBe('yaml-to-json');
    const r = convert(first.input, { direction: first.direction });
    expect(r.output).toContain('"replicas": 3');
  });

  it('treats empty input as nothing to do, without a diagnostic', () => {
    for (const empty of ['', '   ', '\n\n', '\t']) {
      const r = y2j(empty);
      expect(r.ok).toBe(false);
      expect(r.output).toBe('');
      expect(r.diagnostics).toEqual([]);
      expect(r.stats).toEqual({ docs: 0, keys: 0, depth: 0 });
    }
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 *  Milestone 2 — the 24 pinned vectors
 * ────────────────────────────────────────────────────────────────────────── */

describe('milestone 2 — pinned vectors', () => {
  /* V1 ------------------------------------------------------------------ */
  it('V1 Norway problem, YAML → JSON: `no` stays a string and says so', () => {
    const r = y2j('debug: no\n');
    expect(r.ok).toBe(true);
    expect(r.output).toBe('{\n  "debug": "no"\n}');
    const d = byId(r, 'yaml-1-1-bool-lookalike');
    expect(d?.severity).toBe('note');
    expect(d?.line).toBe(1);
    expect(d?.message).toBe(
      'Line 1: "no" stayed the string "no". This parser follows YAML 1.2, where only ' +
        'true/false are booleans — YAML 1.1 tools (PyYAML, Ruby Psych, older Kubernetes ' +
        'tooling) read it as false. This is the "Norway problem".',
    );
  });

  /* V2 ------------------------------------------------------------------ */
  it('V2 Norway problem, JSON → YAML: "NO" is emitted quoted for PyYAML safety', () => {
    const r = j2y('{"country": "NO"}');
    expect(r.ok).toBe(true);
    expect(r.output).toBe("country: 'NO'\n");
    const d = byId(r, 'yaml-1-1-bool-lookalike');
    expect(d?.severity).toBe('note');
    expect(d?.message).toBe(
      'The string "NO" was quoted as \'NO\' in the output. Left unquoted, YAML 1.1 tools ' +
        '(PyYAML) would read it as the boolean false — this is the "Norway problem".',
    );
  });

  /* V3 ------------------------------------------------------------------ */
  it('V3 anchors and aliases are expanded, and the loss is reported', () => {
    const r = y2j('base: &b {x: 1}\nuse: *b\n');
    expect(r.ok).toBe(true);
    expect(JSON.parse(r.output)).toEqual({ base: { x: 1 }, use: { x: 1 } });
    expect(byId(r, 'anchors-expanded')?.message).toBe(
      'YAML anchors and aliases were expanded in place. JSON has no anchor syntax, so each ' +
        'alias became a full copy of the anchored value.',
    );
  });

  /* V4 ------------------------------------------------------------------ */
  it('V4 a recursive alias is caught as a cycle, never as a thrown TypeError', () => {
    const r = y2j('a: &x {self: *x}\n');
    expect(r.ok).toBe(false);
    expect(r.output).toBe('');
    const d = byId(r, 'cycle');
    expect(d?.severity).toBe('error');
    expect(d?.path).toBe('$.a.self');
    expect(d?.message).toBe(
      'Recursive alias: the value at $.a.self points back to a node that contains it. JSON ' +
        'cannot represent a cycle, so there is nothing to write.',
    );
  });

  /* V5 ------------------------------------------------------------------ */
  it('V5 merge keys are expanded, with a note', () => {
    const r = y2j('defaults: &d\n  retries: 3\njob:\n  <<: *d\n  name: build\n');
    expect(r.ok).toBe(true);
    expect(JSON.parse(r.output)).toEqual({
      defaults: { retries: 3 },
      job: { retries: 3, name: 'build' },
    });
    expect(byId(r, 'merge-keys-expanded')?.message).toBe(
      'A merge key (<<:) was expanded into the mapping that used it. JSON has no merge key, ' +
        'so the inherited keys are written out in full.',
    );
  });

  /* V6 ------------------------------------------------------------------ */
  it('V6 an unquoted date becomes an ISO-8601 string, with a note', () => {
    const r = y2j('created: 2024-01-15\n');
    expect(r.ok).toBe(true);
    expect(r.output).toBe('{\n  "created": "2024-01-15T00:00:00.000Z"\n}');
    const d = byId(r, 'timestamp-to-string');
    expect(d?.path).toBe('$.created');
    expect(d?.message).toBe(
      'The timestamp at $.created was written as the ISO-8601 string ' +
        '"2024-01-15T00:00:00.000Z" — JSON has no date type. Quote it in the YAML to keep ' +
        'the original text.',
    );
  });

  /* V7 ------------------------------------------------------------------ */
  it('V7 a duplicated mapping key is a line-numbered error', () => {
    const r = y2j('a: 1\nb: 2\na: 3\n');
    expect(r.ok).toBe(false);
    const d = byId(r, 'yaml-duplicate-key');
    expect(d?.severity).toBe('error');
    expect(d?.line).toBe(3);
    expect(d?.column).toBe(1);
    expect(d?.message).toBe(
      'Duplicated mapping key at line 3, column 1. YAML rejects a key that already exists in ' +
        'the same mapping.',
    );
  });

  /* V8 ------------------------------------------------------------------ */
  it('V8 a multi-document stream becomes a JSON array, with a note', () => {
    const r = y2j('a: 1\n---\nb: 2\n');
    expect(r.ok).toBe(true);
    expect(r.output).toBe('[\n  {\n    "a": 1\n  },\n  {\n    "b": 2\n  }\n]');
    expect(r.stats.docs).toBe(2);
    expect(byId(r, 'multi-document')?.message).toBe(
      'This YAML stream holds 2 documents. JSON has no multi-document form, so they were ' +
        'written as a top-level array of 2 items.',
    );
  });

  /* V9 ------------------------------------------------------------------ */
  it('V9 comment loss is reported — and a `#` inside quotes is not a comment', () => {
    const withComments = y2j('# top note\na: 1 # trailing\n');
    expect(withComments.ok).toBe(true);
    expect(byId(withComments, 'comments-dropped')?.message).toBe(
      'Comments were dropped. YAML comments have no JSON equivalent, and this converter does ' +
        'not restore them on the way back either.',
    );
    // Accepted heuristic limit, asserted in the safe direction: a `#` inside a
    // quoted scalar must NOT be mistaken for a comment.
    const quotedHash = y2j('a: "# not a comment"\n');
    expect(quotedHash.ok).toBe(true);
    expect(ids(quotedHash)).not.toContain('comments-dropped');
  });

  /* V10 ----------------------------------------------------------------- */
  it('V10 integer-like keys are reordered by JavaScript, and it is documented', () => {
    const r = j2y('{"2":"b","1":"a","name":"x"}');
    expect(r.ok).toBe(true);
    expect(r.output).toBe("'1': a\n'2': b\nname: x\n");
    expect(byId(r, 'integer-like-keys-reordered')?.severity).toBe('warning');
    expect(byId(r, 'integer-like-keys-reordered')?.message).toBe(
      'Integer-like keys ("1", "2") are always enumerated first, in ascending numeric order, ' +
        'whatever order they were written in — a JavaScript object rule this converter cannot ' +
        'work around. Use a non-numeric prefix, or a sequence, if the order matters.',
    );
    // No integer-like keys ⇒ no note. The warning must not fire on every object.
    expect(ids(j2y('{"b":1,"a":2}'))).not.toContain('integer-like-keys-reordered');
  });

  /* V11 ----------------------------------------------------------------- */
  it('V11 a string with newlines is emitted as a block literal', () => {
    const r = j2y('{"script":"line1\\nline2"}');
    expect(r.ok).toBe(true);
    expect(r.output).toBe('script: |-\n  line1\n  line2\n');
  });

  /* V12 ----------------------------------------------------------------- */
  it('V12 long scalars are never folded (lineWidth -1)', () => {
    const long = 'a'.repeat(140);
    const r = j2y(JSON.stringify({ s: long }));
    expect(r.ok).toBe(true);
    expect(r.output).toBe(`s: ${long}\n`);
    expect(r.output).not.toContain('>-');
    expect(r.output.split('\n').filter((l) => l.length > 0)).toHaveLength(1);
  });

  /* V13 ----------------------------------------------------------------- */
  it('V13 an integer past 2^53-1 is rounded, and warned about, in both directions', () => {
    const fromYaml = y2j('n: 9007199254740993\n');
    expect(fromYaml.ok).toBe(true);
    expect(fromYaml.output).toBe('{\n  "n": 9007199254740992\n}');
    const d = byId(fromYaml, 'unsafe-integer');
    expect(d?.severity).toBe('warning');
    expect(d?.line).toBe(1);
    expect(d?.message).toBe(
      'Line 1: the integer 9007199254740993 is outside JavaScript\'s exact range ' +
        '(±(2^53 − 1)) and was rounded to 9007199254740992. Large integers cannot survive ' +
        'this conversion — keep them as quoted strings.',
    );

    const fromJson = j2y('{"id": 9007199254740993}');
    expect(fromJson.ok).toBe(true);
    expect(fromJson.output).toBe('id: 9007199254740992\n');
    expect(byId(fromJson, 'unsafe-integer')?.severity).toBe('warning');

    // A big number inside a STRING is untouched and must not warn.
    const quoted = j2y('{"id": "9007199254740993"}');
    expect(quoted.output).toBe("id: '9007199254740993'\n");
    expect(ids(quoted)).not.toContain('unsafe-integer');
  });

  it('V2b the Norway problem applies to KEYS too, and js-yaml quotes them', () => {
    // `n` is a YAML 1.1 boolean, so an unquoted `n:` key would come back as
    // `false:` from PyYAML. js-yaml quotes it on output; pinned because it is
    // easy to mistake for a converter bug.
    const r = j2y('{"n": 1, "on": 2}');
    expect(r.ok).toBe(true);
    expect(r.output).toBe("'n': 1\n'on': 2\n");
  });

  /* V14 ----------------------------------------------------------------- */
  it('V14 .inf / .nan become null, each with its own warning', () => {
    const r = y2j('a: .inf\nb: -.Inf\nc: .nan\n');
    expect(r.ok).toBe(true);
    expect(r.output).toBe('{\n  "a": null,\n  "b": null,\n  "c": null\n}');
    const warns = r.diagnostics.filter((d) => d.id === 'non-finite-number');
    expect(warns).toHaveLength(3);
    expect(warns[0].severity).toBe('warning');
    expect(warns[0].message).toBe(
      'Infinity at $.a has no JSON representation and was written as null.',
    );
    expect(warns[1].message).toBe(
      '-Infinity at $.b has no JSON representation and was written as null.',
    );
    expect(warns[2].message).toBe('NaN at $.c has no JSON representation and was written as null.');
  });

  /* V15 ----------------------------------------------------------------- */
  it('V15 every YAML null spelling converts to JSON null', () => {
    const r = y2j('a: ~\nb: null\nc:\nd: Null\ne: NULL\n');
    expect(r.ok).toBe(true);
    expect(r.output).toBe(
      '{\n  "a": null,\n  "b": null,\n  "c": null,\n  "d": null,\n  "e": null\n}',
    );
  });

  /* V16 ----------------------------------------------------------------- */
  it('V16 a tab used for indentation is a specific error', () => {
    const r = y2j('a:\n\tb: 1\n');
    expect(r.ok).toBe(false);
    const d = byId(r, 'yaml-tab-indent');
    expect(d?.line).toBe(2);
    expect(d?.column).toBe(1);
    expect(d?.message).toBe(
      'Tab characters must not be used for indentation at line 2, column 1. YAML requires spaces.',
    );
  });

  /* V17 ----------------------------------------------------------------- */
  it('V17 a UTF-8 BOM is stripped in both directions, with a note', () => {
    const fromJson = j2y('\uFEFF{"a": 1}');
    expect(fromJson.ok).toBe(true);
    expect(fromJson.output).toBe('a: 1\n');
    expect(byId(fromJson, 'bom-removed')?.message).toBe(
      'A UTF-8 byte-order mark (BOM) was removed before parsing. JSON.parse rejects a ' +
        'leading BOM, so this file would fail in most tools until it is re-saved without one.',
    );
    const fromYaml = y2j('\uFEFFa: 1\n');
    expect(fromYaml.ok).toBe(true);
    expect(fromYaml.output).toBe('{\n  "a": 1\n}');
    expect(ids(fromYaml)).toContain('bom-removed');
  });

  /* V18 ----------------------------------------------------------------- */
  it('V18 a lone document marker is a valid null document', () => {
    const r = y2j('---\n');
    expect(r.ok).toBe(true);
    expect(r.output).toBe('null');
    expect(r.stats.docs).toBe(1);
  });

  /* V19 ----------------------------------------------------------------- */
  it('V19 0o777 / 0x1F are YAML 1.2 ints; a leading-zero number warns about 1.1 octal', () => {
    const r = y2j('mode: 0o777\nmask: 0x1F\nlegacy: 0777\n');
    expect(r.ok).toBe(true);
    expect(r.output).toBe('{\n  "mode": 511,\n  "mask": 31,\n  "legacy": 777\n}');
    const d = byId(r, 'yaml-1-1-octal-lookalike');
    expect(d?.line).toBe(3);
    expect(d?.message).toBe(
      'Line 3: 0777 is the decimal number 777 in YAML 1.2. YAML 1.1 tools (PyYAML) read a ' +
        'leading zero as octal and would give 511 — write 0o777 to be unambiguous.',
    );
  });

  /* V20 ----------------------------------------------------------------- */
  it('V20 an unknown !Ref tag produces a CloudFormation-aware error', () => {
    const r = y2j('Resources:\n  MyBucket:\n    Properties:\n      Name: !Ref BucketName');
    expect(r.ok).toBe(false);
    const d = byId(r, 'yaml-unknown-tag');
    expect(d?.severity).toBe('error');
    expect(d?.line).toBe(4);
    expect(d?.column).toBe(28);
    expect(d?.message).toBe(
      'Unknown YAML tag "!Ref" at line 4, column 28. This looks like an AWS CloudFormation ' +
        'template — !Ref, !GetAtt and !Sub are CloudFormation shorthand, not standard YAML ' +
        'tags. Rewrite them in their long form (Ref: BucketName instead of !Ref BucketName) ' +
        'to convert this file.',
    );

    // A non-CloudFormation unknown tag gets the plain message.
    const other = y2j('a: !Weird 1\n');
    expect(byId(other, 'yaml-unknown-tag')?.message).toBe(
      'Unknown YAML tag "!Weird" at line 1, column 12. This converter uses the standard ' +
        'YAML 1.2 schema and has no constructor for custom tags.',
    );
  });

  /* V21 ----------------------------------------------------------------- */
  it('V21 a JSON trailing / repeated comma reports a computed line and column', () => {
    const repeated = j2y('{"a": 1,,}');
    expect(repeated.ok).toBe(false);
    const d = byId(repeated, 'json-parse-error');
    expect(d?.line).toBe(1);
    expect(d?.column).toBe(9);
    expect(d?.message).toBe(
      'Unexpected "," at line 1, column 9. JSON does not allow trailing or repeated commas.',
    );

    expect(byId(j2y('{"a": 1,}'), 'json-parse-error')?.message).toBe(
      'Unexpected "," at line 1, column 8. JSON does not allow trailing or repeated commas.',
    );

    // Multi-line: the column is relative to the start of its own line.
    const multi = byId(j2y('{\n  "a": 1,\n}'), 'json-parse-error');
    expect(multi?.line).toBe(2);
    expect(multi?.column).toBe(9);
  });

  /* V22 ----------------------------------------------------------------- */
  it('V22 number-like and bool-like strings are quoted on the way out', () => {
    const r = j2y('{"version":"1.0","code":"007","flag":"true"}');
    expect(r.ok).toBe(true);
    expect(r.output).toBe("version: '1.0'\ncode: '007'\nflag: 'true'\n");
    expect(byId(r, 'yaml-quoted-to-stay-string')?.message).toBe(
      'Quoted 3 values in the output (\'1.0\', \'007\', \'true\') so they stay strings — ' +
        'unquoted, a YAML parser would re-read them as numbers, booleans or null.',
    );
  });

  /* V23 ----------------------------------------------------------------- */
  it('V23 JSON pasted in the YAML → JSON direction still converts (YAML is a superset)', () => {
    const r = y2j('{"a": 1, "b": [1, 2]}');
    expect(r.ok).toBe(true);
    expect(r.output).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
    expect(r.detected).toBe('json');
    expect(byId(r, 'input-already-json')?.message).toBe(
      'This input is already JSON, and JSON is a subset of YAML 1.2 — the YAML parser read ' +
        'it as-is and only re-formatted it. Switch the direction to turn it into YAML.',
    );
  });

  /* V24 ----------------------------------------------------------------- */
  it('V24 sortKeys sorts every level, stably, in both directions', () => {
    const deep = j2y('{"b":{"z":1,"a":2},"a":{"y":1,"c":2}}', { sortKeys: true });
    expect(deep.ok).toBe(true);
    expect(deep.output).toBe("a:\n  c: 2\n  'y': 1\nb:\n  a: 2\n  z: 1\n");
    // Stability: sorting an already-sorted document is a fixed point.
    const again = convert(deep.output, { direction: 'yaml-to-json', sortKeys: true });
    expect(again.ok).toBe(true);
    expect(convert(again.output, { direction: 'json-to-yaml', sortKeys: true }).output).toBe(
      deep.output,
    );

    const toJson = y2j('b:\n  z: 1\n  a: 2\na: 1\n', { sortKeys: true });
    expect(toJson.output).toBe('{\n  "a": 1,\n  "b": {\n    "a": 2,\n    "z": 1\n  }\n}');

    // Off by default: key order is preserved.
    expect(y2j('b: 1\na: 2\n').output).toBe('{\n  "b": 1,\n  "a": 2\n}');
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 *  Direction hints — the "never auto-switch, but do say so" behaviour
 * ────────────────────────────────────────────────────────────────────────── */

describe('direction hints', () => {
  it('YAML pasted in the JSON → YAML direction gets a switch-direction hint', () => {
    const r = j2y('replicas: 3\n');
    expect(r.ok).toBe(false);
    expect(said(r)).toContain('This looks like YAML, not JSON — switch the direction to convert it.');
  });

  it('never silently switches direction', () => {
    const r = j2y('replicas: 3\n');
    expect(r.direction).toBe('json-to-yaml');
    expect(r.output).toBe('');
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 *  Milestone 3 — never-throws fuzz
 * ────────────────────────────────────────────────────────────────────────── */

describe('milestone 3 — never throws', () => {
  const GARBAGE: string[] = [
    '',
    ' ',
    '\n',
    '\u0000',
    '\uFEFF',
    '\uD800', // lone high surrogate
    '\uDFFF', // lone low surrogate
    'null',
    'undefined',
    '{',
    '}',
    '[',
    ']',
    '{{{{{{{{{{',
    '[[[[[[[[[[',
    '"',
    "'",
    '\\',
    '---',
    '--- ---',
    '\t\t\t',
    '- - - -',
    'a: b: c: d',
    'a:\n- b\n  - c',
    '!!!!',
    '&&&',
    '***',
    '<<: *nope',
    '%YAML 1.3\n---\na: 1',
    '?: :',
    'a: !!binary "notbase64!!"',
    '\x1b[31mred\x1b[0m',
    '{"a": {"b": {"c": {"d": {"e": {"f": 1}}}}}}',
    'a: &x\n  b: *x',
    '0'.repeat(400),
    '9'.repeat(400),
    'a'.repeat(5000),
    JSON.stringify({ k: '💥🌍 \u0000 \\ " \' < > &' }),
    '=',
    ':',
    '- ',
    'a: |',
    'a: >',
    'a: |\n\tb',
  ];

  it('never throws on garbage, in either direction, at any option combination', () => {
    for (const input of GARBAGE) {
      for (const direction of ['yaml-to-json', 'json-to-yaml'] as const) {
        for (const indent of [2, 4] as const) {
          for (const sortKeys of [false, true]) {
            expect(() =>
              convert(input, { direction, indent, sortKeys }),
            ).not.toThrow();
            const r = convert(input, { direction, indent, sortKeys });
            expect(typeof r.output).toBe('string');
            expect(Array.isArray(r.diagnostics)).toBe(true);
            // A failed conversion never emits output, and a successful one
            // always has a reason to exist.
            if (!r.ok) expect(r.output).toBe('');
          }
        }
      }
    }
  });

  it('never throws on hostile option values or a missing options object', () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    expect(() => convert('a: 1', { direction: 'nonsense' as any })).not.toThrow();
    expect(() => convert('a: 1', { direction: 'yaml-to-json', indent: 7 as any })).not.toThrow();
    expect(() => convert('a: 1', {} as any)).not.toThrow();
    expect(() => convert(undefined as any, { direction: 'yaml-to-json' })).not.toThrow();
    expect(() => convert(null as any, { direction: 'json-to-yaml' })).not.toThrow();
    expect(() => detectFormat(undefined as any)).not.toThrow();
    /* eslint-enable @typescript-eslint/no-explicit-any */
    // An out-of-range indent falls back to 2 rather than producing junk.
    expect(convert('a:\n  b: 1', { direction: 'yaml-to-json', indent: 7 as never }).output).toBe(
      '{\n  "a": {\n    "b": 1\n  }\n}',
    );
  });

  it('stays bounded on a large document', () => {
    const big = Array.from({ length: 4000 }, (_, i) => `key_${i}: value_${i}`).join('\n');
    const started = Date.now();
    const r = y2j(big);
    expect(r.ok).toBe(true);
    expect(r.stats.keys).toBe(4000);
    expect(Date.now() - started).toBeLessThan(4000);
  });

  it('caps repeated diagnostics instead of emitting one per line forever', () => {
    const many = Array.from({ length: 500 }, (_, i) => `k${i}: no`).join('\n');
    const r = y2j(many);
    expect(r.ok).toBe(true);
    const notes = r.diagnostics.filter((d) => d.id === 'yaml-1-1-bool-lookalike');
    expect(notes.length).toBeLessThanOrEqual(26);
    expect(said(r)).toContain('more of the same');
  });

  it('survives a deeply nested document without blowing the stack', () => {
    const depth = 400;
    const nested = '['.repeat(depth) + ']'.repeat(depth);
    expect(() => j2y(nested)).not.toThrow();
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 *  Milestone 3 — `#s=` hash round-trip
 * ────────────────────────────────────────────────────────────────────────── */

describe('milestone 3 — share state round-trip', () => {
  const state: ShareState = {
    direction: 'json-to-yaml',
    indent: 4,
    sortKeys: true,
    text: '{"a": "🌍 <b> & \\" \' ok"}',
  };

  it('encodes to a #s= fragment and decodes back exactly', () => {
    const hash = encodeState(state);
    expect(hash.startsWith('#s=')).toBe(true);
    // The PAYLOAD must be URL-safe base64: no +, / or = padding to be
    // re-escaped by a chat client or a proxy on the way to a colleague.
    expect(hash.slice('#s='.length)).not.toMatch(/[+/=]/);
    expect(decodeState(hash)).toEqual(state);
  });

  it('round-trips every direction / indent / sortKeys combination', () => {
    for (const direction of ['yaml-to-json', 'json-to-yaml'] as const) {
      for (const indent of [2, 4] as const) {
        for (const sortKeys of [false, true]) {
          const s: ShareState = { direction, indent, sortKeys, text: 'a: 1\n' };
          expect(decodeState(encodeState(s))).toEqual(s);
        }
      }
    }
  });

  it('returns null for an absent or unrelated fragment', () => {
    expect(decodeState('')).toBeNull();
    expect(decodeState('#')).toBeNull();
    expect(decodeState('#ip=10.0.0.0/8')).toBeNull();
    expect(decodeState('#s=')).toBeNull();
  });

  it('falls back to raw text for a hand-written #s= fragment', () => {
    // The E2E junk-hash journey builds exactly this: #s= + encodeURIComponent.
    const decoded = decodeState('#s=' + encodeURIComponent('key: !Ref Thing'));
    expect(decoded).not.toBeNull();
    expect(decoded?.text).toBe('key: !Ref Thing');
    expect(decoded?.direction).toBe('yaml-to-json');
    expect(decoded?.indent).toBe(2);
    expect(decoded?.sortKeys).toBe(false);
    // …and converting that raw payload yields the pinned calm-error string the
    // E2E fixture asserts.
    const r = convert(decoded!.text, { direction: decoded!.direction });
    expect(r.ok).toBe(false);
    expect(said(r)).toContain('Unknown YAML tag "!Ref"');
  });

  it('picks the JSON direction when a hand-written fragment holds JSON', () => {
    const decoded = decodeState('#s=' + encodeURIComponent('{"a": 1}'));
    expect(decoded?.direction).toBe('json-to-yaml');
    expect(decoded?.text).toBe('{"a": 1}');
  });

  it('never throws on a malformed fragment', () => {
    for (const bad of ['#s=!!!', '#s=%%%', '#s=' + 'A'.repeat(5000), '#s=e30', '#s=bnVsbA']) {
      expect(() => decodeState(bad)).not.toThrow();
    }
  });

  it('is SSR-safe when called with no argument outside a browser', () => {
    expect(() => decodeState()).not.toThrow();
  });
});

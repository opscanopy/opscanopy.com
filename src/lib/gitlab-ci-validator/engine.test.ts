/**
 * GitLab CI Validator — engine tests.
 *
 * These lock down the documented behaviour of the pure `validate()`:
 *   • A clean pipeline built from GitLab's own docs snippets produces ZERO errors.
 *   • Each documented misconfiguration is detected with the right rule id.
 *   • Empty / garbage / non-mapping input never throws and reports ok:false.
 *
 * The YAML snippets are real shapes from GitLab's `.gitlab-ci.yml` keyword
 * reference and "Get started with GitLab CI/CD" tutorial — no synthetic schemas.
 */
import { describe, it, expect } from 'vitest';
import { validate } from './engine';
import { examples } from './examples';
import type { Finding } from './types';

/** Convenience: collect the rule ids present in a result. */
function ids(findings: Finding[]): string[] {
  return findings.map((f) => f.id);
}

describe('validate() — clean pipelines (no errors)', () => {
  it('accepts a stages + jobs + needs + rules pipeline (GitLab tutorial shape)', () => {
    const r = validate(examples.find((e) => e.id === 'clean')!.yaml);
    expect(r.ok).toBe(true);
    expect(r.summary.errors).toBe(0);
    // No structural rule should fire on a well-formed pipeline.
    expect(ids(r.findings)).not.toContain('job-missing-script');
    expect(ids(r.findings)).not.toContain('stage-not-declared');
    expect(ids(r.findings)).not.toContain('needs-unknown-job');
  });

  it('accepts the extends + hidden .template DRY pattern', () => {
    const r = validate(examples.find((e) => e.id === 'extends')!.yaml);
    expect(r.ok).toBe(true);
    expect(r.summary.errors).toBe(0);
    expect(ids(r.findings)).not.toContain('extends-unknown-target');
  });

  it('treats the five default stages (.pre, build, test, deploy, .post) as valid without a stages: block', () => {
    const yaml = `build-job:
  stage: build
  script: echo build
deploy-job:
  stage: deploy
  script: echo deploy
cleanup:
  stage: .post
  script: echo done
`;
    const r = validate(yaml);
    expect(r.ok).toBe(true);
    expect(ids(r.findings)).not.toContain('stage-not-declared');
  });

  it('does not require a hidden .template to define a script', () => {
    const yaml = `.shared:
  image: alpine:latest
real-job:
  extends: .shared
  script: echo hi
`;
    const r = validate(yaml);
    expect(r.summary.errors).toBe(0);
  });
});

describe('validate() — detects misconfigurations', () => {
  it('flags a job whose stage is not declared in stages:', () => {
    const r = validate(examples.find((e) => e.id === 'undefined-stage')!.yaml);
    const f = r.findings.find((x) => x.id === 'stage-not-declared');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
    expect(f!.title).toContain('release');
  });

  it('flags a needs: entry pointing at a job that does not exist', () => {
    const r = validate(examples.find((e) => e.id === 'bad-needs')!.yaml);
    const f = r.findings.find((x) => x.id === 'needs-unknown-job');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
    expect(f!.title).toContain('compile');
  });

  it('flags an extends: target that is not defined', () => {
    const r = validate(examples.find((e) => e.id === 'bad-needs')!.yaml);
    const f = r.findings.find((x) => x.id === 'extends-unknown-target');
    expect(f).toBeDefined();
    expect(f!.title).toContain('.base');
  });

  it('flags a job with no script / run / trigger / extends', () => {
    const r = validate(examples.find((e) => e.id === 'no-script')!.yaml);
    const f = r.findings.find((x) => x.id === 'job-missing-script');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
    expect(f!.title).toContain('empty-job');
  });

  it('reports legacy only/except as info recommending rules', () => {
    const r = validate(examples.find((e) => e.id === 'no-script')!.yaml);
    const f = r.findings.find((x) => x.id === 'legacy-only-except');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('info');
  });

  it('flags an invalid when: value', () => {
    const r = validate(examples.find((e) => e.id === 'bad-when')!.yaml);
    const f = r.findings.find((x) => x.id === 'invalid-when');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
    expect(f!.title).toContain('sometimes');
  });

  it('accepts every documented when: value', () => {
    for (const when of ['on_success', 'on_failure', 'always', 'manual', 'delayed', 'never']) {
      const r = validate(`job:\n  script: echo hi\n  when: ${when}\n`);
      expect(ids(r.findings)).not.toContain('invalid-when');
    }
  });

  it('flags a rules: that is not a list', () => {
    const r = validate(examples.find((e) => e.id === 'bad-when')!.yaml);
    const f = r.findings.find((x) => x.id === 'rules-not-list');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
  });

  it('flags stages: that is not a list', () => {
    const r = validate(`stages: build\njob:\n  stage: build\n  script: echo hi\n`);
    expect(ids(r.findings)).toContain('stages-not-list');
  });

  it('flags an invalid image: shape (a list)', () => {
    const r = validate(`job:\n  image:\n    - node:20\n  script: echo hi\n`);
    expect(ids(r.findings)).toContain('invalid-image-shape');
  });

  it('accepts both string and { name: } image shapes', () => {
    const a = validate(`job:\n  image: node:20\n  script: echo hi\n`);
    expect(ids(a.findings)).not.toContain('invalid-image-shape');
    const b = validate(`job:\n  image:\n    name: node:20\n  script: echo hi\n`);
    expect(ids(b.findings)).not.toContain('invalid-image-shape');
  });

  it('flags a services: that is not a list', () => {
    const r = validate(`job:\n  services: postgres:16\n  script: echo hi\n`);
    expect(ids(r.findings)).toContain('invalid-services-shape');
  });

  it('accepts a valid services: list of strings and { name: } mappings', () => {
    const r = validate(`job:\n  services:\n    - postgres:16\n    - name: redis:7\n  script: echo hi\n`);
    expect(ids(r.findings)).not.toContain('invalid-services-shape');
    expect(ids(r.findings)).not.toContain('invalid-service-entry');
  });

  it('flags dependencies: pointing at a missing job', () => {
    const r = validate(
      `build:\n  stage: build\n  script: make\ntest:\n  stage: test\n  dependencies:\n    - nope\n  script: make test\n`,
    );
    expect(ids(r.findings)).toContain('dependencies-unknown-job');
  });

  it('warns when a top-level key looks like a misspelled keyword', () => {
    // "varables" is one deletion away from "variables".
    const r = validate(`varables:\n  FOO: bar\njob:\n  script: echo hi\n`);
    const f = r.findings.find((x) => x.id === 'misspelled-keyword');
    expect(f).toBeDefined();
    expect(f!.title).toContain('variables');
  });

  it('treats pages as a regular job that must have a script', () => {
    const r = validate(`pages:\n  stage: deploy\n`);
    const f = r.findings.find((x) => x.id === 'job-missing-script');
    expect(f).toBeDefined();
    expect(f!.title).toContain('pages');
  });

  it('attaches line numbers to findings where possible', () => {
    const r = validate(examples.find((e) => e.id === 'undefined-stage')!.yaml);
    const f = r.findings.find((x) => x.id === 'stage-not-declared');
    expect(typeof f!.line).toBe('number');
    expect(f!.line!).toBeGreaterThan(0);
  });

  // An empty `script:` (`[]` or `''`) is not an executable surface — GitLab
  // rejects it. The engine now treats it the same as a missing script.
  it('flags an empty list script (script: []) as missing-script', () => {
    const r = validate(`job:\n  script: []\n`);
    expect(ids(r.findings)).toContain('job-missing-script');
  });

  it('flags an empty string script (script: "") as missing-script', () => {
    const r = validate(`job:\n  script: ''\n`);
    expect(ids(r.findings)).toContain('job-missing-script');
  });

  it('flags a list script whose only entry is empty as missing-script', () => {
    const r = validate(`job:\n  script:\n    - ''\n`);
    expect(ids(r.findings)).toContain('job-missing-script');
  });

  it('still accepts a non-empty script list', () => {
    const r = validate(`job:\n  script:\n    - echo hi\n`);
    expect(ids(r.findings)).not.toContain('job-missing-script');
  });

  // A job that omits `stage:` runs in the implicit `test` stage. With a custom
  // stages list lacking `test`, GitLab errors "chosen stage test does not exist".
  it('flags a job that omits stage: when a custom stages list lacks test', () => {
    const r = validate(`stages:\n  - build\n  - deploy\njob:\n  script: echo hi\n`);
    const f = r.findings.find((x) => x.id === 'stage-not-declared');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
    expect(f!.title).toContain('test');
  });

  it('does not flag a job that omits stage: when no custom stages list is declared (test is a default)', () => {
    const r = validate(`job:\n  script: echo hi\n`);
    expect(ids(r.findings)).not.toContain('stage-not-declared');
  });

  it('does not flag an omitted stage: when the custom stages list includes test', () => {
    const r = validate(`stages:\n  - build\n  - test\njob:\n  script: echo hi\n`);
    expect(ids(r.findings)).not.toContain('stage-not-declared');
  });

  // nearestKeyword now only flags edit distance 1 and skips plural/singular
  // derivatives, so plausible valid job names are no longer false positives.
  it('does not flag valid plural/derivative job names as misspelled keywords', () => {
    for (const name of ['images', 'caches', 'variable', 'stage']) {
      const r = validate(`${name}:\n  script: echo hi\n`);
      expect(ids(r.findings)).not.toContain('misspelled-keyword');
    }
  });

  // Note: `scache` is edit distance 1 from `cache` (drop the leading `s`), and
  // is not a plural/singular pair, so under the prescribed distance-1 rule it
  // legitimately still flags. The distance-2 names (e.g. `varable2`) no longer do.
  it('no longer flags a distance-2 job name as a misspelled keyword', () => {
    const r = validate(`varable2:\n  script: echo hi\n`);
    expect(ids(r.findings)).not.toContain('misspelled-keyword');
  });

  it('still flags a true single-edit typo of a keyword', () => {
    const r = validate(`varables:\n  FOO: bar\njob:\n  script: echo hi\n`);
    const f = r.findings.find((x) => x.id === 'misspelled-keyword');
    expect(f).toBeDefined();
    expect(f!.title).toContain('variables');
  });

  // The global image-shape finding must point at the column-0 `image:` line,
  // not the first indented job-level `image:`.
  it('points a global invalid-image-shape finding at the global declaration line', () => {
    const r = validate(`job:\n  image: node:20\n  script: echo hi\nimage:\n  - bad\n`);
    const f = r.findings.find((x) => x.id === 'invalid-image-shape');
    expect(f).toBeDefined();
    expect(f!.line).toBe(4); // the column-0 `image:` line, not the job's line 2
  });
});

describe('validate() — never throws on bad input', () => {
  it('empty string → ok:false, no findings, no throw', () => {
    const r = validate('');
    expect(r.ok).toBe(false);
    expect(r.findings).toEqual([]);
    expect(r.summary).toEqual({ errors: 0, warnings: 0, infos: 0 });
  });

  it('whitespace-only → ok:false', () => {
    expect(validate('   \n  \t ').ok).toBe(false);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  it('non-string input → ok:false (defensive)', () => {
    expect(validate(undefined as unknown as string).ok).toBe(false);
    expect(validate(null as unknown as string).ok).toBe(false);
    expect(validate(42 as unknown as string).ok).toBe(false);
  });

  it('a scalar document (not a mapping) → ok:false with a helpful error', () => {
    const r = validate('just a string');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/mapping/i);
  });

  it('a YAML list document (not a mapping) → ok:false', () => {
    const r = validate('- one\n- two\n');
    expect(r.ok).toBe(false);
  });

  it('malformed YAML → ok:false with a parse error, no throw', () => {
    const r = validate('job:\n  script: [unterminated\n');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/parse|YAML/i);
  });

  it('a config with only global keywords / templates → no-jobs error, no throw', () => {
    const r = validate(`variables:\n  FOO: bar\n.template:\n  script: echo hi\n`);
    expect(r.ok).toBe(true);
    expect(ids(r.findings)).toContain('no-jobs');
  });

  it('every bundled example validates without throwing', () => {
    for (const ex of examples) {
      expect(() => validate(ex.yaml)).not.toThrow();
      expect(validate(ex.yaml).ok).toBe(true);
    }
  });
});

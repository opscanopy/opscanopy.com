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

/* ────────────────────────────────────────────────────────────────────────── *
 *  FALSE POSITIVES — valid GitLab CI that the validator used to cry wolf on.
 *
 *  Each block pins the false alarm (must be silent) AND the genuine
 *  true-positive case it must not weaken (must still fire).
 * ────────────────────────────────────────────────────────────────────────── */

describe('validate() — `run:` steps are an executable surface', () => {
  // GitLab's `run:` keyword takes a LIST OF STEP RECORDS, not strings, so the
  // old string-only check reported "job has no script" on a perfectly valid job.
  it('accepts a job whose only surface is `run:` steps', () => {
    const r = validate(`job:
  run:
    - name: build
      script: make
`);
    expect(r.ok).toBe(true);
    expect(ids(r.findings)).not.toContain('job-missing-script');
    expect(r.summary.errors).toBe(0);
  });

  it('accepts multi-step `run:` with the exec/script step shapes', () => {
    const r = validate(`job:
  run:
    - name: install
      script: npm ci
    - name: test
      exec:
        command: [npm, test]
`);
    expect(ids(r.findings)).not.toContain('job-missing-script');
  });

  // TRUE POSITIVE — the check must still fire.
  it('still flags a job with neither script nor run', () => {
    const r = validate(`job:\n  stage: test\n`);
    expect(ids(r.findings)).toContain('job-missing-script');
  });

  it('still flags an empty `run:` list as missing-script', () => {
    const r = validate(`job:\n  run: []\n`);
    expect(ids(r.findings)).toContain('job-missing-script');
  });

  it('still flags a `run:` list whose only entry is an empty mapping', () => {
    const r = validate(`job:\n  run:\n    - {}\n`);
    expect(ids(r.findings)).toContain('job-missing-script');
  });
});

describe('validate() — GitLab `!reference` tag', () => {
  // `!reference [.job, keyword]` is core GitLab syntax. js-yaml rejects unknown
  // tags, so the whole file used to come back as a fatal YAML syntax error.
  it('parses `!reference` inside a script list instead of failing to parse', () => {
    const r = validate(`.setup:
  script:
    - echo setup

build:
  stage: build
  script:
    - !reference [.setup, script]
    - make
`);
    expect(r.ok).toBe(true);
    expect(r.error).toBeUndefined();
    expect(r.summary.errors).toBe(0);
  });

  it('counts a script that is ONLY a `!reference` as an executable surface', () => {
    const r = validate(`.setup:
  script:
    - echo setup

build:
  script:
    - !reference [.setup, script]
`);
    expect(r.ok).toBe(true);
    expect(ids(r.findings)).not.toContain('job-missing-script');
  });

  it('counts a whole-value `!reference` script as an executable surface', () => {
    const r = validate(`.setup:
  script:
    - echo setup

build:
  script: !reference [.setup, script]
`);
    expect(r.ok).toBe(true);
    expect(ids(r.findings)).not.toContain('job-missing-script');
  });

  it('does not mistake a `!reference` rules/image/services value for a bad shape', () => {
    const r = validate(`.defaults:
  rules:
    - if: '$CI_COMMIT_BRANCH'
  image: node:20
  services:
    - postgres:16

build:
  script: make
  rules: !reference [.defaults, rules]
  image: !reference [.defaults, image]
  services: !reference [.defaults, services]
`);
    expect(r.ok).toBe(true);
    expect(ids(r.findings)).not.toContain('rules-not-list');
    expect(ids(r.findings)).not.toContain('invalid-image-shape');
    expect(ids(r.findings)).not.toContain('invalid-services-shape');
    expect(ids(r.findings)).not.toContain('invalid-service-entry');
  });

  // TRUE POSITIVE — real YAML syntax errors must still be fatal.
  it('still fails on a genuine YAML syntax error', () => {
    const r = validate('job:\n  script: [unterminated\n');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/parse|YAML/i);
  });

  it('still fails on a genuinely unknown YAML tag', () => {
    const r = validate('job:\n  script: !nonsense [a, b]\n');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/parse|YAML/i);
  });

  it('still fails on bad indentation', () => {
    const r = validate('job:\n  script: make\n bad: 1\n');
    expect(r.ok).toBe(false);
  });
});

describe('validate() — cross-project / upstream needs:', () => {
  it('does not flag a cross-project `needs:` as a missing job', () => {
    const r = validate(`test:
  stage: test
  needs:
    - project: group/proj
      job: build
      ref: main
      artifacts: true
  script: make test
`);
    expect(r.ok).toBe(true);
    expect(ids(r.findings)).not.toContain('needs-unknown-job');
    expect(r.summary.errors).toBe(0);
  });

  it('does not flag an upstream-pipeline `needs:` as a missing job', () => {
    const r = validate(`test:
  stage: test
  needs:
    - pipeline: $UPSTREAM_PIPELINE_ID
      job: build
  script: make test
`);
    expect(ids(r.findings)).not.toContain('needs-unknown-job');
  });

  // TRUE POSITIVE — a genuinely absent LOCAL job must still error.
  it('still flags a local `needs:` naming a job that does not exist', () => {
    const r = validate(`build:
  stage: build
  script: make
test:
  stage: test
  needs:
    - project: group/proj
      job: elsewhere
    - nope
  script: make test
`);
    const f = r.findings.find((x) => x.id === 'needs-unknown-job');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
    expect(f!.title).toContain('nope');
    // the cross-project entry must NOT have produced its own finding
    expect(r.findings.filter((x) => x.id === 'needs-unknown-job')).toHaveLength(1);
  });

  it('still flags an object-form local `needs:` naming a missing job', () => {
    const r = validate(`test:
  stage: test
  needs:
    - job: build
      artifacts: true
  script: make test
`);
    expect(ids(r.findings)).toContain('needs-unknown-job');
  });
});

describe('validate() — stage inherited through extends:', () => {
  it('does not flag a stage inherited from an extended template', () => {
    const r = validate(`stages:
  - build

.base:
  stage: build

job:
  extends: .base
  script: echo hi
`);
    expect(r.ok).toBe(true);
    expect(ids(r.findings)).not.toContain('stage-not-declared');
    expect(r.summary.errors).toBe(0);
  });

  it('resolves a stage through a multi-level extends chain', () => {
    const r = validate(`stages:
  - build

.root:
  stage: build

.mid:
  extends: .root

job:
  extends: .mid
  script: echo hi
`);
    expect(ids(r.findings)).not.toContain('stage-not-declared');
  });

  it('resolves a stage through the LIST form of extends', () => {
    const r = validate(`stages:
  - build

.image:
  image: node:20

.staged:
  stage: build

job:
  extends:
    - .image
    - .staged
  script: echo hi
`);
    expect(ids(r.findings)).not.toContain('stage-not-declared');
  });

  it('lets the job own `stage:` win over the inherited one', () => {
    const r = validate(`stages:
  - build
  - deploy

.base:
  stage: build

job:
  extends: .base
  stage: deploy
  script: echo hi
`);
    expect(ids(r.findings)).not.toContain('stage-not-declared');
  });

  it('does not hang or crash on a cyclic extends chain', () => {
    const r = validate(`stages:
  - build

.a:
  extends: .b
  stage: build

.b:
  extends: .a

job:
  extends: .a
  script: echo hi
`);
    expect(r.ok).toBe(true);
    expect(ids(r.findings)).not.toContain('internal-analysis-incomplete');
  });

  it('does not hang on a self-referential extends', () => {
    const r = validate(`job:\n  extends: job\n  script: echo hi\n`);
    expect(r.ok).toBe(true);
  });

  // TRUE POSITIVE — a truly undeclared stage must still error.
  it('still flags an inherited stage that is not declared', () => {
    const r = validate(`stages:
  - build

.base:
  stage: nope

job:
  extends: .base
  script: echo hi
`);
    const f = r.findings.find((x) => x.id === 'stage-not-declared' && x.title.includes('“job”'));
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
    expect(f!.title).toContain('nope');
  });

  it('still flags a job that inherits no stage when the stages list lacks test', () => {
    const r = validate(`stages:
  - build

.base:
  image: node:20

job:
  extends: .base
  script: echo hi
`);
    const f = r.findings.find((x) => x.id === 'stage-not-declared');
    expect(f).toBeDefined();
    expect(f!.title).toContain('test');
  });
});

describe('validate() — include: awareness', () => {
  const withInclude = `include:
  - template: Jobs/Build.gitlab-ci.yml
  - local: /ci/templates.yml

my-build:
  extends: .build-template
  stage: build
  script:
    - make
`;

  it('downgrades an unknown extends target to a warning when include: is present', () => {
    const r = validate(withInclude);
    expect(r.ok).toBe(true);
    expect(r.summary.errors).toBe(0);
    const f = r.findings.find((x) => x.id === 'extends-unknown-target');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('warning');
    expect(f!.detail).toMatch(/include/i);
  });

  it('downgrades needs / dependencies / stage findings when include: is present', () => {
    const r = validate(`include:
  - local: /ci/base.yml

stages:
  - build

my-test:
  stage: qa
  needs:
    - compile
  dependencies:
    - compile
  script: make test
`);
    expect(r.summary.errors).toBe(0);
    for (const id of ['needs-unknown-job', 'dependencies-unknown-job', 'stage-not-declared']) {
      const f = r.findings.find((x) => x.id === id);
      expect(f, id).toBeDefined();
      expect(f!.severity, id).toBe('warning');
      expect(f!.detail, id).toMatch(/include/i);
    }
  });

  it('keeps unrelated errors at error severity even with include:', () => {
    const r = validate(`include:
  - local: /ci/base.yml

broken:
  stage: test
  when: sometimes
  script: make
`);
    const f = r.findings.find((x) => x.id === 'invalid-when');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
  });

  it('still reports no-jobs as an error even with include:', () => {
    const r = validate(`include:\n  - local: /ci/base.yml\n\n.only-a-template:\n  script: make\n`);
    const f = r.findings.find((x) => x.id === 'no-jobs');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
  });

  // TRUE POSITIVE — without an include, the same config must still be an error.
  it('keeps the same findings at error severity when there is no include:', () => {
    const r = validate(withInclude.replace(/^include:\n(?:  - .*\n)+\n/, ''));
    const f = r.findings.find((x) => x.id === 'extends-unknown-target');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('error');
    expect(f!.detail).not.toMatch(/include/i);
    expect(r.summary.errors).toBeGreaterThan(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────── *
 *  Bundled examples — each must still produce exactly its documented findings.
 * ────────────────────────────────────────────────────────────────────────── */

describe('bundled examples produce their documented findings', () => {
  const byId = (id: string) => examples.find((e) => e.id === id)!.yaml;

  it('clean → no findings at all', () => {
    const r = validate(byId('clean'));
    expect(r.ok).toBe(true);
    expect(r.summary).toEqual({ errors: 0, warnings: 0, infos: 0 });
  });

  it('extends → no findings at all', () => {
    const r = validate(byId('extends'));
    expect(r.ok).toBe(true);
    expect(r.summary).toEqual({ errors: 0, warnings: 0, infos: 0 });
  });

  it('undefined-stage → exactly one stage-not-declared error for release-job', () => {
    const r = validate(byId('undefined-stage'));
    expect(r.summary.errors).toBe(1);
    expect(ids(r.findings)).toEqual(['stage-not-declared']);
    expect(r.findings[0].title).toContain('release');
    expect(r.findings[0].line).toBe(115 - 104 + 1); // `stage: release` line within the snippet
  });

  it('bad-needs → needs-unknown-job + extends-unknown-target, both errors', () => {
    const r = validate(byId('bad-needs'));
    expect(r.summary.errors).toBe(2);
    expect(ids(r.findings).sort()).toEqual(['extends-unknown-target', 'needs-unknown-job']);
    expect(r.findings.every((f) => f.severity === 'error')).toBe(true);
  });

  it('no-script → one job-missing-script error + one legacy-only-except info', () => {
    const r = validate(byId('no-script'));
    expect(r.summary).toEqual({ errors: 1, warnings: 0, infos: 1 });
    expect(ids(r.findings)).toContain('job-missing-script');
    expect(ids(r.findings)).toContain('legacy-only-except');
  });

  it('bad-when → invalid-when + rules-not-list, both errors', () => {
    const r = validate(byId('bad-when'));
    expect(r.summary.errors).toBe(2);
    expect(ids(r.findings).sort()).toEqual(['invalid-when', 'rules-not-list']);
  });
});

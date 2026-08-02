# 09a — secret scanner: gitleaks-class detection, offline

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** Paste any config blob (.env, CI YAML, Dockerfile, JSON, shell history) → provider-named findings with line anchors, entropy-scored generic candidates, and zero uploads. The tool that makes "nothing leaves your browser" the product.

**Files:**
- Create: `src/lib/secret-scanner/patterns.ts` (the shared list — plan 01a's `looksSecret` and 07f's DF009 converge on this file once it exists)
- Create: `src/lib/secret-scanner/engine.ts`, `engine.test.ts`
- Create: `src/components/SecretScannerPlayground.astro`, `src/pages/secret-scanner.astro` + 4 locale pages
- Modify: `src/data/tools.ts` (Security category), E2E batch module under `tests/e2e/fixtures/`

### Task 1: patterns module

- [ ] **Step 1: Failing tests** — one vector per pattern, positive and negative:

```ts
import { PATTERNS, shannonEntropy } from './patterns';
const hits = (s: string) => PATTERNS.filter((p) => p.re.test(s)).map((p) => p.id);

it.each([
  ['aws-access-key',    'AKIAIOSFODNN7EXAMPLE'],
  ['aws-secret-key',    'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'],
  ['github-pat',        'ghp_16C7e42F292c6912E7710c838347Ae178B4a'],
  ['github-fine-pat',   'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz'],
  ['gitlab-pat',        'glpat-xxxxxxxxxxxxxxxxxxxx'],
  ['slack-token',       'xoxb-2508095029-1548959030-abcdefabcdef'],
  ['openai-key',        'sk-proj-abc123abc123abc123abc123'],
  ['anthropic-key',     'sk-ant-api03-abcdefgh-ijklmnop'],
  ['stripe-key',        'a literal sk_live_ prefix followed by 24+ alphanumerics — described rather than written out, because a real-shaped example here trips GitHub push protection on this very file'],
  ['private-key-block', '-----BEGIN OPENSSH PRIVATE KEY-----'],
  ['jwt',               'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'],
  ['url-credential',    'postgres://svc:hunter2@db.internal:5432/app'],
  ['gcp-service-key',   '"private_key_id": "0123456789abcdef0123456789abcdef01234567"'],
])('%s fires', (id, s) => expect(hits(s)).toContain(id));

it.each([
  'export PATH=/usr/local/bin:$PATH',
  'image: node:22-alpine',
  'AKIA_PLACEHOLDER_SEE_VAULT',        // too short / wrong charset after prefix
  'https://user@github.com/org/repo',  // user without password is not a credential
])('clean line stays clean: %s', (s) => expect(hits(s)).toEqual([]));

it('entropy: hex/base64 blobs score, prose does not', () => {
  expect(shannonEntropy('4f8a9b2c1d3e5f60718293a4b5c6d7e8')).toBeGreaterThan(3.5);
  expect(shannonEntropy('the quick brown fox jumps over')).toBeLessThan(3.5);
});
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement: `PATTERNS: Array<{id, provider, re, note, docsUrl?}>` (each regex anchored with `\b` where possible; the vectors above are the acceptance bar — extend from the gitleaks default ruleset for the long tail, hand-checking each regex compiles under the ReDoS guard: run every pattern through `src/lib/regex-safety.ts` in a test). `shannonEntropy(s)` over the candidate token only, not the line.
- [ ] **Step 4:** Commit `feat(secret-scanner): pattern + entropy core — one shared list for the whole site`.
- [ ] **Step 5 (convergence):** Replace plan 01a's inline `SECRET_PATTERNS` with an import of this module *if 01a already landed* (keep `looksSecret`'s exported signature stable); point 07f's DF009 here. One list, three consumers.

### Task 2: engine

- [ ] **Step 1: Failing tests** — `scan(text)` returns `{findings: Array<{line, col, id, provider, masked, note}>, stats}`; vectors: a 5-line .env with two plants → two findings with correct 1-based line numbers and `masked` showing first-4+last-2 chars only (`AKIA…LE`); an entropy-only candidate (32-hex assigned to `TOKEN=`) → finding with `id: 'high-entropy'` and lower confidence marked; a 200 KB input → completes <100 ms (perf assertion); never throws on binary garbage.
- [ ] **Step 2:** Implement: line-split scan; pattern pass first, entropy pass only on `key=value`/`key: value` shapes whose key matches `SECRET_NAME_RE`-class names (reuse the naming idea from dockerfile DF009) to keep false positives down. **The engine must never echo the full secret** — `masked` is the only value field. Commit `feat(secret-scanner): engine — line-anchored, masked findings, never echoes the secret`.

### Task 3: playground + page

- [ ] **Step 1:** Playground from the CidrChecker port checklist (08a). Specifics: results table = line / provider / masked match / note; **no share link, no auto-restore** — this tool joins the hard-excluded set (01a) and prints the reason on-screen (the `EnvChecker:189` pattern); "Copy findings as Markdown" carries `data-copy-all` (the platform audit: findings-into-PR is how tools get bookmarked); seed example is a fake .env with three obvious plants — every seed value visibly fake (`AKIAIOSFODNN7EXAMPLE` is AWS's own doc example key; use only doc-canonical fakes).
- [ ] **Step 2:** Page: ToolHero → playground → why ("nobody pastes a suspect .env into a hosted scanner — that's the point of an offline one") → pipeline → reference table of every pattern ID with provider docs links → FAQ (incl. "is this as good as gitleaks?" — honest answer: same pattern class, no git-history scanning, link gitleaks) → JSON-LD via `softwareAppLd`+`faqPageLd`. Five locales, one commit.
- [ ] **Step 3:** Register in `tools.ts` (Security, `status:'live'`), E2E fixture (XSS journey payload must be *valid scanner input that echoes* — a fake token containing `<img onerror>` in its masked rendering path), promote per the bar.
- [ ] **Step 4:** Commit `feat(secret-scanner): tool pages, registry, fixtures — all locales`.

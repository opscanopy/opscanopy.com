# 01a — content-aware secret guard in `recordToolLastInput`

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** `recordToolLastInput` refuses to persist any value containing secret-shaped content, and the certificate-decoder / terraform-summarizer call sites stop persisting raw input.

Defense in depth: the guard protects every future tool automatically; the call-site changes fix today's two offenders even if the guard's patterns miss.

### Task 1: the guard

**Files:**
- Modify: `src/lib/tool-state/last-input.ts`
- Test: `src/lib/tool-state/last-input.test.ts` (create if absent — check first; snapshots have tests nearby, mirror their setup with a stubbed `localStorage`)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { looksSecret } from './last-input';

describe('looksSecret', () => {
  it('flags PEM private key blocks, any variant', () => {
    expect(looksSecret('-----BEGIN PRIVATE KEY-----\nMII...')).toBe(true);
    expect(looksSecret('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
    expect(looksSecret('-----BEGIN EC PRIVATE KEY-----')).toBe(true);
    expect(looksSecret('-----BEGIN ENCRYPTED PRIVATE KEY-----')).toBe(true);
    expect(looksSecret('-----BEGIN OPENSSH PRIVATE KEY-----')).toBe(true);
  });
  it('flags well-known credential prefixes', () => {
    expect(looksSecret('token=ghp_16C7e42F292c6912E7710c838347Ae178B4a')).toBe(true);
    expect(looksSecret('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE')).toBe(true);
    expect(looksSecret('xoxb-2508095029-1548959030-abcdefabcdef')).toBe(true);
    expect(looksSecret('sk-proj-abc123abc123abc123abc123')).toBe(true);
  });
  it('flags JWTs', () => {
    expect(looksSecret('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U')).toBe(true);
  });
  it('does NOT flag ordinary tool input', () => {
    expect(looksSecret('-----BEGIN CERTIFICATE-----\nMIIB...')).toBe(false);   // certs are not secrets
    expect(looksSecret('10.0.0.0/24')).toBe(false);
    expect(looksSecret('FROM node:22\nRUN npm ci')).toBe(false);
    expect(looksSecret('0 2 * * *')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/tool-state/last-input.test.ts` (from PowerShell with capital-drive `C:/…` cwd per CLAUDE.md). Expected: FAIL, `looksSecret` not exported.

- [ ] **Step 3: Implement.** In `last-input.ts`, above `recordToolLastInput`:

```ts
/**
 * Secret-shaped content is never auto-persisted, no matter which tool records
 * it. This is the backstop behind the per-tool exclusion policy: a future tool
 * that forgets to opt out still cannot write a private key to disk.
 * Patterns are deliberately high-precision (key blocks, vendor prefixes, JWT
 * shape) — a false positive only means "not remembered", which is safe.
 */
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9]{20,}\b/,            // GitHub PAT (classic)
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,    // GitHub PAT (fine-grained)
  /\bAKIA[0-9A-Z]{16}\b/,                // AWS access key id
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,    // Slack tokens
  /\bsk-[A-Za-z0-9_-]{16,}\b/,           // OpenAI-style
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, // JWT (three b64url segments)
];

export function looksSecret(value: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(value));
}
```

Then add the guard as the **first** check inside `recordToolLastInput`, before the size cap:

```ts
if (looksSecret(value)) return; // never persisted; the store is left as it was
```

- [ ] **Step 4: Run tests** — same command. Expected: PASS. Also `npm run test` to confirm nothing else regressed.

- [ ] **Step 5: Update the module doc comment** at `last-input.ts:9-12` — the four-tool list is now "tools that never call this module (jwt-decoder, hash-generator, base64-encoder-decoder, env-example-checker, certificate-decoder), plus a content guard (`looksSecret`) as backstop for every caller."

- [ ] **Step 6: Commit** — `git commit -m "fix(tool-state): never auto-persist secret-shaped input (private keys, PATs, JWTs)"`

### Task 2: certificate-decoder stops persisting raw input

**Files:**
- Modify: `src/components/CertificateDecoderPlayground.astro:1431` and the restore site `:1558-1563`

- [ ] **Step 1:** Delete the `recordToolLastInput(SLUG, value)` call at `:1431` and the `getRestoredLastInput`/restore block at `:1558-1563`; remove the now-unused imports at `:699`. The cert decoder joins the hard-excluded set — its input class (key material next to certs) makes persistence wrong even with the guard, and `pem.ts:128` already promises it.
- [ ] **Step 2:** Runtime-verify per `.claude/skills/verify/SKILL.md`: paste a PEM containing `-----BEGIN PRIVATE KEY-----`, dump `localStorage['oc-last-v1']`, assert no `PRIVATE KEY` substring and no `certificate-decoder` slug key. Reload; textarea must be empty (no restore).
- [ ] **Step 3: Commit** — `git commit -m "fix(certificate-decoder): stop auto-persisting pasted input — keeps the 'never left this page' promise"`

### Task 3: terraform-plan-summarizer gated behind the guard, size-capped

**Files:**
- Modify: `src/components/TerraformPlanSummarizerPlayground.astro:1562`

- [ ] **Step 1:** Keep the call (plans are usually non-secret and re-paste is expensive) but it is now covered by Task 1's guard. Add one more layer: wrap the call site as `if (!value.includes('"sensitive"')) recordToolLastInput(SLUG, value);` is **not** enough — plan JSON always contains `"sensitive"` keys. Instead leave the call as is and rely on the guard; document the decision inline:

```js
// Auto-restore kept deliberately: plan JSON is topology, not credentials, and
// the looksSecret() backstop in last-input.ts refuses anything key-shaped.
// Revisit if users report pasting plans with embedded provider credentials.
```

- [ ] **Step 2: Commit** — `git commit -m "docs(terraform-plan-summarizer): record the auto-restore decision at the call site"`

### Done when

- [ ] All Task 1 vectors pass; `npm run test` green.
- [ ] Headless verify from Task 2 Step 2 passes.
- [ ] Grep check: `grep -n "recordToolLastInput" src/components/*.astro` — every remaining caller handles non-secret input classes (spot-check any tool whose input could carry credentials; file follow-ups rather than expanding this plan).

# Point fix 10 — cross-tool chaining: carry the document, not just the category

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A generic `#doc=` hash handoff so a user's working text travels tool → tool without re-pasting — the `#ip=` pattern (`src/lib/ip-hash.ts`, proven across 5 networking tools) generalized to text-document tools.

**Evidence:** Only 5 of 39 playgrounds build data handoffs; `ToolCrossLinks.astro:51` links by `t.category === current.category` — taxonomy, not data. The real workflow (decode base64 → it's JSON → jq it → hash it) re-pastes at every hop.

**Architecture:** One new module `src/lib/doc-hash.ts` mirroring `ip-hash.ts`'s conventions exactly (Safari-guarded `replaceState`, last-value memo, ~2000-char encoded cap, write only on valid user-initiated evals, never on boot-seed). Receiving tools read `#doc=` at boot exactly like `#ip=` readers do. Chips render under result cards via the existing cross-link chip pattern.

**Not in scope:** secret-input tools never *read* `#doc=` into their input silently (jwt-decoder deliberately opts out of deep links — respect that decision, `JwtDecoderPlayground:121`); no tool *writes* `#doc=` when its content matches the secret patterns (plan 01a's `looksSecret` guards the write).

### Task 1: `doc-hash.ts`

- [ ] **Step 1: Failing tests** (`src/lib/doc-hash.test.ts`): `buildDocHash(text)` → `#doc=<base64url>` round-trips through `readDocHash`; unicode-safe (emoji, CJK); returns `null` past 2000 encoded chars; returns `null` when `looksSecret(text)` (import from plan 01a's module); `readDocHash` on malformed base64 → `null`, never throws.
- [ ] **Step 2:** Implement, copying `ip-hash.ts`'s structure and its base64url helpers (check whether `GhaValidatorPlayground:922`'s `base64UrlEncode` is importable/shared — if each tool hand-rolls one today, this module becomes the shared home and 08b's cap work imports it).
- [ ] **Step 3:** Commit `feat(doc-hash): generic #doc= handoff — ip-hash conventions, secret-guarded, capped`.

### Task 2: wire the first ring (highest-value pipes from the audit)

Senders write `#doc=` links into a "Send to…" chip row under the result card (pattern: the networking tools' cross-tool chips + `localePath()`); receivers read it at boot as a non-seed input (so live eval fires but the URL is not re-written — same rule as `#ip=` readers).

- [ ] Ring 1 — encode/decode: `base64-encoder-decoder` (decoded output) → `json-yaml-converter`, `jq-playground`, `hash-generator`, `url-encoder-decoder`; each of those → base64. jq's *output* → `json-yaml-converter`, `hash-generator`.
- [ ] Ring 2 — config: `json-yaml-converter` → `kubernetes-label-selector-tester`, `yaml-diff` (when 09b lands); `docker-run-to-compose` output → `dockerfile-linter` page? No — compose isn't a Dockerfile; instead `dockerfile-linter` ↔ `docker-run-to-compose` link *inputs* only where types match. **Type discipline: a chip only appears when the receiving tool can parse the payload class** — sender declares `docKind: 'json' | 'yaml' | 'text'`, receivers register accepted kinds in the chip builder.
- [ ] Ring 3 — CI: `github-actions-validator` flagged `if:` expression → `github-actions-expression-tester` with the expression preloaded (this one carries the *expression*, not the whole doc — small payload, always under cap).
- [ ] Per receiving tool: boot-read follows the exact `#ip=` reader shape already in those playgrounds (grep one: `SubnetCalculatorPlayground` reads `readIpHash` at boot — mirror it).
- [ ] Headless verify one full chain: base64 seed → decode → "Send to jq" → jq opens with the JSON in place → run `.foo` → "Send to hash-generator" → digest renders. Three tools, zero re-pastes.
- [ ] Commit per ring.

### Task 3: analytics + docs

- [ ] Add a `tool_handoff` custom event on chip click (pathname-only payload, matching the existing `Layout.astro` event discipline) — this is the metric that justifies extending the rings.
- [ ] CLAUDE.md: extend the deep-link-hash section with `#doc=` (kinds, caps, secret guard, the seed rule).

**Done when** the three rings ship, the base64→jq→hash chain works headlessly, no secret-shaped payload is ever written to a URL, and handoff clicks are measurable.

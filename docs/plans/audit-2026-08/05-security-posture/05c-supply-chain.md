# 05c — supply-chain automation + retire the dead Go-WASM PoC

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** Dependabot and CodeQL run on the repo, workflow actions are SHA-pinned, and the unverifiable 3.7 MB `public/engine.wasm` + `wasm_exec.js` + demo page stop shipping to production.

### Task 1: Dependabot

- [ ] **Step 1:** Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: {interval: weekly}
    groups:
      dev-minor:
        dependency-type: development
        update-types: [minor, patch]
    ignore:
      # Exact-pinned on purpose — the version encodes the jq binary version
      # that the UI reads off the loaded module (see CLAUDE.md). Bump manually.
      - dependency-name: jq-wasm
  - package-ecosystem: github-actions
    directory: /
    schedule: {interval: weekly}
```

- [ ] **Step 2:** Commit + push; confirm the Dependabot tab activates on GitHub.
- [ ] **Step 3: Commit** — `git commit -m "chore(security): dependabot for npm + actions; jq-wasm stays hand-pinned"`

### Task 2: CodeQL + audit gate

- [ ] **Step 1:** `.github/workflows/codeql.yml` — the stock `github/codeql-action` starter for `javascript-typescript`, on `push` to main + weekly cron. Pin every `uses:` to a full commit SHA with a `# vX` comment (resolve SHAs with `gh api repos/{owner}/{repo}/commits/{tag}` at authoring time — do not copy SHAs from this plan).
- [ ] **Step 2:** Add `npm audit --omit=dev --audit-level=high` as a step in the existing CI workflow (look in `.github/workflows/` — there is at least one; append, don't create a parallel workflow). Production-deps-only and high+ severity so it can't become a permanently-red gate (the repo's own e2e quarantine note explains why that matters).
- [ ] **Step 3:** SHA-pin the `uses:` entries in the **existing** workflows (currently floating `@v5`, `@v4`, `claude-code-action@beta`). For `@beta` specifically: pin the SHA and add a comment naming the tag it tracked and why (beta channel, review before bumping).
- [ ] **Step 4:** Sanity: run the site's own GHA validator (post-plan-04) over each workflow file — it should report zero unpinned refs. Eating the dog food is the point.
- [ ] **Step 5: Commit** — `git commit -m "chore(security): CodeQL, npm audit gate, SHA-pinned workflow actions"`

### Task 3: retire the Go-WASM PoC

**Evidence:** `public/engine.wasm` (3,764,378 bytes, committed June 8) + `public/wasm_exec.js` + `src/pages/alertlint-wasm-demo.astro` all reachable in prod. Nothing ties the binary to the `engines/alertlint/` Go source; CLAUDE.md already labels the pattern deprecated. The live AlertLint tool (`src/lib/alertlint/`) is TS and independent of it.

- [ ] **Step 1:** Confirm independence: `grep -rn "engine.wasm\|wasm_exec" src/ --include=*.astro --include=*.ts` — expect hits only in `alertlint-wasm-demo.astro`. Any other hit = stop, reassess.
- [ ] **Step 2:** `git rm public/engine.wasm public/wasm_exec.js src/pages/alertlint-wasm-demo.astro`. Keep `engines/alertlint/` (Go source, ~40 KB) — it's provenance for the git history and costs nothing in dist; note in the commit body that the *binary* was the problem (unverifiable artifact shipped to prod).
- [ ] **Step 3:** Check for internal links/mentions: `grep -rn "alertlint-wasm-demo" src/ docs/ marketing/` — remove or update every reference (the changelog page may mention it; a changelog *entry* stays, a *link* goes).
- [ ] **Step 4:** `npm run build` — confirm none of the three artifacts are in `dist/`, and the AlertLint tool page still works (headless verify: paste the seed example, results render).
- [ ] **Step 5:** Redirect decision: the demo page was `noindex` (uncrawled), so a 404 is acceptable — skip redirect plumbing. If `wrangler.jsonc` supports `_redirects`-style rules and one already exists for something else, add `/alertlint-wasm-demo/ /loki-alert-rule-tester/ 301` for link hygiene; do not build new redirect machinery for this.
- [ ] **Step 6: Commit + deploy** — `git commit -m "chore(security): retire the Go-WASM PoC — unverifiable 3.7MB binary no longer ships"` then `npm run build && npm run deploy` (deploy removes it from prod; verify `curl -sI https://opscanopy.com/engine.wasm` → 404).

**Done when** Dependabot/CodeQL are visibly active, `gh api` shows SHA-pinned workflows, and the three PoC artifacts return 404 in production.

# 01b — privacy copy tells the truth, in five locales

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox steps.

**Goal:** The /privacy "short version" and the localStorage-key inventory match the code after 01a, in en/de/es/fr/pt-br, one commit.

**Evidence:** `src/i18n/pages/en.ts:82` says input is *"never stored after you close the tab"* — but 31 components write `oc-last-v1`, which survives the tab by design (the same page documents that key at `:112`). The four-tool exclusion list at `:112` is stale after 01a. Same sentences at `de.ts:57`, `es.ts:57`, `fr.ts:67`, `pt-br.ts:57`.

### Task 1: rewrite the English source

**Files:**
- Modify: `src/i18n/pages/en.ts:82` (short version) and `:112` (key inventory)

- [ ] **Step 1:** Replace the `:82` claim with copy that is true:

> "The text, files, and configuration you paste into any OpsCanopy tool are processed locally, inside your own browser tab — nothing you paste is ever sent to us or to any third party. To save you retyping, most tools remember your latest input **on your own device** (in your browser's localStorage, key `oc-last-v1`) until you clear it below. Tools whose input is likely to be a secret — the JWT decoder, hash generator, Base64 encoder, .env checker, and certificate decoder — never store anything, and no tool will store input that looks like a private key or access token."

- [ ] **Step 2:** Update the `:112` inventory: add `certificate-decoder` to the never-stored list; add one sentence on the `looksSecret` backstop from 01a. Keep the existing per-key format — this page's key-by-key honesty is a strength, extend it rather than restructure.

- [ ] **Step 3:** `npm run build` — confirm /privacy renders (Astro type-checks the i18n object shape).

### Task 2: the four translations

**Files:**
- Modify: `src/i18n/pages/de.ts:57`, `es.ts:57`, `fr.ts:67`, `pt-br.ts:57` (+ their inventory entries)

- [ ] **Step 1:** Translate Task 1's copy in each file's existing register (per CLAUDE.md: hand-translated, match the file's voice — read 3–4 neighbouring strings first in each file).
- [ ] **Step 2:** Cross-check no locale still contains its language's equivalent of "never stored after you close the tab" — grep each file for the old sentence fragment before committing.

### Task 3: one commit

- [ ] `git add src/i18n/pages/{en,de,es,fr,pt-br}.ts && git commit -m "fix(privacy): describe oc-last-v1 truthfully; current exclusion list + secret backstop — all 5 locales"`

**Done when** all five /privacy pages state the storage behaviour the code has after 01a, and no locale ships the false "never stored" sentence.

**Dependency:** land after 01a (the copy references the guard). If 01c lands later, the "until you clear it below" phrase must arrive with 01c's purge control — if shipping 01b alone, write "until you clear your browser data" instead.

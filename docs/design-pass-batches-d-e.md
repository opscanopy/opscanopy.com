# Design pass: Batches D and E (held, ready to ship)

Status as of 2026-10-03. Both batches are built, guard-checked and committed on
local branches. **Neither is live.** Each waits for a date and for your go.

The full plan behind them is `~/.claude/plans/yes-do-it-also-swirling-hamster.md`.
The live tracker is `~/.claude/plans/yes-do-it-also-swirling-hamster/PROGRESS-TRACKER.md`.

## What is already live

| Push | Commit | Date | URLs re-dated |
|---|---|---|---|
| Round 1: SEO guard, gates, dark slab, buttons, header, blog covers | `3db8da7` | 2026-10-02 | 5 |
| Round 2: code blocks, prose, hubs on the rail, kit Wave 1, diagrams | `e322426` | 2026-10-02 | 69 |
| Waves 2–4: all 36 remaining tool playgrounds on the kit | `a351713` | 2026-10-03 | 190 |

Round 3 (follow-ups, kit polish, audit gate) ships separately and re-dates nothing.

## Batch D: tool pages and the /tools catalog

**Shipped 2026-10-03, at your request** (originally planned for 2026-10-10). The
trade-off you accepted: the 195 tool pages re-date a second time within about a day
of Waves 2–4, so a traffic change on tool pages over the next weeks can't be
attributed to the waves or to D separately. The SEO guard showed no ranking-input
change either way.

**What it changes**

- The tool-page hero moves onto the left rail, through the shared `PageHero`.
- The eyebrow and the hand-written badges stop rendering. The "Updated" date becomes
  a visible caption under the trust line, because it backs `dateModified`.
- The H1 is split visually into the tool name and the claim. Its text stays
  byte-identical, so Google reads the same H1.
- The long lede paragraph moves below the result panel, word for word. A codemod
  does this across all 195 tool pages and refuses any file whose text would change.
- Tool-page sections lose their centred wrappers and sit on the rail.
- The /tools catalog groups cards into 12 category sections. The category links
  become the filter row and stay real links, because they are the catalog's only
  links to the category pages.
- Tool cards drop the "LIVE" badge and the truncated keyword chips, and gain their
  figure number. "Pure client-side." is removed from 23 descriptions.

**Where it is**: branch `design/batch-d`, worktree `C:/tmp/oc-wt/batch-d`,
head `3a4bde0`.

**Guard result**: 0 must-explain. 218 URLs re-dated: the 39 tools in 5 languages,
12 category pages, the homepage ×5, `/tools/` ×5 and `/changelog/`. All H1 texts
identical; lede present verbatim; category link counts unchanged.

**After it ships, watch for 48 hours**: Search Console clicks and CTR on the top 10
tool pages. If CTR drops by more than 10% with no change in position, revert the
codemod commit alone (the lede move), not the whole batch.

## Batch E: homepage, About and naming

**Earliest ship date: 2026-10-22** (after your homepage Search Console read; D
shipped 2026-10-03, so the 7-days-after-D rule is already met by then). The review
fixed one bug before you decide: the localized homepages linked to /de/verify-ai/
and similar pages that don't exist.

**Prerequisite (yours)**: read Search Console for the homepage, comparing the three
weeks before and after 2026-09-30, when the new H1 went live. If clicks or CTR
dropped, suspect that H1 first. Batch E changes the homepage body, so it must not
ship before that comparison is read, or the result can't be attributed.

**What it changes**

- The homepage follows one story: claim, proof ledger, numbered tool index, Mission
  90 drill with 3 named missions, incident-style latest posts, a "verify the AI"
  plate, FAQ, and a two-door close.
- The "Why" section and the privacy section merge into one band. The privacy
  paragraph stays word for word.
- The Mission 90 band moves onto the instrument slab, with a readable button.
- The privacy panel fills its numbers live instead of hard-coding "cookies 0",
  which contradicted the FAQ.
- The hero demo status reads "computed locally in N ms".
- The FAQ keeps all 9 questions in the HTML and the structured data. Questions 5–9
  sit inside one "More questions" disclosure.
- Homepage tool numbers match each tool's figure number.
- The About page leads with the founders, in all 5 languages.
- Hub headings that said "canopy" or "toolbox" are retired. Titles are unchanged.

**Where it is**: branch `design/batch-e`, worktree `C:/tmp/oc-wt/batch-e`,
head `021b320`.

**Guard result**: 0 must-explain. 15 allowed changes, all H1s (About ×5 and the
retired hub headings), each pinned to its exact new text. 35 URLs re-dated. FAQ
structured data identical.

**Decision before shipping**: the About page must not say "two engineers" unless the
second founder is named with a profile link. Check the wording.

## How to ship either batch

Ask Claude: **"ship batch D"** (from 2026-10-10) or **"ship batch E"** (from
2026-10-22, after the Search Console read). Claude will then:

1. Merge the batch onto the current `main`. If `main` moved, resolve and re-check.
2. Run the SEO guard against a fresh cold build of `main`. Required: 0 must-explain,
   and the re-date count must match the numbers above.
3. Run the result comparison on all 195 tool pages, the full tests, the type check,
   the audit gate, and a browser pass in both themes at desktop and phone width.
4. Push only if everything passes, then confirm the live build ID and that the
   IndexNow count matches the guard.

Rollback for either batch is one `git revert` of its merge commit; CI redeploys.

## Other dates to remember

| Date | What |
|---|---|
| ~2026-10-21 | Read the homepage Search Console comparison (prerequisite for Batch E) |
| 2026-11-03 | The audit allowlist entry for GHSA-ch52-4w7c-c8xp (`http-cache-semantics`, no fix published yet) expires. The deploy gate fails from that day until the entry is renewed with a reason, or removed once Astro ships a fix. |

## Backup

Both branches were pushed to GitHub on 2026-10-03 as `design/batch-d` and
`design/batch-e` (non-`main` branches deploy nothing). Batch E's latest head at that
time: `4c7b8ce`. When it ships, it is rebased onto the then-current `main`; the one
known conflict is `src/lib/rail.test.ts` (keep the union of both removals).

## Follow-ups left from Batch D's review

- On the five /tools/ pages the header "Browse tools" button still links to the page
  itself; the plan wanted it to open search. Header.astro is not a date input, so it
  can land any time without re-dating anything.
- On a few tools (JWT decoder, hash generator, jq) the input still starts lower than
  the target on phones, because their playground chrome sits above it. Each is
  230–260px better than before.
- At 390px, after filtering /tools by category, the active chip can sit outside the
  visible part of the scrolling strip.

## Small follow-ups not in either batch

- Two highlight boxes in the GitHub Actions security diagram sit tight against
  their text, and a bracket in the GitLab CI diagram touches its box.
- The Mission 90 FAQ heading is still centred; the new `FaqList` alignment option
  can fix it when that page is next edited.

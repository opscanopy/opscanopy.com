# Design pass: Batches D and E (both live)

Status as of 2026-10-04: **the whole design pass is live.** Both batches shipped
early, at your request, after every gate passed. The sections below are kept as the
record of what each batch changed and what to watch.

The full plan behind them is `~/.claude/plans/yes-do-it-also-swirling-hamster.md`.
The live tracker is `~/.claude/plans/yes-do-it-also-swirling-hamster/PROGRESS-TRACKER.md`.

## What is already live

| Push | Commit | Date | URLs re-dated |
|---|---|---|---|
| Round 1: SEO guard, gates, dark slab, buttons, header, blog covers | `3db8da7` | 2026-10-02 | 5 |
| Round 2: code blocks, prose, hubs on the rail, kit Wave 1, diagrams | `e322426` | 2026-10-02 | 69 |
| Waves 2–4: all 36 remaining tool playgrounds on the kit | `a351713` | 2026-10-03 | 190 |
| Round 3: follow-ups, kit polish, audit gate | `16b190a` | 2026-10-03 | 0 |
| Batch D: tool pages and /tools catalog | `5b46e5f` | 2026-10-03 | 218 |
| Batch D follow-ups | `3f2ff62` | 2026-10-03 | 0 |
| Batch E: homepage, About, hub headings | `60bbdb1` | 2026-10-04 | 25 |

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

**Shipped 2026-10-04 as `60bbdb1`, at your request** (originally planned for after
the 2026-10-21 Search Console read). The trade-off you accepted: the 2026-09-30
homepage H1 change can no longer be measured on its own, because the homepage body
changed four days later. Read the homepage numbers as "H1 + Batch E together".

Guard: 0 must-explain; 15 H1 changes, each pinned to its exact text (About, /tools
and /blog in 5 languages); FAQ structured data identical; 25 URLs re-dated (the five
info pages in five languages, because About shares their text file). CI tests
9,995 passed. The review also fixed a bug before shipping: the localized homepages
linked to /de/verify-ai/ and similar pages that don't exist.

The privacy panel now shows live numbers ("requests (this page)", "cookies (this
origin)") next to "your input: 0 bytes sent"; the cookie count is the truth for that
visitor, which fixes the old hard-coded "cookies 0" that the FAQ contradicted.

The /blog/ H1 changed without its sitemap date moving (the heading lives in a UI
string file, which is not a date input). Expect Search Console to notice the new H1
on a page with an older lastmod; that is harmless.

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

## How each batch was shipped (reuse this for future design changes)

Both batches went out through the same steps; follow them for any future change that
touches page copy, tool pages or the homepage:

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
| ~2026-10-21 | Read the homepage Search Console numbers (now the 2026-09-30 H1 and Batch E together) |

The audit exception for GHSA-ch52-4w7c-c8xp is gone: `http-cache-semantics` 4.3.0
fixed it on 2026-10-04, the site moved to it the same day, and `package.json` pins
the floor at `^4.3.0`. The audit gate has no exceptions and no expiry date pending.

## Backup

Both branches were pushed to GitHub on 2026-10-03 as `design/batch-d` and
`design/batch-e`. Both have since shipped; the branches are kept only as history and
can be deleted from GitHub whenever you like.

## Follow-ups from Batch D's review (fixed 2026-10-03, `3f2ff62`)

- On the five /tools/ pages the header button now reads "Search tools" and opens the
  command palette; everywhere else it is still the "Browse tools" link.
- Phones: a playground's example chips sit on one sideways-scrolling row instead of
  wrapping, and the JWT decoder's three modes form one segmented row. Inputs at 390px
  moved up 100–150px (hash 403px, subnet 403px, jq 472px, JWT 526px).
- At 390px, the chosen /tools category chip scrolls into view inside the strip, on
  click and on a `?cat=` link.

Shipped the same day Batch D re-dated those pages; sitemap dates are whole days, so
these fixes re-dated nothing (IndexNow 0 URLs).

## Small follow-ups not in either batch

- Two highlight boxes in the GitHub Actions security diagram sit tight against
  their text, and a bracket in the GitLab CI diagram touches its box.
- The Mission 90 FAQ heading is still centred; the new `FaqList` alignment option
  can fix it when that page is next edited.

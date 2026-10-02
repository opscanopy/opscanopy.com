# SEO-surface allowlists

One JSON file per batch, passed to the guard with
`npm run seo:diff -- --allow scripts/seo-allow/<batch>.json`. A rule turns a
named must-explain difference into an *allowed* one; anything a rule does not
name still fails the run. Write the rules before the batch is built, from the
plan's "Guard expectation", not after reading the report.

```json
{
  "batch": "B-visual-system",
  "expires": "2026-11-30",
  "rules": [
    { "field": "h1", "pages": "^/learn/$", "to": "^Learn DevOps: free roadmaps", "reason": "B6 sentence case; title unchanged" },
    { "field": "words", "pages": "^/(?:(?:de|es|fr|pt-br)/)?[a-z0-9-]+/$", "maxDropAbs": 12, "reason": "D1 drops the eyebrow and two badges" },
    { "field": "lede-present", "pages": "^/(?:(?:de|es|fr|pt-br)/)?[a-z0-9-]+/$", "selector": "h1 ~ p.body-md", "reason": "D2 moves the lede below the panel" },
    { "field": "must-contain", "pages": "^/blog/[^/]+/$", "when": "pre.astro-code", "selector": "figure.code-fig", "reason": "B2 wraps every code block" }
  ]
}
```

## Top level

| key | meaning |
|---|---|
| `batch` | Name used in the report file name (`reports/seo-surface/<date>-<batch>.md`) unless `--batch` overrides it. |
| `expires` | `YYYY-MM-DD`. Past this day (the candidate's head commit date, or `--date`) the run **exits 2** whatever the diff says: an allowlist is a statement about one batch, and a stale one quietly excuses the next. |
| `rules` | Array of rules; `[]` is valid and means "this batch changes nothing a crawler reads". |

## Rule keys

| key | meaning |
|---|---|
| `field` | Field id, `*` is a glob over any characters: `title`, `description`, `canonical`, `hreflang`, `x-default`, `lang`, `robots`, `og:title` … `og:*`, `h1`, `h1-count`, `h2`, `ld:<Type>` (e.g. `ld:FAQPage`, `ld:*`), `pagefind`, `page-added`, `page-removed`, `footer:<href>`, `anchor:<href>` (e.g. `anchor:/tools/*`), `inbound:<href>`, `nofollow`, `links`, `words`, `hidden`, `is-tool`, `extract`, `sitemap`, `lastmod`, `llms:<file>`. Two positive fields, below, are checks rather than excuses. |
| `pages` | Optional regex over the site path (`/de/subnet-calculator/`). For `inbound:*` the "page" is the link target. |
| `to` | Optional regex the **new** value must match, or the rule does not apply (an H1 rewritten to something else is still must-explain). |
| `maxDrop` | Numeric diffs (`words`, `inbound:*`): allowed only while the drop fraction is ≤ this (`0.25` = 25%). Every word and inbound change is emitted — informational under the default threshold (20% words, 10% linking pages) — so `inbound:/tools/* maxDrop 0` turns even one lost linking page into must-explain. |
| `maxDropAbs` | Numeric diffs: allowed only while the absolute drop is ≤ this. A drop past the bound is must-explain **even below the default 20% word rule** — the bound is the batch's claim. Both bounds, when given, must hold. |
| `reason` | Required. Shown next to every diff the rule allowed. |
| `selector`, `when` | Positive rules only (below). |

## Default severities worth knowing

- `hidden` counts elements inside `<main>` with the `hidden` attribute,
  `aria-hidden="true"`, a `hidden` / `sr-only` class (any variant prefix), or an
  inline `display:none` / `visibility:hidden`, and every `<template>` and
  `<noscript>` element — whose text is also left out of `words` and of the
  `<main>` text `lede-present` searches, so copy moved into one shows on both
  counters. An increase is must-explain on
  tool pages, `/tools/` and the category pages — judged on **either** side, so a
  page that also lost its `#playground` marker is still watched.
- `is-tool` — a page that had a `#playground` section and no longer does is
  must-explain (it would otherwise silently leave the `tool` route class).
- `sitemap` — a URL that entered or left the sitemap while its page builds on
  both sides is must-explain; when the page itself was added or removed it is
  informational (`page-added` / `page-removed` already fails). Either way it is
  **not** a re-date: `lastmod` and the re-date breakdown count only URLs listed
  on both sides.

## Rule order: first match wins

Rules are evaluated in file order, and the **first** rule whose `field`,
`pages` and `to` all match a diff decides it; its `maxDrop` / `maxDropAbs`
bounds are final, and later rules are never consulted for that diff. A diff past
the first matching rule's bound is must-explain even if a later, broader rule
would have allowed it. So put narrow tightening rules first:

```json
[
  { "field": "inbound:/tools/*", "maxDrop": 0, "reason": "the hub keeps every inbound link" },
  { "field": "inbound:*", "maxDrop": 0.5, "reason": "D trims the MegaMenu elsewhere" }
]
```

Here a 5% drop on `/tools/` fails (rule 0 decides), while a 30% drop on
`/learn/` is allowed by rule 1. Reversed, rule 1 would excuse `/tools/` too.

## Positive rules

- `lede-present` — `selector` is read on the **baseline** page (inside `<main>`);
  its whitespace-collapsed, entity-decoded text must appear verbatim in the
  candidate's `<main>` text. A baseline selector that matches nothing is itself
  must-explain, so a typo cannot pass vacuously.
- `must-contain` — the candidate page must contain an element matching
  `selector`; with `when`, only pages where `when` matches are checked.

Selectors are deliberately tiny: `tag.class[attr][attr="v"]`, and `A ~ B` for
"the first B that starts after the first A ends".

## Unused rules

A rule that matched nothing is listed under "Unused allow rules" in the report.
Prune it: an unused rule is either a typo (the change it meant to excuse went
unexcused, or never happened) or a leftover that will excuse something later.

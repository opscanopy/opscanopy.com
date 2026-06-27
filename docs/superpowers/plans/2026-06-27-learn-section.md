# OpsCanopy "Learn" Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Learn" section to OpsCanopy — a DevOps career-prep hub with long-form topic guides and vertical staged roadmaps, reusing the existing blog reading experience and design system.

**Architecture:** A new `guides` markdown content collection (mirrors `blog`) rendered by a `GuidePost.astro` component cloned from `BlogPost.astro`; roadmaps as typed data in `src/data/roadmaps.ts` rendered by a data-driven `Roadmap.astro`; a `/learn` hub backed by a `src/data/learn.ts` track registry. Three flat English-only routes under `/learn`. SEO via `TechArticle` + `BreadcrumbList` + `FAQPage` JSON-LD and guide↔tool internal links.

**Tech Stack:** Astro v6 (static), Tailwind v4 (CSS-first tokens in `global.css`), TypeScript, Vitest (node env), no UI framework (vanilla `<script>` islands).

**Spec:** `docs/superpowers/specs/2026-06-27-learn-section-design.md`

---

## File structure

**Create:**
- `src/content/guides/<track>/<slug>.md` — guide content (7 files, Phases 1–2)
- `src/data/roadmaps.ts` — roadmap types + data
- `src/data/learn.ts` — track registry
- `src/lib/learn/guides.ts` — guide collection helpers
- `src/lib/learn/learn.test.ts` — referential-integrity unit test (vitest)
- `src/components/page/GuidePost.astro` — guide article (clone of BlogPost)
- `src/components/Roadmap.astro` — vertical staged roadmap
- `src/components/learn/TrackCard.astro` — hub track card
- `src/components/learn/Callout.astro` — Note/Tip/Caution/Danger admonition
- `src/pages/learn/index.astro` — hub
- `src/pages/learn/guides/[...slug].astro` — guide route
- `src/pages/learn/roadmaps/[slug].astro` — roadmap route
- `scripts/check-learn.mjs` — link/anchor integrity check (filesystem-based)

**Modify:**
- `src/content.config.ts` — register `guides` collection
- `src/lib/jsonld.ts` — add `techArticleLd()`
- `src/i18n/site/en.ts` — add "Learn" nav link + footer column
- `src/i18n/site/{es,de,fr,pt-br}.ts` — add "Learn" only IF a partial defines its own `nav`/`footer`
- `package.json` — add `check:learn` script
- Selected tool pages (Phase 4) — reciprocal "Learn more" links

---

## Shared conventions & templates (referenced by content tasks)

### Guide frontmatter template (fill the `<…>` values per guide)

```yaml
---
title: "<H1 / page title>"
description: "<140–155 char meta description, keyword-bearing>"
track: <linux|docker|aws|kubernetes|networking|projects>
order: <integer position within the track, starting at 1>
difficulty: <beginner|intermediate|advanced>
updatedDate: 2026-06-27
tags: ["<tag1>", "<tag2>"]
relatedTools: ["<tool-slug>", "..."]   # slugs from src/data/tools.ts
seoTitle: "<≤60 char <title>>"
metaDescription: "<≤155 char meta>"
faqs:
  - q: "<People-Also-Ask question>"
    a: "<concise answer, 1–3 sentences>"
---
```

### Markdown conventions
- Body starts with a short intro paragraph (no H1 — the layout renders the H1 from `title`).
- Section headings use `##` (H2) and `###` (H3). Astro auto-generates an `id` per heading via github-slugger (lowercase, spaces→`-`, punctuation stripped). Roadmap nodes deep-link to these slugs.
- Code fences use triple backticks with a language: ```` ```bash ````, ```` ```yaml ````, ```` ```dockerfile ````.
- Callouts: write as a blockquote whose first line is a bold tag the converter maps to `<Callout>` — but since guides are plain `.md` (not `.mdx`), use this **blockquote-with-label** markdown form, styled by `.rich-text` (see Task 6 note):
  ```md
  > **Tip:** Prefer multi-stage builds to shrink final images.
  ```
  Supported labels: `Note:`, `Tip:`, `Caution:`, `Danger:`.
- Tool cross-links are inline markdown links to the tool's path, e.g.
  `Try the [Subnet Calculator](/subnet-calculator) to compute host ranges instantly.`
- Internal guide cross-links: `[Networking for DevOps](/learn/guides/networking-for-devops)`.

### Tool slugs available for `relatedTools` / inline links
`loki-alert-rule-tester`, `cve-ignore-converter`, `subnet-calculator`, `ip-address-converter`, `cidr-checker`, `mac-address-formatter`, `reverse-dns-ptr`, `subnet-splitter`, `kubernetes-resource-calculator`, `prometheus-relabel-tester`, `promql-explainer`, `logql-promql-helper`, `alertmanager-route-tester`, `docker-run-to-compose`, `env-example-checker`, `cron-expression-tester`, `cron-to-systemd`, `github-actions-validator`, `github-actions-expression-tester`, `gitlab-ci-validator`, `regex-log-tester`, `base64-encoder-decoder`, `hash-generator`, `jwt-decoder`, `timestamp-converter`.

### Per-page SEO targets (from keyword research)

| slug | track | order | difficulty | primary keyword | seoTitle | relatedTools |
|------|-------|-------|------------|-----------------|----------|--------------|
| `linux-for-devops` | linux | 1 | beginner | linux for devops | Linux for DevOps: The Complete Guide (2026) | regex-log-tester, cron-expression-tester, base64-encoder-decoder, hash-generator, reverse-dns-ptr |
| `networking-for-devops` | networking | 1 | intermediate | networking for devops | Networking for DevOps Engineers: Complete Guide | subnet-calculator, cidr-checker, subnet-splitter, ip-address-converter, reverse-dns-ptr, mac-address-formatter |
| `docker-for-devops` | docker | 1 | beginner | docker for devops | Docker for DevOps: A Complete Deep Dive Guide | docker-run-to-compose, env-example-checker, github-actions-validator, gitlab-ci-validator, kubernetes-resource-calculator |
| `docker-interview-questions` | docker | 2 | intermediate | docker interview questions for devops engineer | Docker Interview Questions for DevOps Engineers | docker-run-to-compose, kubernetes-resource-calculator, env-example-checker |
| `aws-for-devops-engineers` | aws | 1 | beginner | aws for devops engineers | AWS for DevOps Engineers: Core Services Guide | subnet-calculator, cidr-checker |
| `kubernetes-for-devops` | kubernetes | 1 | intermediate | kubernetes for devops | Kubernetes for DevOps: Core Concepts Guide | kubernetes-resource-calculator, promql-explainer, prometheus-relabel-tester |
| `devops-projects` | projects | 1 | beginner | devops project ideas for resume | Hands-On DevOps Projects (Step-by-Step) | docker-run-to-compose, github-actions-validator, prometheus-relabel-tester |

### Source HTML files (Phase 1 conversion)
- `C:\Users\PUSHKAR\Downloads\linux-master-guide.html` → `linux-for-devops`
- `C:\Users\PUSHKAR\Downloads\docker-master-guide.html` → `docker-for-devops` (**normalize Hindi/Hinglish → clean professional English**)
- `C:\Users\PUSHKAR\Downloads\devops-docker-guide.html` → `docker-interview-questions`
- `C:\Users\PUSHKAR\Downloads\devops-aws-guide.html` → `aws-for-devops-engineers`
- `C:\Users\PUSHKAR\Downloads\devops-projects-guide.html` → `devops-projects`

---

# PHASE 0 — Foundation (must complete before Phases 1–4)

## Task 1: Register the `guides` content collection

**Files:**
- Modify: `src/content.config.ts`
- Create: `src/content/guides/linux/_stub.md` (temporary, deleted in Task 15)

- [ ] **Step 1: Add the collection definition**

In `src/content.config.ts`, after the `blog` definition and before `export const collections`, add:

```ts
const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    track: z.enum(['linux', 'docker', 'aws', 'kubernetes', 'networking', 'projects']),
    order: z.number(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    updatedDate: z.coerce.date().optional(),
    estMinutes: z.number().optional(),
    tags: z.array(z.string()).optional(),
    relatedTools: z.array(z.string()).optional(),
    draft: z.boolean().default(false),
    lang: z.enum(['en', 'es', 'de', 'fr', 'pt-br']).default('en'),
    translationOf: z.string().optional(),
    author: z.string().default('OpsCanopy'),
    seoTitle: z.string().optional(),
    metaDescription: z.string().optional(),
    faqs: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  }),
});
```

Then change the export line to:

```ts
export const collections = { blog, guides };
```

- [ ] **Step 2: Create a temporary stub guide** so the collection is non-empty during foundation work.

Create `src/content/guides/linux/_stub.md`:

```md
---
title: "Stub"
description: "Temporary stub guide so the guides collection is non-empty during scaffolding."
track: linux
order: 999
difficulty: beginner
draft: true
---

Temporary stub. Deleted in Task 15.
```

- [ ] **Step 3: Verify the collection compiles**

Run: `npx astro sync`
Expected: completes with no schema errors; `.astro/` types regenerated.

- [ ] **Step 4: Commit**

```bash
git add src/content.config.ts src/content/guides/linux/_stub.md
git commit -m "feat(learn): register guides content collection"
```

---

## Task 2: Roadmap data types + Linux roadmap

**Files:**
- Create: `src/data/roadmaps.ts`

- [ ] **Step 1: Write the types + the Linux roadmap (full reference example)**

Create `src/data/roadmaps.ts`:

```ts
/**
 * Learn roadmaps — typed data driving every /learn/roadmaps/<slug> page.
 * A roadmap is a vertical staged track: ordered stages, each with nodes that
 * deep-link into a guide (guideSlug [+ anchor]) or an external/tool href.
 * Single source of truth; Roadmap.astro renders it, check-learn.mjs validates it.
 */
export type NodeKind = 'core' | 'optional';

export interface RoadmapNode {
  label: string;
  /** Slug of a guide in src/content/guides (filename without .md). */
  guideSlug?: string;
  /** github-slugger id of an H2/H3 within that guide (optional deep-link). */
  anchor?: string;
  /** External or tool href used instead of a guide link. */
  href?: string;
  kind: NodeKind;
  /** Short description shown in the node drawer. */
  desc?: string;
}

export interface RoadmapStage {
  title: string;
  summary?: string;
  nodes: RoadmapNode[];
}

export interface Roadmap {
  slug: string;
  /** Track key from learn.ts; 'devops' for the master roadmap. */
  track: string;
  title: string;
  description: string;
  stages: RoadmapStage[];
}

export const roadmaps: Roadmap[] = [
  {
    slug: 'linux',
    track: 'linux',
    title: 'Linux for DevOps Roadmap',
    description:
      'A staged path through the Linux skills DevOps engineers use daily — from the filesystem to bash automation.',
    stages: [
      {
        title: 'Foundations',
        summary: 'Get comfortable moving around a Linux system.',
        nodes: [
          { label: 'Filesystem hierarchy', guideSlug: 'linux-for-devops', anchor: 'linux-filesystem-hierarchy', kind: 'core', desc: 'Where things live: /etc, /var, /proc and friends.' },
          { label: 'File & directory operations', guideSlug: 'linux-for-devops', anchor: 'file-directory-operations', kind: 'core' },
          { label: 'File permissions & ownership', guideSlug: 'linux-for-devops', anchor: 'file-permissions-ownership', kind: 'core', desc: 'chmod, chown, and the octal model.' },
        ],
      },
      {
        title: 'Text processing',
        summary: 'The log-wrangling toolkit.',
        nodes: [
          { label: 'grep — pattern searching', guideSlug: 'linux-for-devops', anchor: 'grep-pattern-searching', kind: 'core' },
          { label: 'awk & sed', guideSlug: 'linux-for-devops', anchor: 'awk-text-processing-powerhouse', kind: 'core' },
          { label: 'Piping & redirection', guideSlug: 'linux-for-devops', anchor: 'piping-redirection', kind: 'core' },
          { label: 'Test regexes first', href: '/regex-log-tester', kind: 'optional', desc: 'Build the pattern in the browser before you grep.' },
        ],
      },
      {
        title: 'Processes & services',
        nodes: [
          { label: 'Process commands', guideSlug: 'linux-for-devops', anchor: 'process-commands', kind: 'core' },
          { label: 'systemd & services', guideSlug: 'linux-for-devops', anchor: 'systemd-services', kind: 'core' },
          { label: 'Package managers', guideSlug: 'linux-for-devops', anchor: 'package-managers', kind: 'optional' },
        ],
      },
      {
        title: 'Networking & SSH',
        nodes: [
          { label: 'Network commands', guideSlug: 'linux-for-devops', anchor: 'network-commands', kind: 'core' },
          { label: 'SSH — secure shell', guideSlug: 'linux-for-devops', anchor: 'ssh-secure-shell-critical', kind: 'core' },
          { label: 'Networking deep dive', guideSlug: 'networking-for-devops', kind: 'optional', desc: 'Continue into the Networking guide.' },
        ],
      },
      {
        title: 'Automation',
        nodes: [
          { label: 'Bash fundamentals', guideSlug: 'linux-for-devops', anchor: 'bash-fundamentals', kind: 'core' },
          { label: 'Bash control flow', guideSlug: 'linux-for-devops', anchor: 'bash-control-flow', kind: 'core' },
          { label: 'Real DevOps bash scripts', guideSlug: 'linux-for-devops', anchor: 'real-devops-bash-scripts', kind: 'core' },
        ],
      },
    ],
  },
];

export function getRoadmap(slug: string): Roadmap | undefined {
  return roadmaps.find((r) => r.slug === slug);
}
```

> Note: the `anchor` values are the github-slugger ids the Linux guide's H2 headings must produce (Task 16 lists the required headings). `check-learn.mjs` (Task 14) verifies them; the other 5 roadmaps are authored in Task 23.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors from `src/data/roadmaps.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/data/roadmaps.ts
git commit -m "feat(learn): roadmap types + Linux roadmap"
```

---

## Task 3: Learn track registry

**Files:**
- Create: `src/data/learn.ts`

- [ ] **Step 1: Write the registry**

Create `src/data/learn.ts`:

```ts
/**
 * Learn registry — single source of truth for the /learn hub grid, the Learn
 * nav, and guide↔roadmap cross-links. Mirrors the role of src/data/tools.ts.
 */
import type { ToolAccent } from './tools';

export interface Track {
  slug: string;
  name: string;
  tagline: string;
  /** Reuses the brand accent tokens used by tool cards. */
  accent: ToolAccent;
  /** Roadmap slug in roadmaps.ts (undefined → no roadmap yet). */
  roadmapSlug?: string;
  /** Ordered guide slugs (filenames without .md) belonging to this track. */
  guideSlugs: string[];
}

export const tracks: Track[] = [
  {
    slug: 'linux',
    name: 'Linux',
    tagline: 'The OS every DevOps career stands on.',
    accent: 'develop',
    roadmapSlug: 'linux',
    guideSlugs: ['linux-for-devops'],
  },
  {
    slug: 'docker',
    name: 'Docker',
    tagline: 'Build, ship, and run containers with confidence.',
    accent: 'ship',
    roadmapSlug: 'docker',
    guideSlugs: ['docker-for-devops', 'docker-interview-questions'],
  },
  {
    slug: 'kubernetes',
    name: 'Kubernetes',
    tagline: 'Orchestrate containers at scale.',
    accent: 'preview',
    roadmapSlug: 'kubernetes',
    guideSlugs: ['kubernetes-for-devops'],
  },
  {
    slug: 'aws',
    name: 'AWS',
    tagline: 'The core cloud services a DevOps engineer actually needs.',
    accent: 'ship',
    roadmapSlug: 'aws',
    guideSlugs: ['aws-for-devops-engineers'],
  },
  {
    slug: 'networking',
    name: 'Networking',
    tagline: 'TCP/IP, subnets, DNS, and troubleshooting for engineers.',
    accent: 'develop',
    roadmapSlug: 'networking',
    guideSlugs: ['networking-for-devops'],
  },
  {
    slug: 'projects',
    name: 'Hands-on Projects',
    tagline: 'Portfolio-ready, step-by-step DevOps projects.',
    accent: 'preview',
    roadmapSlug: undefined,
    guideSlugs: ['devops-projects'],
  },
];

export function getTrack(slug: string): Track | undefined {
  return tracks.find((t) => t.slug === slug);
}
```

- [ ] **Step 2: Verify `ToolAccent` import resolves**

Run: `npx tsc --noEmit`
Expected: no error (confirms `ToolAccent` is exported from `src/data/tools.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/data/learn.ts
git commit -m "feat(learn): track registry"
```

---

## Task 4: Guide collection helpers

**Files:**
- Create: `src/lib/learn/guides.ts`

- [ ] **Step 1: Write the helpers**

Create `src/lib/learn/guides.ts`:

```ts
/**
 * Guide collection helpers. Guides live at src/content/guides/<track>/<slug>.md
 * so an entry id is "<track>/<slug>". The URL slug is the filename only
 * (last path segment). Prev/next is ordered by frontmatter `order` within a track.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/config';
import { estimateReadingTime } from '../../i18n/blog';

export { estimateReadingTime };

export interface LocalizedGuide {
  entry: CollectionEntry<'guides'>;
  /** URL slug = filename without .md (last path segment of the id). */
  slug: string;
}

function slugFromId(id: string): string {
  return id.split('/').pop() ?? id;
}

/** All non-draft guides for a locale, sorted by track then order. */
export async function getGuidesForLocale(lang: Locale): Promise<LocalizedGuide[]> {
  const entries = await getCollection(
    'guides',
    (e) => !e.data.draft && (e.data.lang ?? DEFAULT_LOCALE) === lang,
  );
  return entries
    .map((entry) => ({ entry, slug: slugFromId(entry.id) }))
    .sort(
      (a, b) =>
        a.entry.data.track.localeCompare(b.entry.data.track) ||
        a.entry.data.order - b.entry.data.order,
    );
}

/** Guides in one track, ordered by `order`. */
export function getGuidesByTrack(track: string, all: LocalizedGuide[]): LocalizedGuide[] {
  return all
    .filter((g) => g.entry.data.track === track)
    .sort((a, b) => a.entry.data.order - b.entry.data.order);
}

/** Prev/next within the same track, ordered by `order`. */
export function getPrevNextInTrack(
  current: LocalizedGuide,
  all: LocalizedGuide[],
): { prev: LocalizedGuide | null; next: LocalizedGuide | null } {
  const sameTrack = getGuidesByTrack(current.entry.data.track, all);
  const idx = sameTrack.findIndex((g) => g.slug === current.slug);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? sameTrack[idx - 1] : null,
    next: idx < sameTrack.length - 1 ? sameTrack[idx + 1] : null,
  };
}

/** Up to `max` other guides, same track first then any track. */
export function getRelatedGuides(
  current: LocalizedGuide,
  all: LocalizedGuide[],
  max = 3,
): LocalizedGuide[] {
  const others = all.filter((g) => g.slug !== current.slug);
  const sameTrack = others.filter((g) => g.entry.data.track === current.entry.data.track);
  const rest = others.filter((g) => g.entry.data.track !== current.entry.data.track);
  return [...sameTrack, ...rest].slice(0, max);
}
```

- [ ] **Step 2: Type-check**

Run: `npx astro sync && npx tsc --noEmit`
Expected: no errors (confirms `CollectionEntry<'guides'>` resolves after sync).

- [ ] **Step 3: Commit**

```bash
git add src/lib/learn/guides.ts
git commit -m "feat(learn): guide collection helpers"
```

---

## Task 5: `techArticleLd` JSON-LD helper

**Files:**
- Modify: `src/lib/jsonld.ts`

- [ ] **Step 1: Append the helper**

Add to the end of `src/lib/jsonld.ts`:

```ts
/**
 * TechArticle object for a Learn guide page. Mirrors the BlogPosting shape used
 * by blog posts but typed as TechArticle (technical how-to/reference content).
 */
export function techArticleLd(o: {
  headline: string;
  description: string;
  url: string;          // absolute
  datePublished: string; // ISO
  dateModified?: string; // ISO
  keywords?: string;
  proficiencyLevel?: 'Beginner' | 'Intermediate' | 'Advanced';
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: o.headline,
    description: o.description,
    proficiencyLevel: o.proficiencyLevel,
    datePublished: o.datePublished,
    dateModified: o.dateModified ?? o.datePublished,
    keywords: o.keywords,
    mainEntityOfPage: { '@type': 'WebPage', '@id': o.url },
    author: { '@type': 'Organization', name: site.name, url: site.url },
    publisher: { '@type': 'Organization', name: site.name, url: site.url },
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/jsonld.ts
git commit -m "feat(learn): techArticleLd JSON-LD helper"
```

---

## Task 6: Callout styling for guide prose

**Files:**
- Modify: `src/components/page/GuidePost.astro` is created in Task 7 — this task adds the **callout CSS** that styles the markdown blockquote-with-label convention. Because guides are plain `.md` (not `.mdx`), callouts are authored as `> **Tip:** …` blockquotes; we style them by their leading `<strong>` label via CSS.

Add to the **global style block** that Task 7's GuidePost will carry (documented here so Task 7 includes it). The selectors live under `.rich-text` (the guide body class):

```css
/* Callouts: a blockquote whose first child paragraph starts with a bold label. */
.rich-text blockquote {
  border-left: 3px solid var(--color-hairline-strong);
  background: var(--color-canvas-soft-2);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
}
.rich-text blockquote :is(p):first-child strong:first-child {
  display: inline-block;
}
/* Tint by label keyword via :has() (supported in all evergreen browsers). */
.rich-text blockquote:has(strong:first-child) { border-left-color: var(--color-brand); }
```

> This task has no standalone deliverable; its CSS is included verbatim inside Task 7's GuidePost `<style is:global>` block. It is listed separately so the styling decision is reviewable. No commit on its own.

---

## Task 7: `GuidePost.astro` (clone of BlogPost)

**Files:**
- Create: `src/components/page/GuidePost.astro`

- [ ] **Step 1: Copy BlogPost as the starting point**

```bash
cp src/components/page/BlogPost.astro src/components/page/GuidePost.astro
```

- [ ] **Step 2: Replace the frontmatter import + data block**

Replace the entire `---…---` frontmatter of `GuidePost.astro` (everything from the opening `---` to the closing `---`) with:

```astro
---
/**
 * Learn guide article. Mirrors BlogPost.astro's reading experience (rich-text
 * prose, sticky TOC scroll-spy, reading progress, code-copy, anchors) but is
 * driven by the `guides` collection and links into related tools + guides.
 */
import { render } from 'astro:content';
import { getAbsoluteLocaleUrl } from 'astro:i18n';
import Shell from '../Shell.astro';
import Button from '../Button.astro';
import { site } from '../../data/site';
import { tools } from '../../data/tools';
import { getTrack } from '../../data/learn';
import { BCP47, type Locale } from '../../i18n/config';
import { useTranslations } from '../../i18n/utils';
import { breadcrumbLd, techArticleLd, faqPageLd } from '../../lib/jsonld';
import {
  estimateReadingTime,
  getGuidesForLocale,
  getPrevNextInTrack,
  getRelatedGuides,
  type LocalizedGuide,
} from '../../lib/learn/guides';

interface Props {
  guide: LocalizedGuide;
  lang: Locale;
}
const { guide, lang } = Astro.props;
const { entry, slug } = guide;
const d = entry.data;
const { Content, headings } = await render(entry);
const t = useTranslations(lang);

const track = getTrack(d.track);
const trackName = track?.name ?? d.track;

const canonical = `/learn/guides/${slug}`;
const absoluteUrl = `${site.url}${canonical}`;
const isoPublished = (d.updatedDate ?? new Date('2026-06-27')).toISOString();
const isoModified = d.updatedDate?.toISOString();
const readingTime = d.estMinutes ?? estimateReadingTime(entry.body);
const readingLabel = t('blog.readingTime', { minutes: readingTime });

const all = await getGuidesForLocale(lang);
const { prev, next } = getPrevNextInTrack(guide, all);
const related = getRelatedGuides(guide, all, 3);

// Resolve relatedTools slugs → tool records for the cross-link aside.
const relatedTools = (d.relatedTools ?? [])
  .map((s) => tools.find((tool) => tool.slug === s))
  .filter((x): x is (typeof tools)[number] => Boolean(x));

const toc = headings.filter((h) => h.depth === 2 || h.depth === 3);
const difficultyProficiency =
  d.difficulty === 'beginner' ? 'Beginner' : d.difficulty === 'advanced' ? 'Advanced' : 'Intermediate';

const breadcrumbJsonLd = breadcrumbLd([
  { name: 'Home', item: `${site.url}/` },
  { name: 'Learn', item: `${site.url}/learn` },
  { name: trackName, item: `${site.url}/learn#${d.track}` },
  { name: d.title, item: absoluteUrl },
]);

const articleJsonLd = techArticleLd({
  headline: d.title,
  description: d.metaDescription ?? d.description,
  url: absoluteUrl,
  datePublished: isoPublished,
  dateModified: isoModified,
  keywords: d.tags?.join(', '),
  proficiencyLevel: difficultyProficiency,
});

const jsonLd: Record<string, unknown>[] = [articleJsonLd];
if (d.faqs && d.faqs.length) jsonLd.push(faqPageLd(d.faqs));
---
```

- [ ] **Step 3: Replace the `<Shell …>` opening tag**

Find the `<Shell …>` opening tag and replace it (up to the `>`) with:

```astro
<Shell
  title={`${d.seoTitle ?? d.title} — OpsCanopy`}
  description={d.metaDescription ?? d.description}
  canonical={canonical}
  type="article"
  jsonLd={jsonLd}
  noAlternates
>
```

(`noAlternates` hides the language switcher and hreflang alternates — English-only in v1.)

- [ ] **Step 4: Replace the breadcrumb `<ol>` list items**

In the breadcrumb `<nav>`'s `<ol>`, replace its children with this 4-crumb trail:

```astro
<li><a href="/" class="rounded px-0.5 transition-colors hover:text-ink">Home</a></li>
<li aria-hidden="true">/</li>
<li><a href="/learn" class="rounded px-0.5 transition-colors hover:text-ink">Learn</a></li>
<li aria-hidden="true">/</li>
<li><a href={`/learn#${d.track}`} class="rounded px-0.5 transition-colors hover:text-ink">{trackName}</a></li>
<li aria-hidden="true">/</li>
<li class="min-w-0 truncate text-body" aria-current="page">{d.title}</li>
```

- [ ] **Step 5: Replace the "back to all posts + lang switcher" row**

Replace the `<div class="flex items-center justify-between gap-4">…</div>` row (the "all posts" link + LangSwitcher) with:

```astro
<a
  href="/learn"
  class="body-sm group -ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-mute transition-colors hover:text-ink [touch-action:manipulation]"
>
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" class="transition-transform duration-150 ease-out group-hover:-translate-x-0.5 motion-reduce:transform-none"><path d="M10 3.5 5.5 8 10 12.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
  All guides
</a>
```

- [ ] **Step 6: Replace the `<header>` metadata line**

Replace the `<p class="caption …">` author/date/reading line inside `<header>` with a difficulty + reading-time + updated row:

```astro
<p class="caption flex flex-wrap items-center gap-x-2 gap-y-1 text-mute">
  <span class="badge code-mono lowercase">{d.difficulty}</span>
  <span aria-hidden="true">·</span>
  <span class="tabular-nums">{readingLabel}</span>
  {d.updatedDate && (
    <>
      <span aria-hidden="true">·</span>
      <span>Updated {d.updatedDate.toISOString().slice(0, 10)}</span>
    </>
  )}
</p>
```

Leave the `<h1>` (use `{d.title}`) and the description `<p>` (use `{d.description}`) — update those two bindings from `entry.data.*` to `d.*`. Remove the tags `<ul>` block (tags are not surfaced on guides in v1).

- [ ] **Step 7: Replace the `relatedTool` aside with a related-tools aside**

Replace the entire `{relatedTool && (…)}` block with:

```astro
{
  relatedTools.length > 0 && (
    <aside class="mt-12 rounded-xl border border-brand/30 bg-brand/5 p-6">
      <p class="eyebrow text-brand-strong">Try the tools</p>
      <p class="body-md mt-2 text-pretty text-ink">Practice what you just read with these free, browser-based tools.</p>
      <ul role="list" class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {relatedTools.map((tool) => (
          <li>
            <a href={`/${tool.slug}`} class="card group flex flex-col p-4 transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-soft motion-reduce:transform-none">
              <span class="body-sm font-semibold text-ink group-hover:text-brand-strong">{tool.name}</span>
              <span class="mt-1 text-[13px] text-mute">{tool.tagline}</span>
            </a>
          </li>
        ))}
      </ul>
    </aside>
  )
}
```

- [ ] **Step 8: Repoint the related-posts + prev/next sections to guides**

In the related section: change `relatedPosts` → `related`, the heading text to `Related guides`, each card `href` to `{`/learn/guides/${rp.slug}`}`, the title to `{rp.entry.data.title}`, the description to `{rp.entry.data.description}`, and **remove** the date/reading-time `<p>` and the hero `<img>` block (guides have no per-post hero images in v1). In the prev/next `<nav>`: change hrefs to `{`/learn/guides/${prev.slug}`}` / `{`/learn/guides/${next.slug}`}` and titles to `{prev.entry.data.title}` / `{next.entry.data.title}`. Remove the `<ShareButtons>` blocks and the right share rail (`<aside class="hidden xl:col-start-3 …">`) — keep the layout grid but leave the right column empty for now.

- [ ] **Step 9: Add the callout CSS**

Inside the `<style is:global>` block, append the callout CSS from Task 6.

- [ ] **Step 10: Remove now-unused imports/handlers**

Remove imports and references to `LangSwitcher`, `ShareButtons`, `formatPostDate`, `getAllPosts`, `getRelatedPosts`, `getPrevNext`, `localizeKey`, `DEFAULT_LOCALE`, and the `shareUrl`/`shareXUrl`/`shareLinkedInUrl` consts. Keep the progressive-enhancement `<script>` (code-copy, anchors, TOC scroll-spy, reading progress, back-to-top) unchanged — it operates on `.rich-text` and generic selectors.

- [ ] **Step 11: Verify it builds**

Run: `npx astro check`
Expected: no errors in `GuidePost.astro` (route wiring happens in Task 10; this confirms the component type-checks).

- [ ] **Step 12: Commit**

```bash
git add src/components/page/GuidePost.astro
git commit -m "feat(learn): GuidePost article component"
```

---

## Task 8: `Roadmap.astro` (vertical staged track)

**Files:**
- Create: `src/components/Roadmap.astro`

- [ ] **Step 1: Write the component**

Create `src/components/Roadmap.astro`:

```astro
---
/**
 * Vertical staged roadmap. Renders stages as a spine of nodes; each node links
 * to a guide (guideSlug [+ anchor]) or an href. localStorage marks nodes done
 * (privacy-first, no backend). State legend + per-stage and overall progress.
 */
import type { Roadmap } from '../data/roadmaps';
interface Props { roadmap: Roadmap; }
const { roadmap } = Astro.props;

const nodeId = (s: number, n: number) => `${roadmap.slug}-${s}-${n}`;
const nodeHref = (node: { guideSlug?: string; anchor?: string; href?: string }) =>
  node.href
    ? node.href
    : node.guideSlug
      ? `/learn/guides/${node.guideSlug}${node.anchor ? `#${node.anchor}` : ''}`
      : undefined;
const totalNodes = roadmap.stages.reduce((acc, s) => acc + s.nodes.length, 0);
---

<section class="roadmap" data-roadmap={roadmap.slug} aria-label={roadmap.title}>
  <div class="mb-8 flex flex-wrap items-center gap-4">
    <p class="caption text-mute" data-roadmap-progress>0% · 0 of {totalNodes} topics</p>
    <ul class="flex flex-wrap items-center gap-3 text-[11px] text-mute" aria-label="Legend">
      <li class="inline-flex items-center gap-1.5"><span class="rm-dot rm-done"></span>Done</li>
      <li class="inline-flex items-center gap-1.5"><span class="rm-dot rm-pending"></span>To do</li>
      <li class="inline-flex items-center gap-1.5"><span class="rm-dot rm-optional"></span>Optional</li>
    </ul>
  </div>

  <ol class="rm-spine" role="list">
    {roadmap.stages.map((stage, si) => (
      <li class="rm-stage" id={`${roadmap.slug}-stage-${si}`}>
        <h2 class="display-sm text-ink">{stage.title}</h2>
        {stage.summary && <p class="body-sm mt-1 text-mute">{stage.summary}</p>}
        <ul role="list" class="mt-4 space-y-2">
          {stage.nodes.map((node, ni) => {
            const href = nodeHref(node);
            const id = nodeId(si, ni);
            return (
              <li class:list={["rm-node", node.kind === 'optional' && 'rm-node-optional']} data-node-id={id}>
                <label class="rm-check">
                  <input type="checkbox" data-node-check={id} class="sr-only" />
                  <span class="rm-dot rm-pending" data-node-dot aria-hidden="true"></span>
                </label>
                <div class="min-w-0">
                  {href ? (
                    <a href={href} class="body-sm font-medium text-ink hover:text-brand-strong">{node.label}</a>
                  ) : (
                    <span class="body-sm font-medium text-ink">{node.label}</span>
                  )}
                  {node.desc && <p class="mt-0.5 text-[13px] text-mute">{node.desc}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </li>
    ))}
  </ol>
</section>

<style>
  .rm-spine { position: relative; display: flex; flex-direction: column; gap: 2.5rem; }
  .rm-stage { position: relative; padding-left: 1.25rem; border-left: 2px solid var(--color-hairline); }
  .rm-node { display: flex; align-items: flex-start; gap: 0.625rem; }
  .rm-node-optional .rm-dot { border-style: dashed; }
  .rm-check { cursor: pointer; flex-shrink: 0; margin-top: 2px; }
  .rm-dot { display: inline-block; width: 14px; height: 14px; border-radius: 9999px; border: 2px solid var(--color-mute); background: transparent; }
  .rm-pending { border-color: var(--color-mute); }
  .rm-optional { border-color: var(--color-mute); border-style: dashed; }
  .rm-done { background: var(--color-brand); border-color: var(--color-brand); }
  .rm-node[data-done="true"] .rm-dot { background: var(--color-brand); border-color: var(--color-brand); border-style: solid; }
  .rm-node[data-done="true"] a, .rm-node[data-done="true"] span { text-decoration: line-through; color: var(--color-mute); }
  @media (prefers-reduced-motion: reduce) { .rm-dot { transition: none; } }
</style>

<script>
  function initRoadmaps() {
    document.querySelectorAll<HTMLElement>('.roadmap').forEach((root) => {
      const key = `oc-roadmap-${root.dataset.roadmap}`;
      let done: Record<string, boolean> = {};
      try { done = JSON.parse(localStorage.getItem(key) || '{}'); } catch { done = {}; }
      const nodes = Array.from(root.querySelectorAll<HTMLElement>('.rm-node'));
      const progress = root.querySelector<HTMLElement>('[data-roadmap-progress]');
      const total = nodes.length;
      const render = () => {
        let count = 0;
        nodes.forEach((n) => {
          const id = n.dataset.nodeId!;
          const checked = !!done[id];
          n.dataset.done = String(checked);
          const cb = n.querySelector<HTMLInputElement>('input[type=checkbox]');
          if (cb) cb.checked = checked;
          if (checked) count++;
        });
        if (progress) {
          const pct = total ? Math.round((count / total) * 100) : 0;
          progress.textContent = `${pct}% · ${count} of ${total} topics`;
        }
      };
      nodes.forEach((n) => {
        const cb = n.querySelector<HTMLInputElement>('input[type=checkbox]');
        cb?.addEventListener('change', () => {
          done[n.dataset.nodeId!] = cb.checked;
          try { localStorage.setItem(key, JSON.stringify(done)); } catch { /* private mode */ }
          render();
        });
      });
      render();
    });
  }
  initRoadmaps();
  document.addEventListener('astro:page-load', initRoadmaps);
</script>
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: no errors in `Roadmap.astro`.

- [ ] **Step 3: Commit**

```bash
git add src/components/Roadmap.astro
git commit -m "feat(learn): vertical staged Roadmap component"
```

---

## Task 9: `TrackCard.astro` (hub card)

**Files:**
- Create: `src/components/learn/TrackCard.astro`

- [ ] **Step 1: Write the component**

Create `src/components/learn/TrackCard.astro`:

```astro
---
import Card from '../Card.astro';
import type { Track } from '../../data/learn';

interface Props { track: Track; guideCount: number; }
const { track, guideCount } = Astro.props;
const href = track.roadmapSlug ? `/learn/roadmaps/${track.roadmapSlug}` : `/learn/guides/${track.guideSlugs[0]}`;
---
<li class="h-full" id={track.slug} data-track={track.slug}>
  <Card class="card-interactive group relative flex h-full flex-col p-5 shadow-soft">
    <div class="flex items-center justify-between gap-3">
      <h3 class="display-sm text-ink">
        <a href={href} class="rounded-sm outline-none after:absolute after:inset-0 after:content-['']">{track.name}</a>
      </h3>
      <span class="badge code-mono lowercase text-[11px] text-mute">{guideCount} guide{guideCount === 1 ? '' : 's'}</span>
    </div>
    <p class="body-sm mt-2 text-pretty text-body">{track.tagline}</p>
    <div class="mt-auto pt-5">
      <span class="link-inline body-sm inline-flex items-center gap-1 font-medium">
        {track.roadmapSlug ? 'View roadmap' : 'Read guide'}
        <span class="transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true">&rarr;</span>
      </span>
    </div>
  </Card>
</li>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/learn/TrackCard.astro
git commit -m "feat(learn): TrackCard hub card"
```

---

## Task 10: Guide route

**Files:**
- Create: `src/pages/learn/guides/[...slug].astro`

- [ ] **Step 1: Write the route**

Create `src/pages/learn/guides/[...slug].astro`:

```astro
---
import GuidePost from '../../../components/page/GuidePost.astro';
import { getGuidesForLocale } from '../../../lib/learn/guides';

export async function getStaticPaths() {
  const guides = await getGuidesForLocale('en');
  return guides.map((guide) => ({ params: { slug: guide.slug }, props: { guide } }));
}

const { guide } = Astro.props;
---
<GuidePost guide={guide} lang="en" />
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/learn/guides/[...slug].astro
git commit -m "feat(learn): guide route"
```

---

## Task 11: Roadmap route

**Files:**
- Create: `src/pages/learn/roadmaps/[slug].astro`

- [ ] **Step 1: Write the route**

Create `src/pages/learn/roadmaps/[slug].astro`:

```astro
---
import Shell from '../../../components/Shell.astro';
import Roadmap from '../../../components/Roadmap.astro';
import { roadmaps } from '../../../data/roadmaps';
import { breadcrumbLd } from '../../../lib/jsonld';
import { site } from '../../../data/site';

export function getStaticPaths() {
  return roadmaps.map((roadmap) => ({ params: { slug: roadmap.slug }, props: { roadmap } }));
}

const { roadmap } = Astro.props;
const canonical = `/learn/roadmaps/${roadmap.slug}`;
const jsonLd = breadcrumbLd([
  { name: 'Home', item: `${site.url}/` },
  { name: 'Learn', item: `${site.url}/learn` },
  { name: roadmap.title, item: `${site.url}${canonical}` },
]);
---
<Shell title={`${roadmap.title} — OpsCanopy`} description={roadmap.description} canonical={canonical} jsonLd={jsonLd} noAlternates>
  <section class="bg-canvas-soft">
    <div class="container-page py-16 sm:py-24">
      <div class="mx-auto max-w-[44rem]">
        <nav aria-label="Breadcrumb" class="mb-6">
          <ol role="list" class="caption flex flex-wrap items-center gap-x-1.5 text-mute">
            <li><a href="/" class="hover:text-ink">Home</a></li>
            <li aria-hidden="true">/</li>
            <li><a href="/learn" class="hover:text-ink">Learn</a></li>
            <li aria-hidden="true">/</li>
            <li class="text-body" aria-current="page">{roadmap.title}</li>
          </ol>
        </nav>
        <h1 class="display-lg text-balance text-ink">{roadmap.title}</h1>
        <p class="body-lg mt-5 text-pretty text-body">{roadmap.description}</p>
        <div class="mt-12">
          <Roadmap roadmap={roadmap} />
        </div>
      </div>
    </div>
  </section>
</Shell>
```

- [ ] **Step 2: Build the routes**

Run: `npx astro build`
Expected: build succeeds; `dist/learn/roadmaps/linux/index.html` exists.

- [ ] **Step 3: Commit**

```bash
git add src/pages/learn/roadmaps/[slug].astro
git commit -m "feat(learn): roadmap route"
```

---

## Task 12: `/learn` hub page

**Files:**
- Create: `src/pages/learn/index.astro`

- [ ] **Step 1: Write the hub**

Create `src/pages/learn/index.astro`:

```astro
---
import Shell from '../../components/Shell.astro';
import TrackCard from '../../components/learn/TrackCard.astro';
import { tracks } from '../../data/learn';
import { getGuidesForLocale } from '../../lib/learn/guides';
import { breadcrumbLd } from '../../lib/jsonld';
import { site } from '../../data/site';

const all = await getGuidesForLocale('en');
const guideCount = (slug: string) => all.filter((g) => g.entry.data.track === slug).length;

const canonical = '/learn';
const jsonLd = breadcrumbLd([
  { name: 'Home', item: `${site.url}/` },
  { name: 'Learn', item: `${site.url}/learn` },
]);
---
<Shell
  title="Learn DevOps: Free Roadmaps & Guides — OpsCanopy"
  description="Your free DevOps learning hub. Step-by-step roadmaps and guides for Linux, Docker, AWS, Kubernetes, and networking — plus free browser-based tools."
  canonical={canonical}
  jsonLd={jsonLd}
  noAlternates
>
  <section class="bg-canvas-soft">
    <div class="container-page py-16 sm:py-24">
      <div class="mx-auto max-w-2xl text-center">
        <h1 class="display-lg text-balance text-ink">Learn DevOps — Free Roadmaps & Hands-On Guides</h1>
        <p class="body-lg mt-5 text-pretty text-body">
          Practical, no-fluff guides and career roadmaps for Linux, Docker, AWS, Kubernetes, and networking — with free, browser-based tools to practice as you go.
        </p>
        <a href="/learn/roadmaps/devops" class="btn btn-primary mt-8 inline-flex">Start with the DevOps roadmap</a>
      </div>

      <ul role="list" class="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {tracks.map((track) => <TrackCard track={track} guideCount={guideCount(track.slug)} />)}
      </ul>
    </div>
  </section>
</Shell>
```

- [ ] **Step 2: Build**

Run: `npx astro build`
Expected: build succeeds; `dist/learn/index.html` exists.

- [ ] **Step 3: Commit**

```bash
git add src/pages/learn/index.astro
git commit -m "feat(learn): hub landing page"
```

---

## Task 13: Nav + footer integration

**Files:**
- Modify: `src/i18n/site/en.ts`
- Possibly modify: `src/i18n/site/{es,de,fr,pt-br}.ts`

- [ ] **Step 1: Add the Learn nav link (English)**

In `src/i18n/site/en.ts`, change the `nav` array to:

```ts
  nav: [
    { href: '/tools', label: 'Tools' },
    { href: '/learn', label: 'Learn' },
    { href: '/blog', label: 'Blog' },
  ],
```

- [ ] **Step 2: Add a Learn footer column (English)**

In the same file's `footer` array, insert after the "Tools" column:

```ts
    {
      title: 'Learn',
      links: [
        { href: '/learn', label: 'All guides' },
        { href: '/learn/roadmaps/devops', label: 'DevOps roadmap' },
        { href: '/learn/guides/linux-for-devops', label: 'Linux for DevOps' },
        { href: '/learn/guides/docker-for-devops', label: 'Docker for DevOps' },
      ],
    },
```

- [ ] **Step 3: Propagate to locale partials that override nav/footer**

Run: `grep -l "nav:\|footer:" src/i18n/site/es.ts src/i18n/site/de.ts src/i18n/site/fr.ts src/i18n/site/pt-br.ts`
For each file listed: if it defines its own `nav`, add `{ href: '/learn', label: 'Learn' }` between Tools and Blog; if it defines its own `footer`, add the same Learn column (labels may stay English or be translated). If a file does NOT define `nav`/`footer`, it inherits English automatically — leave it.

- [ ] **Step 4: Build + visually confirm**

Run: `npx astro build`
Expected: build succeeds. Then `npm run dev` and confirm "Learn" appears in the header nav (linking to `/learn`) and the footer shows a Learn column, in light and dark themes.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/site/
git commit -m "feat(learn): add Learn to nav and footer"
```

---

## Task 14: Referential-integrity test + link/anchor check script

**Files:**
- Create: `src/lib/learn/learn.test.ts`
- Create: `scripts/check-learn.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the vitest unit test (pure data relationships)**

Create `src/lib/learn/learn.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { tracks } from '../../data/learn';
import { roadmaps } from '../../data/roadmaps';
import { tools } from '../../data/tools';

const toolSlugs = new Set(tools.map((t) => t.slug));
const trackSlugs = new Set(tracks.map((t) => t.slug));

describe('learn registry ↔ roadmaps integrity', () => {
  it('every roadmap.track (except devops) maps to a registry track', () => {
    for (const r of roadmaps) {
      if (r.track === 'devops') continue;
      expect(trackSlugs.has(r.track), `roadmap "${r.slug}" → unknown track "${r.track}"`).toBe(true);
    }
  });

  it('every track.roadmapSlug points to an existing roadmap', () => {
    const roadmapSlugs = new Set(roadmaps.map((r) => r.slug));
    for (const t of tracks) {
      if (!t.roadmapSlug) continue;
      expect(roadmapSlugs.has(t.roadmapSlug), `track "${t.slug}" → missing roadmap "${t.roadmapSlug}"`).toBe(true);
    }
  });

  it('every roadmap node has a target (guideSlug or href) and a valid kind', () => {
    for (const r of roadmaps) {
      for (const s of r.stages) {
        for (const n of s.nodes) {
          expect(Boolean(n.guideSlug || n.href), `node "${n.label}" in "${r.slug}" has no target`).toBe(true);
          expect(['core', 'optional']).toContain(n.kind);
        }
      }
    }
  });

  it('every node href that is a tool path resolves to a real tool', () => {
    for (const r of roadmaps) {
      for (const s of r.stages) {
        for (const n of s.nodes) {
          if (n.href && n.href.startsWith('/') && !n.href.startsWith('/learn')) {
            const slug = n.href.slice(1);
            expect(toolSlugs.has(slug), `node "${n.label}" → unknown tool "${slug}"`).toBe(true);
          }
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/lib/learn/learn.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: Write the filesystem link/anchor check script**

Create `scripts/check-learn.mjs`:

```js
/**
 * Validates Learn cross-references against the actual guide files:
 *  - every roadmap node guideSlug + every learn.ts guideSlug has a .md file
 *  - every roadmap node anchor matches a github-slugger id of an H2/H3 heading
 * Run: node scripts/check-learn.mjs   (exit 1 on any failure)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import GithubSlugger from 'github-slugger';
import { tracks } from '../src/data/learn.ts';
import { roadmaps } from '../src/data/roadmaps.ts';

const GUIDES_DIR = 'src/content/guides';

// Map slug (filename) → { headings: Set<sluggedId> }
const guides = new Map();
for (const track of readdirSync(GUIDES_DIR, { withFileTypes: true })) {
  if (!track.isDirectory()) continue;
  for (const file of readdirSync(join(GUIDES_DIR, track.name))) {
    if (!file.endsWith('.md') || file.startsWith('_')) continue;
    const slug = file.replace(/\.md$/, '');
    const raw = readFileSync(join(GUIDES_DIR, track.name, file), 'utf8');
    const body = raw.replace(/^---[\s\S]*?---/, '');
    const slugger = new GithubSlugger();
    const headings = new Set();
    for (const m of body.matchAll(/^#{2,3}\s+(.+)$/gm)) {
      headings.add(slugger.slug(m[1].replace(/[#*`]/g, '').trim()));
    }
    guides.set(slug, { headings });
  }
}

const errors = [];
for (const t of tracks) {
  for (const slug of t.guideSlugs) {
    if (!guides.has(slug)) errors.push(`learn.ts track "${t.slug}" → missing guide file "${slug}.md"`);
  }
}
for (const r of roadmaps) {
  for (const s of r.stages) {
    for (const n of s.nodes) {
      if (!n.guideSlug) continue;
      const g = guides.get(n.guideSlug);
      if (!g) { errors.push(`roadmap "${r.slug}" node "${n.label}" → missing guide "${n.guideSlug}.md"`); continue; }
      if (n.anchor && !g.headings.has(n.anchor)) {
        errors.push(`roadmap "${r.slug}" node "${n.label}" → anchor "#${n.anchor}" not found in ${n.guideSlug}.md`);
      }
    }
  }
}

if (errors.length) {
  console.error('check-learn FAILED:\n' + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log('check-learn OK');
```

- [ ] **Step 4: Ensure `github-slugger` is available**

Run: `node -e "require.resolve('github-slugger')"` — if it errors, run `npm i -D github-slugger`.

- [ ] **Step 5: Add the npm script**

In `package.json` `"scripts"`, add:

```json
"check:learn": "node scripts/check-learn.mjs"
```

> Note: at this point the script will report missing guide files (guides arrive in Phases 1–2) — that is expected. The script must pass at the end of Phase 4 (Task 26).

- [ ] **Step 6: Commit**

```bash
git add src/lib/learn/learn.test.ts scripts/check-learn.mjs package.json package-lock.json
git commit -m "test(learn): referential-integrity test + link/anchor check script"
```

---

## Task 15: Foundation checkpoint — remove stub, verify

**Files:**
- Delete: `src/content/guides/linux/_stub.md`

- [ ] **Step 1: Delete the stub**

```bash
git rm src/content/guides/linux/_stub.md
```

- [ ] **Step 2: Full build + unit tests**

Run: `npm run build && npx vitest run src/lib/learn/learn.test.ts`
Expected: build succeeds (empty guides collection is allowed), tests PASS. `/learn`, `/learn/roadmaps/linux` render.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(learn): remove scaffolding stub guide"
```

**Phase 0 complete — the contract (collection, registry, components, routes, nav, tests) is in place. Phases 1–3 can run in parallel.**

---

# PHASE 1 — Convert the 5 provided guides (parallelizable: one task per file)

Each task converts one source HTML file (see "Source HTML files" in conventions) into one markdown guide. The procedure is identical; only the inputs differ.

**Conversion procedure (apply in every Phase-1 task):**
1. Read the source HTML file fully.
2. Extract the body content; discard the source's `<head>`, inline `<style>`, and scripts.
3. Convert to clean markdown: `<h2>`→`##`, `<h3>`→`###`, `<pre><code>`→fenced code blocks with a language hint, tables→markdown tables, `<ul>/<ol>`→markdown lists, callout boxes→the `> **Tip:**` blockquote convention.
4. Strip the source H1 (the layout renders it from `title`).
5. Add frontmatter using the template + the row from the per-page SEO table.
6. Populate `faqs` with 4–8 People-Also-Ask questions for that page (from the keyword research; concise answers).
7. Insert inline tool cross-links from `relatedTools` at the natural spots (e.g., Networking guide → subnet calculator in the subnetting section).
8. Add a short "Related guides" sentence linking the cluster partner where noted.
9. Verify the file builds and (for Linux) that required heading anchors exist.

## Task 16: Convert Linux guide

**Files:**
- Create: `src/content/guides/linux/linux-for-devops.md`

- [ ] **Step 1: Convert** `C:\Users\PUSHKAR\Downloads\linux-master-guide.html` per the procedure. Frontmatter from the `linux-for-devops` row.
- [ ] **Step 2: REQUIRED heading anchors** — the Linux roadmap (Task 2) deep-links to these github-slugger ids; ensure the guide contains H2/H3 headings that slugify to exactly:
  `linux-filesystem-hierarchy`, `file-directory-operations`, `file-permissions-ownership`, `grep-pattern-searching`, `awk-text-processing-powerhouse`, `piping-redirection`, `process-commands`, `systemd-services`, `package-managers`, `network-commands`, `ssh-secure-shell-critical`, `bash-fundamentals`, `bash-control-flow`, `real-devops-bash-scripts`.
  (e.g. a heading `## Linux Filesystem Hierarchy` → `linux-filesystem-hierarchy`; `## SSH — Secure Shell (CRITICAL)` → `ssh-secure-shell-critical`. Verify with the check script.)
- [ ] **Step 3: Verify**

Run: `npx astro build && node scripts/check-learn.mjs`
Expected: build succeeds; check-learn reports no errors for `linux-for-devops` anchors (other guides may still be missing — acceptable until Phase 4).

- [ ] **Step 4: Commit**

```bash
git add src/content/guides/linux/linux-for-devops.md
git commit -m "content(learn): Linux for DevOps guide"
```

## Task 17: Convert Docker deep-dive guide

**Files:**
- Create: `src/content/guides/docker/docker-for-devops.md`

- [ ] **Step 1: Convert** `C:\Users\PUSHKAR\Downloads\docker-master-guide.html`. Frontmatter from the `docker-for-devops` row.
- [ ] **Step 2: NORMALIZE LANGUAGE** — the source mixes Hindi/Hinglish (e.g. section titles like "Ek Container Ki Poori Kahaani"). Rewrite ALL such phrasing into clean, professional English while preserving technical accuracy and structure.
- [ ] **Step 3: Add a "Related guides" link** to `/learn/guides/docker-interview-questions` (cluster partner) and a closing pointer to `/learn/guides/kubernetes-for-devops`.
- [ ] **Step 4: Verify**

Run: `npx astro build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/content/guides/docker/docker-for-devops.md
git commit -m "content(learn): Docker for DevOps deep-dive guide (normalized to English)"
```

## Task 18: Convert Docker interview-prep guide

**Files:**
- Create: `src/content/guides/docker/docker-interview-questions.md`

- [ ] **Step 1: Convert** `C:\Users\PUSHKAR\Downloads\devops-docker-guide.html`. Frontmatter from the `docker-interview-questions` row.
- [ ] **Step 2:** Frame as scenario-based Q&A; add `faqs` from the Docker-interview PAA list; link back to `/learn/guides/docker-for-devops` ("study the concepts first").
- [ ] **Step 3: Verify** — `npx astro build` succeeds.
- [ ] **Step 4: Commit**

```bash
git add src/content/guides/docker/docker-interview-questions.md
git commit -m "content(learn): Docker interview questions guide"
```

## Task 19: Convert AWS guide

**Files:**
- Create: `src/content/guides/aws/aws-for-devops-engineers.md`

- [ ] **Step 1: Convert** `C:\Users\PUSHKAR\Downloads\devops-aws-guide.html`. Frontmatter from the `aws-for-devops-engineers` row. Link `subnet-calculator`/`cidr-checker` in the VPC section.
- [ ] **Step 2: Verify** — `npx astro build` succeeds.
- [ ] **Step 3: Commit**

```bash
git add src/content/guides/aws/aws-for-devops-engineers.md
git commit -m "content(learn): AWS for DevOps engineers guide"
```

## Task 20: Convert DevOps projects guide

**Files:**
- Create: `src/content/guides/projects/devops-projects.md`

- [ ] **Step 1: Convert** `C:\Users\PUSHKAR\Downloads\devops-projects-guide.html`. Frontmatter from the `devops-projects` row. Emphasize the "deploy a containerized app to EC2 (Docker + GitHub Actions)" project — the most winnable keyword.
- [ ] **Step 2: Verify** — `npx astro build` succeeds.
- [ ] **Step 3: Commit**

```bash
git add src/content/guides/projects/devops-projects.md
git commit -m "content(learn): hands-on DevOps projects guide"
```

---

# PHASE 2 — Author the 2 new guides (parallelizable)

These are written from scratch to match the depth, structure, and conventions of the converted guides. Each must be technically accurate, use fenced code blocks, include `faqs`, and link the listed tools.

## Task 21: Author Kubernetes guide

**Files:**
- Create: `src/content/guides/kubernetes/kubernetes-for-devops.md`

- [ ] **Step 1: Write the guide.** Frontmatter from the `kubernetes-for-devops` row. Cover, with YAML + `kubectl` examples: cluster architecture; Pods; Deployments & ReplicaSets; Services (ClusterIP/NodePort/LoadBalancer); Ingress; ConfigMaps & Secrets; resource requests & limits + QoS classes; namespaces; rollouts; troubleshooting (`kubectl describe`/`logs`). Feature `[Kubernetes Resource Calculator](/kubernetes-resource-calculator)` prominently in the requests/limits section. Add `faqs` from the K8s PAA list. Link back to `/learn/guides/docker-for-devops` and `/learn/guides/aws-for-devops-engineers` (EKS).
- [ ] **Step 2: Verify** — `npx astro build` succeeds.
- [ ] **Step 3: Commit**

```bash
git add src/content/guides/kubernetes/kubernetes-for-devops.md
git commit -m "content(learn): Kubernetes for DevOps guide"
```

## Task 22: Author Networking guide

**Files:**
- Create: `src/content/guides/networking/networking-for-devops.md`

- [ ] **Step 1: Write the guide.** Frontmatter from the `networking-for-devops` row. Cover: the OSI/TCP-IP model; IP addressing (public/private); **subnets & CIDR** (feature `[Subnet Calculator](/subnet-calculator)`, `[CIDR Checker](/cidr-checker)`, `[Subnet Splitter](/subnet-splitter)`); TCP vs UDP; DNS & record types (link `[Reverse DNS / PTR](/reverse-dns-ptr)`); HTTP/HTTPS basics; load balancing (L4 vs L7) & reverse proxies; firewalls/security groups; troubleshooting commands (ping/traceroute/dig/ss/tcpdump/curl). Add `faqs` from the networking PAA list. Cross-link `/learn/guides/linux-for-devops`.
- [ ] **Step 2: Verify** — `npx astro build` succeeds.
- [ ] **Step 3: Commit**

```bash
git add src/content/guides/networking/networking-for-devops.md
git commit -m "content(learn): Networking for DevOps guide"
```

---

# PHASE 3 — Author the remaining roadmaps

## Task 23: Author the docker, kubernetes, aws, networking, and devops roadmaps

**Files:**
- Modify: `src/data/roadmaps.ts`

- [ ] **Step 1: Append 5 roadmap objects** to the `roadmaps` array, following the `Roadmap` type and the Linux example exactly. Each node uses `guideSlug` + (optionally) `anchor` that matches a real H2/H3 in the converted/authored guide — verify slugs with `node scripts/check-learn.mjs` and adjust anchors to match the actual headings (omit `anchor` to link to the guide top if unsure).

  Author these (stages → nodes):
  - **`docker`** (track `docker`, guide `docker-for-devops`): Foundations (containers vs VMs, what is Docker, install) → Images (images & layers, Dockerfile basics, efficient Dockerfiles) → Build (multi-stage builds) → Runtime (networking, volumes, compose) → Interview prep (node → guide `docker-interview-questions`, kind `optional`).
  - **`kubernetes`** (track `kubernetes`, guide `kubernetes-for-devops`): Core objects (pods, deployments, services) → Config (configmaps, secrets) → Networking (ingress) → Resources (requests/limits, QoS; optional node → `/kubernetes-resource-calculator`) → Operations (rollouts, troubleshooting).
  - **`aws`** (track `aws`, guide `aws-for-devops-engineers`): Fundamentals (regions/AZs, IAM) → Compute (EC2, Lambda) → Networking (VPC; optional node → `/subnet-calculator`) → Storage (S3, EBS) → Databases (RDS, DynamoDB) → Guardrails (cost & security).
  - **`networking`** (track `networking`, guide `networking-for-devops`): Models (OSI/TCP-IP) → Addressing (IP, subnets & CIDR; optional nodes → `/subnet-calculator`, `/cidr-checker`) → Name resolution (DNS) → Transport & app (TCP/UDP, HTTP) → Edge (load balancing, firewalls) → Troubleshooting (commands).
  - **`devops`** (track `devops`, master): Foundations (node → guide `linux-for-devops`; node → guide `networking-for-devops`) → Version control (Git — kind `core`, no guide yet, `desc` only) → Containers (node → `docker-for-devops`) → Cloud (node → `aws-for-devops-engineers`) → Orchestration (node → `kubernetes-for-devops`) → CI/CD (optional nodes → `/github-actions-validator`, `/gitlab-ci-validator`) → Observability (optional nodes → `/promql-explainer`, `/loki-alert-rule-tester`) → Build a portfolio (node → guide `devops-projects`).

- [ ] **Step 2: Verify**

Run: `npx vitest run src/lib/learn/learn.test.ts && npx astro build && node scripts/check-learn.mjs`
Expected: tests PASS, build succeeds, check-learn reports OK (all guides now exist).

- [ ] **Step 3: Commit**

```bash
git add src/data/roadmaps.ts
git commit -m "content(learn): docker, kubernetes, aws, networking, and master devops roadmaps"
```

---

# PHASE 4 — Integrate & verify

## Task 24: Reciprocal tool→guide links

**Files:**
- Modify: selected `src/pages/<tool>.astro` pages (the "next-step" / cross-link band)

- [ ] **Step 1:** For these tools, add a single contextual link to the matching guide in the page's existing dark next-step band or reference section (do not restructure the page):
  - `subnet-calculator`, `cidr-checker`, `subnet-splitter`, `reverse-dns-ptr` → `/learn/guides/networking-for-devops`
  - `kubernetes-resource-calculator` → `/learn/guides/kubernetes-for-devops`
  - `docker-run-to-compose` → `/learn/guides/docker-for-devops`
  - `regex-log-tester` → `/learn/guides/linux-for-devops`
  Use the wording: `New to this? Read our [&lt;Guide title&gt;](/learn/guides/&lt;slug&gt;).`
- [ ] **Step 2: Verify** — `npx astro build` succeeds.
- [ ] **Step 3: Commit**

```bash
git add src/pages
git commit -m "feat(learn): reciprocal tool→guide cross-links"
```

## Task 25: Per-track OG images

**Files:**
- Modify: `scripts/gen-og-images.mjs` (or add a static default)

- [ ] **Step 1:** Inspect `scripts/gen-og-images.mjs`. If it templates blog OG PNGs, extend it to emit a `/learn/<slug>-og.png` per guide using the track name + guide title on the brand background; wire `GuidePost.astro`'s `<Shell image=…>` to that path. If extending is non-trivial, instead ship one static `public/learn/og-default.png` (brand + "OpsCanopy Learn") and set it as the default `image` for all Learn pages. Pick the simpler option that produces a valid social card.
- [ ] **Step 2: Verify** — `npm run build` succeeds; the OG image path resolves in `dist/`.
- [ ] **Step 3: Commit**

```bash
git add scripts public src/components/page/GuidePost.astro
git commit -m "feat(learn): social/OG images for Learn pages"
```

## Task 26: Final verification

- [ ] **Step 1: Full gate**

Run: `npm run build && npx vitest run && node scripts/check-learn.mjs`
Expected: build succeeds; ALL tests pass; check-learn prints `check-learn OK`.

- [ ] **Step 2: Manual pass** (`npm run dev`): verify on `/learn`, one guide (e.g. `/learn/guides/networking-for-devops`), and one roadmap (`/learn/roadmaps/devops`):
  - Light + dark themes, mobile width
  - TOC scroll-spy + code-copy + reading progress on the guide
  - Roadmap checkbox progress persists across reload (localStorage)
  - Related-tools aside links work; breadcrumbs correct
  - "Learn" in header nav + footer column

- [ ] **Step 3: SEO sanity** — view-source on a guide: unique `<title>`, meta description present, `TechArticle` + `BreadcrumbList` (+ `FAQPage` if faqs) JSON-LD present; page appears in `dist/sitemap-*.xml`.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore(learn): final verification pass"
```

---

## Self-review notes (completed by plan author)

- **Spec coverage:** hub/guide/roadmap routes (Tasks 10–12), collection + schema (Task 1), roadmap data + 6 roadmaps (Tasks 2, 23), registry (Task 3), GuidePost reuse (Task 7), Roadmap component with localStorage progress + legend + node states (Task 8), callouts (Task 6/7), nav + footer (Task 13), SEO titles/meta/JSON-LD/FAQ (Tasks 5, 7, 16–22), internal linking both directions (Tasks 16–22, 24), i18n English-first via `noAlternates` (Tasks 7, 11, 12), tests + anchor check (Task 14, 26), 7 guides (Tasks 16–22). All spec sections map to a task.
- **Type consistency:** `LocalizedGuide{entry,slug}`, `getGuidesForLocale`/`getPrevNextInTrack`/`getRelatedGuides`, `Track{slug,name,tagline,accent,roadmapSlug?,guideSlugs}`, `Roadmap/RoadmapStage/RoadmapNode{label,guideSlug?,anchor?,href?,kind,desc?}`, `techArticleLd(...)` are used identically across tasks.
- **Known acceptable interim state:** `check-learn.mjs` reports missing guides until Phase 1–2 land; it must pass at Task 26.
- **Roadmap anchors** are a cross-task contract: Task 16 lists the exact Linux heading slugs; Task 23 reconciles other roadmap anchors against real guide headings via the check script.

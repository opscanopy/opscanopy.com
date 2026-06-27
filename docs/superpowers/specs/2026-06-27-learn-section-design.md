# OpsCanopy "Learn" Section — Design Spec

**Date:** 2026-06-27
**Status:** Approved design → ready for implementation planning
**Author:** brainstorming session

---

## 1. Overview & goals

Add a new top-level **Learn** section to OpsCanopy: a DevOps career-prep hub combining **career roadmaps**, **long-form topic guides**, and **prep notes**. It serves DevOps engineers and adjacent roles (networking, SRE, cloud, platform) who are learning or preparing for interviews.

**Primary goals**
1. Ship a premium, on-brand learning experience that reuses OpsCanopy's existing design system and reading components.
2. Drive organic search traffic via long-form, keyword-targeted content — the site is new (~2 weeks old) and needs SEO-winnable pages.
3. Build a tight internal topic cluster that funnels guide readers into the existing free browser tools (the site's utility/conversion endpoints).

**Non-goals (v1)**
- Multi-language guides (English-first; system is i18n-ready).
- Accounts, server-side progress, or any backend (site stays 100% static, privacy-first).
- A "Learn" mega-menu (simple nav link in v1).

---

## 2. Locked decisions

| Decision | Choice |
|----------|--------|
| Section name | **Learn** (top-level nav: Tools · Blog · Learn) |
| v1 scope | Integrate 5 provided guides **+** author 2 new guides (Kubernetes, Networking) **+** roadmaps |
| Docker guides | Two distinct pages (Deep Reference + Interview Prep); normalize Hinglish → clean English |
| Languages | English-first; schema carries `lang`/`translationOf` for later translation |
| Architecture | **A** — markdown `guides` content collection + data-driven roadmaps |
| Roadmap style | **Vertical staged track** (named stages, nodes deep-link into guides) |

---

## 3. Information architecture & routing

Three page types, flat URLs mirroring the existing `/blog/<slug>` pattern. English-only routes for v1 (no `[lang]/learn/...`).

| Page | Route file | URL |
|------|-----------|-----|
| Hub | `src/pages/learn/index.astro` | `/learn` |
| Guide | `src/pages/learn/guides/[...slug].astro` | `/learn/guides/<slug>` |
| Roadmap | `src/pages/learn/roadmaps/[slug].astro` | `/learn/roadmaps/<track>` |

- Guide paths come from `getStaticPaths` over the `guides` collection (mirrors `blog/[...slug].astro`).
- Roadmap paths come from `getStaticPaths` over `roadmaps` data.
- `hideLangSwitcher` is set on all Learn pages in v1 (same approach as the WASM demo page).

**Tracks (v1):** Linux · Docker · AWS · Kubernetes · Networking · Hands-on Projects, plus an overarching **DevOps** roadmap. Topic roadmaps stand alone so adjacent roles get value without a DevOps framing.

---

## 4. Content set (v1)

### Guides — markdown in the new `guides` collection

| Slug (`/learn/guides/…`) | Source | Track | Notes |
|--------------------------|--------|-------|-------|
| `linux-for-devops` | linux-master-guide.html (45 §) | Linux | Convert HTML → markdown |
| `docker-for-devops` | docker-master-guide.html (71 §) | Docker | Convert + **normalize Hinglish → clean English** |
| `docker-interview-questions` | devops-docker-guide.html (11 §) | Docker | Convert; interview/scenario framing |
| `aws-for-devops-engineers` | devops-aws-guide.html (9 §) | AWS | Convert HTML → markdown |
| `devops-projects` | devops-projects-guide.html | Projects | Convert; hands-on, step-by-step |
| `kubernetes-for-devops` | **authored new** | Kubernetes | Match converted depth/format |
| `networking-for-devops` | **authored new** | Networking | Match converted depth/format |

Each large source becomes **one** guide page (deep TOC handles navigation), preserving the authors' structure. Multi-part splitting (e.g. per-project child pages under `devops-projects`) is a future SEO option, not v1.

### Roadmaps — typed data in `src/data/roadmaps.ts`

`devops` (master, threads across tracks) + `linux`, `docker`, `aws`, `kubernetes`, `networking`.

---

## 5. Content model

### 5.1 `guides` collection (`src/content.config.ts`)

Add alongside the existing `blog` collection, same glob loader:

```ts
const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    track: z.enum(['linux', 'docker', 'aws', 'kubernetes', 'networking', 'projects']),
    order: z.number(),                 // position within track (prev/next + roadmap order)
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    updatedDate: z.coerce.date().optional(),
    estMinutes: z.number().optional(), // else computed from body word count
    tags: z.array(z.string()).optional(),
    relatedTools: z.array(z.string()).optional(), // tool slugs → cross-link asides
    draft: z.boolean().default(false),
    lang: z.enum(['en', 'es', 'de', 'fr', 'pt-br']).default('en'),
    translationOf: z.string().optional(),
    author: z.string().default('OpsCanopy'),
    // SEO overrides (else derived from title/description)
    seoTitle: z.string().optional(),
    metaDescription: z.string().optional(),
    faqs: z.array(z.object({ q: z.string(), a: z.string() })).optional(), // → FAQPage JSON-LD
  }),
});
export const collections = { blog, guides };
```

### 5.2 Roadmap data (`src/data/roadmaps.ts`)

```ts
export type NodeKind = 'core' | 'optional';
export interface RoadmapNode {
  label: string;
  guideSlug?: string;   // links to /learn/guides/<guideSlug>
  anchor?: string;      // deep-link to a heading id within that guide
  href?: string;        // external/tool link instead of a guide
  kind: NodeKind;       // core = solid node, optional = dashed node
  desc?: string;        // short description shown in the node drawer
}
export interface RoadmapStage { title: string; summary?: string; nodes: RoadmapNode[]; }
export interface Roadmap {
  slug: string; track: string; title: string; description: string;
  stages: RoadmapStage[];
}
export const roadmaps: Roadmap[];
```

### 5.3 Learn registry (`src/data/learn.ts`)

Mirrors `tools.ts`. Single source of truth for the hub grid, nav, cross-links:

```ts
export interface Track {
  slug: string;          // 'linux'
  name: string;          // 'Linux'
  tagline: string;
  accent: 'develop' | 'preview' | 'ship'; // reuse existing accent tokens
  icon: string;          // icon key
  roadmapSlug: string;   // '/learn/roadmaps/linux'
  guideSlugs: string[];  // ordered guides in this track
}
export const tracks: Track[];
```

---

## 6. Components & layout (reuse-first)

The blog's `BlogPost.astro` already implements the premium reading experience we want. We clone and extend rather than reinvent.

| New component | Based on | Key differences |
|---------------|----------|-----------------|
| `src/components/page/GuidePost.astro` | `BlogPost.astro` | Reuses `.rich-text` prose styles, sticky TOC + `IntersectionObserver` scroll-spy, reading-progress bar, heading anchors, code-copy script, prev/next. Breadcrumb **Home / Learn / {Track} / {Title}**. `TechArticle` + `BreadcrumbList` + optional `FAQPage` JSON-LD. "Related tools" cross-link aside (from `relatedTools`) replacing the single blog CTA. Difficulty pill + reading-time + "Last updated" in the header. |
| `src/components/Roadmap.astro` | new | Vertical staged track (§7). |
| `src/components/learn/TrackCard.astro` | `Card.astro` / `ToolCard.astro` | Track card with level + duration + guide-count metadata. |
| `src/components/learn/Callout.astro` | new | 4 semantic variants: Note / Tip / Caution / Danger (§9.2). |
| `src/pages/learn/index.astro` | `tools/index.astro` patterns | Hub (§8). |

**Prose styling:** reuse the existing global `.rich-text` block (already covers headings, code blocks, inline code, blockquotes, lists, images, links, dark-mode tokens). Extend it (not replace) for callouts and code-tab/filename chrome.

---

## 7. Roadmap design (vertical staged track)

A central vertical "spine" the learner walks top → bottom, chunked into **4–6 named stages**.

- **Stages** group nodes ("Foundations", "Core", "Advanced", …) with a stage header + optional per-stage progress bar.
- **Node states — 4, distinguished by hue AND fill** (not shade alone): `Done` = solid emerald `#10b981`; `In Progress` = amber outline + dot; `Pending` = neutral outline; `Skipped` = desaturated/greyed. **Always render a legend.**
- **Core vs optional:** core nodes solid; optional nodes **dashed border**.
- **Progress:** "X% · N of M topics" in the header; persisted in `localStorage` (per-browser, no accounts). A visible checkbox/control on each node is the primary "mark done" path.
- **Node interaction:** clicking a node opens a **side drawer / bottom-sheet** with the topic description + a "Read the guide →" deep link (`/learn/guides/<slug>#anchor`) + "Mark as Done" — the diagram stays intact.
- **Deep-linkable nodes:** each node/stage has a stable `#anchor` so it's shareable and guides can link back ("you are here").
- **Mobile:** a first-class **linear stepper / accordion** of the same stages and tappable nodes — never a pinch-zoom of the desktop graphic.
- **Reduced motion / a11y:** honor `prefers-reduced-motion`; keyboard-operable nodes; legend readable by screen readers.

---

## 8. Hub design (`/learn`)

- **Hero = orientation, not marketing:** H1 + one-line value prop + a search field, then drop straight into the catalog on the second scroll.
- **Dual taxonomy:** "Learn by topic" (Linux, Docker, AWS, Kubernetes, Networking, Projects) as the primary grid; the master **DevOps roadmap** featured as the orientation CTA. (Role-based grouping — SRE / Platform / Cloud — is a future enhancement.)
- **Track cards:** icon + title + one-line "who this is for" + **difficulty badge + total time + guide count** (computed at build). One CTA per card. No more than level + duration + count + tags.
- **Client-side filter chips** (topic/level) toggling card visibility via `data-*` attributes + ~15 lines of vanilla JS (same spirit as the MegaMenu search). No backend.
- **Per-card "✓ Read" memory** via `localStorage` (privacy-first), optional thin progress indicator.
- **Quiet, real trust strip** (guides published, last-updated cadence) — no vanity metrics.
- **Empty states designed** (no search results → "try a topic chip"; coming-soon tracks greyed with a badge, not hidden).

---

## 9. Premium UI/UX requirements

### 9.1 Guide page layout
- **Three-column grid, sticky rails** (already in `BlogPost`): left = track/section nav (~240–280px, collapsible, current item highlighted = "where am I in the track"); center content capped ~`max-w-[44rem]` for a comfortable measure; right = "On this page" TOC (~200–240px). Pure CSS Grid; zero JS for layout.
- **Scroll-spy TOC** via `IntersectionObserver` (already implemented) + `aria-current`.
- **Breadcrumbs** top; **prev/next footer** showing the page *title*, ordered by `track` + `order`.
- **Header metadata:** difficulty pill + reading time + "Last updated" date (a differentiator — competitors omit these).

### 9.2 Content components
- **Code blocks:** filename/"Terminal" header bar + copy button (copy already implemented; add the header chrome). `scroll-margin-top` on headings for clean anchor jumps.
- **Code tabs** for tool/package managers (npm/pnpm/yarn, `kubectl`/`helm`, `apt`/`brew`); plain buttons toggling `hidden`; **persist choice in `localStorage`** site-wide.
- **Callout system — 4 variants** (`Callout.astro`, one `data-type` CSS component): Note (blue) · Tip (emerald) · Caution (amber) · Danger (red) — colored left-border + tinted bg + icon + label. Tints use existing theme tokens; dark mode uses low-saturation translucent fills with saturated borders.
- **Anchor-on-hover** (already implemented) and **"Related guides / Further reading"** footer to keep learners in the funnel.

### 9.3 Polish
- **Micro-interactions, GPU-only:** card hover `translateY(-2px…-4px)` + soft shadow + border shift, ~150ms, custom cubic-bezier; copy-icon → checkmark swap. Animate only `transform`/`opacity`.
- **Dark mode:** re-point tokens in `html[data-theme='dark']` per the existing convention (never `dark:` variants); no pure-white body text; callout tints adapted; pre-paint inline theme script already exists.
- **Accessibility:** semantic landmarks (`<nav aria-label>`, `<aside aria-label="On this page">`); tabs with `role=tablist/tab/tabpanel` + arrow-key nav; visible `:focus-visible`; `aria-label` on icon buttons; verify emerald badge contrast ≥ 4.5:1; honor `prefers-reduced-motion`.
- **Performance:** zero JS for layout; a few tiny vanilla scripts (scroll-spy, tabs/copy, theme, roadmap progress); `loading="lazy"` on below-fold thumbnails; no framework hydration on guide pages.

### 9.4 Anti-patterns (explicitly avoid)
No SPA/JS-rendered content shell; no third-party search/analytics/chat SaaS; no accounts or server-side progress; no scroll-event scroll-spy; don't shrink the desktop roadmap for mobile; don't run content full-width; don't overload cards; node states never differ by shade alone.

---

## 10. SEO strategy

**Authority reality (drives everything):** OpsCanopy is ~2 weeks old, near-zero DA. DevOps-learning head terms (`learn devops`, `devops roadmap`, `docker interview questions`, `docker tutorial`) are owned by DR 80–90+ sites and are **not winnable for 6–12+ months**. Strategy: target **intent-matched, winnable long-tails** and **task-specific** queries; build a **pillar/spoke topic cluster**; differentiate with embedded free tools (no competitor offers in-page interactivity).

### 10.1 Per-page keyword + on-page targets

| Page | Primary keyword | `<title>` (≤60) | Slug |
|------|-----------------|-----------------|------|
| Linux guide | `linux for devops` | Linux for DevOps: The Complete Guide (2026) | `linux-for-devops` |
| Networking guide | `networking for devops` | Networking for DevOps Engineers: Complete Guide | `networking-for-devops` |
| Docker guide | `docker for devops` | Docker for DevOps: A Complete Deep Dive Guide | `docker-for-devops` |
| Docker interview | `docker interview questions for devops engineer` (winnable angle; keep `docker-interview-questions` in slug) | Docker Interview Questions for DevOps Engineers | `docker-interview-questions` |
| AWS guide | `aws for devops engineers` | AWS for DevOps Engineers: Core Services Guide | `aws-for-devops-engineers` |
| Kubernetes guide | `kubernetes for devops` | Kubernetes for DevOps: Core Concepts Guide | `kubernetes-for-devops` |
| DevOps projects | `devops project ideas for resume` / `hands-on devops projects` | Hands-On DevOps Projects (Step-by-Step) | `devops-projects` |
| Hub `/learn` | `free devops learning resources` (navigation/brand hub, not a head-term target) | Learn DevOps: Free Roadmaps & Guides | `/learn` |
| DevOps roadmap | `how to become a devops engineer with no experience` / `devops roadmap for beginners 2026` | DevOps Roadmap 2026: Become a DevOps Engineer | `/learn/roadmaps/devops` |

Meta descriptions, H1s, secondary keywords, and full People-Also-Ask question lists per page are captured in the research appendix (§16) — each guide's `faqs` frontmatter is populated from its PAA list.

### 10.2 On-page SEO mechanics
- **FAQ sections** built from each page's PAA questions → `faqPageLd()` (helper already exists) for FAQ rich results.
- **Modifiers** that cut competition while preserving intent: `2026`, `for beginners`, `with no experience`, `step-by-step`, `for devops engineers`.
- **`TechArticle`** JSON-LD per guide (headline, description, datePublished/Modified, author, keywords) + **`BreadcrumbList`**. Roadmap pages: `BreadcrumbList` (+ optional `ItemList`); keep `Course` schema out of v1 (risk of mismatch).
- Unique `<title>`/meta per page; canonical `/learn/...`; auto-sitemap inclusion (verify `@astrojs/sitemap` picks up new static routes).
- **OG images:** extend `scripts/gen-og-images.mjs` with a per-track templated card, or ship a clean static default per track.

### 10.3 Internal linking (topic cluster — the biggest near-term lever)
- **Pillar/spoke, bidirectional:** Docker guide (pillar) ↔ Docker interview (spoke); Linux ↔ Networking; AWS ↔ Kubernetes (EKS bridge). Cross-link the two members of each cluster both ways.
- **Guide ↔ tool links (and back):**
  - Networking guide → `subnet-calculator`, `cidr-checker`, `subnet-splitter`, `ip-address-converter`, `reverse-dns-ptr`, `mac-address-formatter` (highest-density linking page on the site).
  - Linux guide → `regex-log-tester`, `cron-expression-tester`, `base64-encoder-decoder`, `hash-generator`.
  - Docker guides → `docker-run-to-compose`, `env-example-checker`, `github-actions-validator`, `gitlab-ci-validator`, `kubernetes-resource-calculator`.
  - AWS guide → `subnet-calculator`, `cidr-checker` (VPC subnets).
  - Kubernetes guide → `kubernetes-resource-calculator` (featured), plus observability tools (`promql-explainer`, `prometheus-relabel-tester`, `logql-promql-helper`, `loki-alert-rule-tester`, `alertmanager-route-tester`) only where the content touches them.
  - Add reciprocal "Learn more" links from the relevant tool pages back to the guides.
- `/learn` hub and `/learn/roadmaps/devops` act as **internal-linking aggregators** that pass equity down to the winnable guide/project pages.

---

## 11. i18n

- v1: English-only routes under `/learn`; `hideLangSwitcher` on Learn pages.
- Nav "Learn" link appears in all locales (added to `i18n/site.ts`) pointing to the English hub; label kept as the brand word "Learn".
- `canonical = /learn/...`, `inLanguage: en`. Collection schema carries `lang`/`translationOf` so localized guides slot in later with no schema change and no route rework beyond adding `[lang]/learn/...` wrappers.

---

## 12. Accessibility & performance

Match existing site standards: WCAG AA contrast (verify emerald badges), `:focus-visible` rings, semantic landmarks, `prefers-reduced-motion`, keyboard operability for roadmap nodes/tabs/drawers, lazy-loaded images, no layout-blocking JS, code blocks horizontally scrollable on mobile.

---

## 13. Verification / testing

- **Referential-integrity vitest** (`src/data/learn.test.ts` or similar, pure-function — fits the engine-test ethos): every roadmap node `guideSlug` resolves to an existing guide; every node `anchor` matches a heading in that guide; every track has a roadmap; every `relatedTools` slug exists in `tools.ts`; every `track` enum value has a registry entry.
- **`npm run build`** must pass (validates collection schema, catches broken internal links).
- **Manual `npm run dev`** visual pass: light/dark, mobile, roadmap progress persistence, TOC scroll-spy, code copy/tabs.
- Lighthouse/SEO sanity check on a representative guide page.

---

## 14. Multi-agent execution plan (high level; detailed plan via writing-plans)

- **Phase 0 — Foundation (1 agent, lands first):** `guides` collection config; `learn.ts` registry; `roadmaps.ts` types + scaffold; `GuidePost.astro`; `Roadmap.astro`; `Callout.astro`; the 3 route files; `/learn` hub; nav (`site.ts` + `i18n/site.ts`) + footer; `TechArticle` JSON-LD helper. This is the contract every other phase plugs into.
- **Phase 1 — Convert 5 guides (≈5 parallel agents):** each HTML → clean markdown + frontmatter + callouts + related-tool links + FAQ block; normalize the Docker master to clean English. One agent per file.
- **Phase 2 — Author 2 new guides (2 parallel agents):** Kubernetes + Networking, matching converted depth/format, with FAQs and tool links.
- **Phase 3 — Roadmaps (1–2 agents):** author all 6 roadmaps (devops + 5), wiring nodes to guide anchors.
- **Phase 4 — Integrate & verify (1 agent + main loop):** reciprocal tool→guide links, OG images, build, referential-integrity test, SEO/a11y audit.

Dependencies: Phases 1/2/3 depend on Phase 0's schema/registry/anchor contracts; Phase 4 depends on all. Guide markdown agents must emit heading `id`s that match the anchors roadmap agents reference (coordinate via a shared anchor convention defined in Phase 0).

---

## 15. Out of scope / future

Localized translations; role-based hub taxonomy (SRE/Platform/Cloud); per-project child pages under `devops-projects`; Pagefind full-text search; interactive in-guide playgrounds/quizzes; a Learn mega-menu; `Course` structured data.

---

## 16. Research appendix

Full keyword maps (primary/secondary/long-tail PAA, intent, ranking competitors, meta descriptions, internal-link detail) and the premium UI/UX pattern research are retained from the brainstorming session and feed the per-page frontmatter and component requirements above. Key strategic takeaways:
- Do **not** chase `learn devops` / `devops roadmap` head terms; win task-specific long-tails and let hub/roadmap pages aggregate equity.
- The single most winnable high-value term is around **"deploy a containerized app to EC2 (with Docker + GitHub Actions)"** — feature it in the projects guide.
- Embedded free tools + diagrams are the genuine differentiator vs text-only competitors (dwell time, PAA/snippet capture).

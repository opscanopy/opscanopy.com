/**
 * Blog post kind + incident numbering — one pure module, so the cover
 * generator (scripts/gen-blog-heroes.mjs), the post-header cap and the blog
 * card cap all print the SAME caption (`IR-07 · kubernetes` / `note · docker`).
 *
 * Kind:
 *   1. An explicit `kind:` in the post's frontmatter wins (schema:
 *      src/content.config.ts, optional and additive).
 *   2. Otherwise it is DERIVED from the English slug, which every locale copy
 *      shares (src/content/blog/<lang>/<slug>.md): a post is an `incident` when
 *      its slug names a failure symptom or a literal error string — it starts
 *      with `debug-`, or contains one of INCIDENT_SLUG_MARKERS (`exit-code`,
 *      `not-found`, `unable-to`, …). Everything else is a `note`.
 *   `guide` exists for frontmatter to opt into; nothing derives it.
 *   Deriving (rather than writing `kind:` into 155 markdown files) keeps the
 *   post sources, their bodies and their dates untouched.
 *
 * Incident number (`IR-NN`): the slug's position in INCIDENT_REGISTRY below,
 * from 01. The registry is APPEND-ONLY: a new incident takes the next number
 * when its post is first committed, whatever its `pubDate`. Numbering by
 * pubDate (the first rule) broke as soon as posts were scheduled: the Grafana
 * post was committed on 2026-09-26 with a 2026-10-19 pubDate, so any incident
 * written later but published before 10-19 would have taken IR-11 and pushed
 * Grafana's printed number to IR-12 on a cover already in people's feeds.
 * Git first-commit order was rejected too: four of the eleven posts arrived in
 * one 2026-09-26 batch (no order between them), and CI checks out shallow, so
 * the history is not there to read. The list is pinned by blog-kind.test.ts,
 * and every cover carries a stamp of the caption it was drawn with
 * (src/lib/blog-cover.test.ts), so any renumbering fails a test rather than
 * silently re-captioning a shipped cover.
 *
 * To add an incident: append its slug to INCIDENT_REGISTRY, never insert.
 */

export type BlogKind = 'incident' | 'note' | 'guide';

/** Slug fragments that mean "this post is about a specific failure". */
export const INCIDENT_SLUG_MARKERS = [
  'exit-code',
  'failed-to',
  'not-found',
  'not-triggering',
  'always-true',
  'has-no-',
  'forces-replacement',
  'unable-to',
  'unknown-authority',
  'oomkilled',
] as const;

export function blogKind(slug: string, explicit?: BlogKind): BlogKind {
  if (explicit) return explicit;
  if (slug.startsWith('debug-')) return 'incident';
  return INCIDENT_SLUG_MARKERS.some((m) => slug.includes(m)) ? 'incident' : 'note';
}

/**
 * Every incident ever numbered, in the order its number was assigned
 * (index 0 = IR-01). Append-only; see the module comment. The first ten were
 * numbered by pubDate when the covers were introduced on 2026-10-02; the
 * scheduled Grafana post (pubDate 2026-10-19) is eleventh.
 */
export const INCIDENT_REGISTRY: readonly string[] = [
  'github-actions-if-condition-always-true', // IR-01
  'github-actions-workflow-not-triggering-filters', // IR-02
  'debug-prometheus-relabeling', // IR-03
  'debug-alertmanager-routing', // IR-04
  'docker-build-failed-to-solve-exit-code-1', // IR-05
  'kubernetes-oomkilled-exit-code-137', // IR-06
  'x509-certificate-signed-by-unknown-authority', // IR-07
  'unable-to-get-local-issuer-certificate', // IR-08
  'terraform-forces-replacement', // IR-09
  'kubernetes-service-has-no-endpoints', // IR-10
  'grafana-datasource-was-not-found', // IR-11
];

export interface KindInput {
  slug: string;
  /** Not used for numbering (see INCIDENT_REGISTRY); accepted so callers can pass posts as read. */
  pubDate?: Date | string;
  kind?: BlogKind;
}

/**
 * slug → two-digit incident number, for every incident in `posts`, from its
 * position in `registry`. Throws on an incident the registry does not list
 * (append it) and on a duplicate registry entry, so a number is never guessed.
 */
export function incidentNumbers(
  posts: readonly KindInput[],
  registry: readonly string[] = INCIDENT_REGISTRY,
): Map<string, string> {
  const position = new Map<string, number>();
  registry.forEach((slug, i) => {
    if (position.has(slug)) throw new Error(`blog-kind: "${slug}" is listed twice in INCIDENT_REGISTRY`);
    position.set(slug, i);
  });
  const out = new Map<string, string>();
  for (const p of posts) {
    if (blogKind(p.slug, p.kind) !== 'incident') continue;
    const i = position.get(p.slug);
    if (i === undefined) {
      throw new Error(`blog-kind: incident "${p.slug}" is not in INCIDENT_REGISTRY — append it (never insert)`);
    }
    out.set(p.slug, String(i + 1).padStart(2, '0'));
  }
  return out;
}

/**
 * The caption's leading token: `IR-07` for an incident, `note` otherwise.
 * Never empty — an incident missing from `numbers` is a caller bug and throws.
 */
export function kindToken(slug: string, kind: BlogKind, numbers: Map<string, string>): string {
  if (kind !== 'incident') return 'note';
  const n = numbers.get(slug);
  if (!n) throw new Error(`blog-kind: incident "${slug}" has no number`);
  return `IR-${n}`;
}

/**
 * Category for a post's caption and cover hue: the category of the tool its
 * `relatedTool` links to; else the first tag that names a category; else
 * `guide` (no hue — the cover falls back to leaf).
 */
const TAG_CATEGORY: Record<string, string> = {
  kubernetes: 'Kubernetes',
  docker: 'Docker',
  terraform: 'IaC',
  prometheus: 'Observability',
  observability: 'Observability',
  security: 'Security',
  networking: 'Networking',
  cron: 'Scheduling',
  'ci-cd': 'CI/CD',
  'github-actions': 'CI/CD',
  'gitlab-ci': 'CI/CD',
  logs: 'Logs',
  configuration: 'Config',
};

export function blogCategory(
  relatedToolHref: string | undefined,
  tags: readonly string[] | undefined,
  toolCategory: (slug: string) => string | undefined,
): string {
  if (relatedToolHref) {
    const slug = relatedToolHref.replace(/^\/+|\/+$/g, '');
    const cat = toolCategory(slug);
    if (cat) return cat;
  }
  for (const tag of tags ?? []) {
    const cat = TAG_CATEGORY[tag];
    if (cat) return cat;
  }
  return 'guide';
}

/**
 * Tool registry — the OpsCanopy catalog. Single source of truth for the
 * homepage feature grid, /tools directory, header, footer, and cross-links.
 * Add a tool here when it ships; flip `status` from 'planned' → 'live'.
 */

export type ToolStatus = 'live' | 'beta' | 'planned';

/** Which brand gradient pair tints the tool's card accent. */
export type ToolAccent = 'develop' | 'preview' | 'ship';

export interface Tool {
  /** URL slug (also the keyword-bearing path). */
  slug: string;
  /** Brand name, e.g. "AlertLint". */
  name: string;
  /** One-line descriptive tagline (nominative fair use of vendor marks). */
  tagline: string;
  /** Short marketing description for cards. */
  description: string;
  status: ToolStatus;
  category: string;
  /** Primary + long-tail SEO keywords. */
  keywords: string[];
  accent: ToolAccent;
  /**
   * Optional ISO date the tool was added. The "Newest" catalog sort uses
   * registry order as its primary proxy for recency (later-registered = newer),
   * so this field is intentionally NOT populated with fabricated dates. It
   * exists so a real ship date can be recorded later without a schema change;
   * the sort falls back to registry position whenever it is absent.
   */
  addedAt?: string;
}

export const tools: Tool[] = [
  {
    slug: 'loki-alert-rule-tester',
    name: 'AlertLint',
    tagline: 'Unit testing for Grafana Loki alert rules.',
    description:
      'Test your Loki alerting and recording rules before they fire in production. Paste rules + synthetic logs, assert pass/fail — entirely in the browser. The promtool equivalent Loki never had.',
    status: 'live',
    category: 'Observability',
    keywords: [
      'loki alert rule tester',
      'loki alerting rule unit test',
      'test loki alert rules online',
      'loki promtool equivalent',
      'loki alert rule validator',
      'logql alert rule tester',
      'validate loki ruler yaml online free',
      'loki alert rule tester no signup',
    ],
    accent: 'develop',
  },
  {
    slug: 'cve-ignore-converter',
    name: 'CVE-Ignore Converter',
    tagline: 'Translate .trivyignore / .grype.yaml / .snyk in one click.',
    description:
      'Convert and unify a single vulnerability-suppression policy across Trivy, Grype, Snyk and osv-scanner formats. Pure client-side, no upload.',
    status: 'live',
    category: 'Security',
    keywords: [
      'trivy ignore to snyk converter',
      'convert .trivyignore to .snyk',
      'cve ignore file converter',
      'trivyignore to grype converter',
      'vulnerability suppression file converter',
      'convert trivyignore to osv-scanner.toml',
      'snyk to trivy ignore converter',
      'migrate trivy ignore rules to snyk',
    ],
    accent: 'preview',
  },
  {
    slug: 'github-actions-validator',
    name: 'GitHub Actions Validator',
    tagline: 'Check workflow YAML errors & security issues online — no install.',
    description:
      'Paste a GitHub Actions workflow and get YAML errors plus security-misconfiguration checks, instantly, with nothing to install.',
    status: 'live',
    category: 'CI/CD',
    keywords: [
      'github actions yaml validator',
      'github actions validator online',
      'github actions workflow linter',
      'validate github actions workflow',
      'github actions security checker',
      'github actions misconfiguration checker',
      'github actions yaml validator no install',
      'github actions unpinned actions checker',
    ],
    accent: 'ship',
  },
  {
    slug: 'cron-expression-tester',
    name: 'Cron Expression Tester',
    tagline: 'Explain any cron expression in plain English — and see the next runs.',
    description:
      'Paste a cron expression and get a plain-English description plus the next run times. Supports ranges, steps, lists and @macros. Pure client-side.',
    status: 'live',
    category: 'Scheduling',
    keywords: [
      'cron expression tester',
      'cron expression parser',
      'crontab explained',
      'cron to english',
      'cron expression validator',
      'cron next run time',
      'cron expression explainer',
      'cron expression to plain english',
    ],
    accent: 'develop',
  },
  {
    slug: 'cron-to-systemd',
    name: 'Cron to systemd Converter',
    tagline: 'Turn a crontab line into a systemd timer + service unit.',
    description:
      'Convert a crontab entry into an equivalent systemd .timer and .service unit, with an OnCalendar expression and migration notes. Pure client-side.',
    status: 'live',
    category: 'Scheduling',
    keywords: [
      'cron to systemd timer',
      'crontab to systemd',
      'systemd timer generator',
      'cron to oncalendar converter',
      'systemd service and timer generator',
      'convert cron expression to systemd oncalendar',
      'generate systemd .timer and .service from crontab',
      'cron schedule to oncalendar syntax',
    ],
    accent: 'preview',
  },
  {
    slug: 'regex-log-tester',
    name: 'Regex Log Tester',
    tagline: 'Test regular expressions against your log lines — live matches and groups.',
    description:
      'Paste a regex and sample log lines, see live matches, capture groups and named groups. Built for log parsing, runs entirely in your browser.',
    status: 'live',
    category: 'Logs',
    keywords: [
      'regex log tester',
      'regex tester for logs',
      'test regex against log lines',
      'log parsing regex tester',
      'regex tester online',
      'regex tester named capture groups online free',
      'apache access log regex tester',
      'nginx access log regex pattern tester',
    ],
    accent: 'ship',
  },
  {
    slug: 'env-example-checker',
    name: 'Env Example Checker',
    tagline: 'Find env vars your code uses but .env.example is missing.',
    description:
      'Paste your code and your .env.example to find environment variables used in code but missing from the example (and unused keys). Pure client-side.',
    status: 'live',
    category: 'Config',
    keywords: [
      'env example checker',
      '.env.example checker',
      'env var drift checker',
      'missing env vars',
      'compare .env and .env.example',
      '.env validator online',
      'find missing environment variables',
      'detect environment variable drift between code and config',
    ],
    accent: 'develop',
  },
  {
    slug: 'logql-promql-helper',
    name: 'LogQL ↔ PromQL Helper',
    tagline: 'Translate and explain queries between Loki LogQL and Prometheus PromQL.',
    description:
      'Convert common metric-query shapes between Grafana Loki LogQL and Prometheus PromQL, with notes on what does and does not map. Pure client-side.',
    status: 'live',
    category: 'Observability',
    keywords: [
      'logql to promql',
      'promql to logql',
      'loki query converter',
      'logql vs promql',
      'logql to promql converter',
      'convert promql to logql',
      'loki query language converter',
      'logql to promql converter online',
    ],
    accent: 'preview',
  },
  {
    slug: 'promql-explainer',
    name: 'PromQL Explainer',
    tagline: 'Paste a PromQL query and get a plain-English explanation.',
    description:
      'Break down a Prometheus PromQL query into a readable explanation — selectors, rates, aggregations, functions and comparisons. Pure client-side.',
    status: 'live',
    category: 'Observability',
    keywords: [
      'promql explainer',
      'promql to english',
      'understand promql query',
      'promql explained',
      'promql query analyzer',
      'prometheus query explainer',
      'explain promql query',
      'promql parser online',
    ],
    accent: 'ship',
  },
  {
    slug: 'subnet-calculator',
    name: 'Subnet Calculator',
    tagline: 'Network, broadcast, mask and host range from any IPv4/IPv6 CIDR.',
    description:
      'Enter an IPv4 or IPv6 address with a prefix and get the network and broadcast addresses, netmask, wildcard, usable host range and address counts. Pure client-side.',
    status: 'live',
    category: 'Networking',
    keywords: [
      'subnet calculator',
      'ip subnet calculator',
      'cidr calculator',
      'ipv6 subnet calculator',
      'netmask calculator',
      'subnet mask calculator',
      'cidr to ip range calculator',
      'wildcard mask calculator',
    ],
    accent: 'develop',
  },
  {
    slug: 'ip-address-converter',
    name: 'IP Address Converter',
    tagline: 'Convert an IP between dotted decimal, integer, hex and binary.',
    description:
      'Paste an IPv4 or IPv6 address in any form — dotted decimal, integer, hexadecimal or binary — and see every representation at once. Pure client-side.',
    status: 'live',
    category: 'Networking',
    keywords: [
      'ip address converter',
      'ip to decimal',
      'ip to integer',
      'ip to hex',
      'ip to binary converter',
      'convert ip to integer',
      'decimal to ip converter',
      'ip to binary',
    ],
    accent: 'preview',
  },
  {
    slug: 'cidr-checker',
    name: 'CIDR / Subnet Checker',
    tagline: 'Aggregate CIDRs and find overlaps or containment in a list.',
    description:
      'Paste a list of IPs/CIDRs to find the minimal covering set, spot overlapping or contained ranges, and normalise each entry. Pure client-side.',
    status: 'live',
    category: 'Networking',
    keywords: [
      'cidr aggregator',
      'cidr overlap checker',
      'subnet overlap checker',
      'merge cidr ranges',
      'supernet calculator',
      'cidr summarization',
      'cidr contains checker',
      'route summarization tool',
    ],
    accent: 'ship',
  },
  {
    slug: 'mac-address-formatter',
    name: 'MAC Address Formatter',
    tagline: 'Reformat a MAC across colon, hyphen, Cisco and bare — and read its bits.',
    description:
      'Paste a MAC address and get it normalised across colon, hyphen, Cisco dotted and bare forms, plus the U/L and I/G bit meaning, OUI and the EUI-64 IPv6 link-local address it derives. Pure client-side.',
    status: 'live',
    category: 'Networking',
    keywords: [
      'mac address formatter',
      'mac address converter',
      'eui-64 calculator',
      'mac to ipv6 link local',
      'mac address format converter',
      'mac oui lookup',
      'cisco mac address converter',
      'mac address to ipv6 converter eui-64',
    ],
    accent: 'develop',
  },
  {
    slug: 'reverse-dns-ptr',
    name: 'Reverse DNS / PTR Helper',
    tagline: 'Build the in-addr.arpa / ip6.arpa PTR name and reverse zone for any IP.',
    description:
      'Enter an IPv4 or IPv6 address or CIDR and get the in-addr.arpa or ip6.arpa PTR name, the matching reverse zone and the nibble breakdown behind it. Pure client-side.',
    status: 'live',
    category: 'Networking',
    keywords: [
      'reverse dns generator',
      'ptr record generator',
      'ip to ptr record generator',
      'reverse dns converter',
      'in-addr.arpa generator',
      'ip6.arpa generator',
      'ipv6 reverse dns generator',
      'ptr record generator for ipv4 and ipv6',
    ],
    accent: 'preview',
  },
  {
    slug: 'subnet-splitter',
    name: 'Subnet Splitter',
    tagline: 'Split a parent CIDR into subnets and find the free space around allocations.',
    description:
      'Split a parent IPv4 or IPv6 CIDR into equal subnets or carve it up with VLSM, then list existing allocations to find the gaps and the next available subnet. Pure client-side.',
    status: 'live',
    category: 'Networking',
    keywords: [
      'subnet splitter',
      'split cidr into subnets',
      'cidr splitter',
      'vlsm calculator',
      'find next available subnet',
      'find free subnet',
      'ipv6 subnet splitter calculator',
      'find gaps between subnet allocations',
    ],
    accent: 'ship',
  },
  {
    slug: 'jwt-decoder',
    name: 'JWT Decoder',
    tagline: 'Decode a JWT header and claims, and check expiry — without sending it anywhere.',
    description:
      'Paste a JSON Web Token to decode its header and payload, inspect standard claims, and see whether it is expired or not yet valid. Your token never leaves the page. Pure client-side.',
    status: 'live',
    category: 'Security',
    keywords: [
      'jwt decoder',
      'decode jwt online',
      'jwt token decoder',
      'online jwt decoder',
      'jwt decoder online free',
      'jwt claims viewer',
      'jwt payload viewer',
      'decode jwt without sending to server',
    ],
    accent: 'develop',
  },
  {
    slug: 'timestamp-converter',
    name: 'Timestamp Converter',
    tagline: 'Convert between Unix epoch, ISO 8601 and human-readable dates.',
    description:
      'Paste a Unix timestamp in seconds or milliseconds, or an ISO 8601 date, and convert it across epoch, UTC and local time with relative age. Pure client-side.',
    status: 'live',
    category: 'Encoding',
    keywords: [
      'unix timestamp converter',
      'epoch converter',
      'epoch to date',
      'timestamp to date converter',
      'unix timestamp to date',
      'epoch time converter',
      'iso 8601 converter',
      'milliseconds to date converter',
    ],
    accent: 'preview',
  },
  {
    slug: 'base64-encoder-decoder',
    name: 'Base64 Encoder / Decoder',
    tagline: 'Encode and decode Base64 and URL-safe Base64, with Unicode support.',
    description:
      'Paste text or Base64 to encode or decode in either direction, with standard and URL-safe alphabets and full UTF-8 handling. Pure client-side.',
    status: 'live',
    category: 'Encoding',
    keywords: [
      'base64 encoder decoder',
      'base64 decode online',
      'base64 encode online',
      'url safe base64',
      'base64 decode',
      'base64 encode',
      'base64 to text',
      'base64url encode decode',
    ],
    accent: 'ship',
  },
  {
    slug: 'hash-generator',
    name: 'Hash Generator',
    tagline: 'Compute MD5, SHA-1, SHA-256 and SHA-512 digests of any text — plus HMAC.',
    description:
      'Paste text and get its MD5, SHA-1, SHA-256 and SHA-512 hashes at once, plus an optional HMAC with a key — computed in your browser with the Web Crypto API. Pure client-side.',
    status: 'live',
    category: 'Security',
    keywords: [
      'hash generator',
      'sha256 hash generator',
      'sha256 generator online',
      'sha512 hash generator',
      'md5 hash generator',
      'hmac generator',
      'checksum generator',
      'hmac sha256 generator online',
    ],
    accent: 'develop',
  },
  {
    slug: 'kubernetes-resource-calculator',
    name: 'Kubernetes Resource Calculator',
    tagline: 'Total CPU and memory requests and limits across pods and replicas.',
    description:
      'Enter container CPU and memory requests and limits with replica counts to total the resources a workload reserves, and convert millicores and Mi/Gi units. Pure client-side.',
    status: 'live',
    category: 'Kubernetes',
    keywords: [
      'kubernetes resource calculator',
      'kubernetes cpu memory calculator',
      'k8s requests limits calculator',
      'kubernetes pod resource calculator',
      'millicores to cpu converter',
      'k8s resource calculator',
      'kubernetes requests and limits calculator',
      'total cpu memory across pods and replicas',
    ],
    accent: 'preview',
  },
  {
    slug: 'github-actions-expression-tester',
    name: 'GitHub Actions Expression Tester',
    tagline: 'Evaluate ${{ }} expressions and simulate workflow triggers.',
    description:
      'Test GitHub Actions if: conditions with GitHub’s exact coercion rules, catch the “always true” literal footgun, and simulate which jobs run for a push, PR or tag. Pure client-side.',
    status: 'live',
    category: 'CI/CD',
    keywords: [
      'github actions expression tester',
      'github actions if condition tester',
      'github actions expression evaluator',
      'github actions trigger simulator',
      'github actions if always runs true',
      'github actions paths filter tester',
      'test github actions expression online',
      'github actions branch filter glob tester',
    ],
    accent: 'ship',
  },
];

export const liveTools = tools.filter((t) => t.status === 'live');
export const plannedTools = tools.filter((t) => t.status === 'planned');

export function getTool(slug: string): Tool | undefined {
  return tools.find((t) => t.slug === slug);
}

/** Gradient stop pairs for each accent (matches DESIGN.md brand gradient). */
export const accentGradients: Record<ToolAccent, [string, string]> = {
  develop: ['#007cf0', '#00dfd8'],
  preview: ['#7928ca', '#ff0080'],
  ship: ['#ff4d4d', '#f9cb28'],
};

/**
 * Full, static Tailwind gradient-stop class strings per accent. These are
 * complete literals (never concatenated at runtime) so Tailwind v4's source
 * scanner can see them. Pages import this instead of re-declaring local maps;
 * compose with a gradient direction utility, e.g.
 * `class:list={['bg-gradient-to-r', accentEdgeClass[tool.accent]]}`.
 */
export const accentEdgeClass: Record<ToolAccent, string> = {
  develop: 'from-[#007cf0] to-[#00dfd8]',
  preview: 'from-[#7928ca] to-[#ff0080]',
  ship: 'from-[#ff4d4d] to-[#f9cb28]',
};

/**
 * Semantic category color system — color now MEANS category. Each category in
 * the registry maps to one muted -600/-700 hue, used (via inline style) for
 * both the card's solid top accent bar and the dot inside the category pill.
 * This replaces the decorative develop/preview/ship gradient for those grids,
 * so a card's color tells you what kind of tool it is at a glance. The dot
 * carries the hue while the pill label stays in dark text for AA legibility.
 * Keep this keyed by the EXACT `category` strings used above.
 */
export const categoryAccent: Record<string, string> = {
  Networking: '#2563eb',
  Security: '#e11d48',
  Encoding: '#b45309',
  Kubernetes: '#4f46e5',
  Observability: '#7c3aed',
  'CI/CD': '#0e7490',
  Scheduling: '#c2410c',
  Logs: '#be185d',
  Config: '#0f766e',
};

/* ─── Category landing pages ──────────────────────────────────────────────
 * Slug ⇄ category mapping + per-category metadata that drives the static
 * /tools/{slug} category pages and the "Browse by category" link row on the
 * catalog. Slugs are derived from the category label (e.g. "CI/CD" → "ci-cd")
 * so a category never needs hand-maintained slugs.
 */

/** Slugify a category label for use in a /tools/{slug} URL ("CI/CD" → "ci-cd"). */
export function categoryToSlug(category: string): string {
  return category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // any run of non-alphanumerics → single hyphen
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}

/**
 * Distinct categories in first-appearance (registry) order, each paired with
 * its URL slug and a count of live tools. Drives getStaticPaths + the
 * "Browse by category" row. Only categories that have at least one LIVE tool
 * are emitted, so no category page is ever an orphan/empty.
 */
export interface CategoryEntry {
  category: string;
  slug: string;
  count: number;
}

export const categories: CategoryEntry[] = (() => {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const tool of liveTools) {
    if (!counts.has(tool.category)) order.push(tool.category);
    counts.set(tool.category, (counts.get(tool.category) ?? 0) + 1);
  }
  return order.map((category) => ({
    category,
    slug: categoryToSlug(category),
    count: counts.get(category) ?? 0,
  }));
})();

/** Resolve a URL slug back to its canonical category label, or undefined. */
export function slugToCategory(slug: string): string | undefined {
  return categories.find((c) => c.slug === slug)?.category;
}

/** Live tools in a single category, preserving registry order. */
export function toolsInCategory(category: string): Tool[] {
  return liveTools.filter((t) => t.category === category);
}

/**
 * One-line, human blurb per category for the landing-page header + meta
 * description. Keyed by the EXACT `category` strings used above; any category
 * without an entry falls back to a generic line at the call site.
 */
export const categoryBlurb: Record<string, string> = {
  Networking:
    'Subnet, CIDR, IP and DNS calculators that do exact 32- and 128-bit math in your browser.',
  Security:
    'Decode, hash and convert security artefacts locally — nothing you paste ever leaves the page.',
  Encoding: 'Encode, decode and convert between common text and time formats, instantly.',
  Kubernetes: 'Size and reason about Kubernetes workloads without leaving the browser.',
  Observability:
    'Write, translate and explain Loki and Prometheus queries and alert rules.',
  'CI/CD': 'Validate and harden your pipeline configuration before it runs.',
  Scheduling: 'Understand, convert and verify cron and systemd timer schedules.',
  Logs: 'Build and test the patterns that parse your logs, against real sample lines.',
  Config: 'Catch configuration drift between your code and its environment files.',
};

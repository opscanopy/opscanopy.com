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
      'loki alert rule validator',
      'loki alerting rule unit test',
      'test loki alert rules online',
      'loki promtool equivalent',
      'logql alert rule validator',
      'loki recording rule test',
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
      'cve ignore file converter online',
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
      'github actions misconfiguration checker',
      'validate github actions before push',
      'github actions yaml validator no install',
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
      'crontab explained',
      'cron next run time',
      'cron to english',
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
      'convert cron to systemd',
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
      'log line regex tester',
      'test regex against log lines',
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
      'env.example checker',
      'env var drift checker',
      'missing env vars',
      'env example vs code',
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
      'logql vs promql',
      'loki query converter',
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
      'promql explained',
      'understand promql query',
      'promql to english',
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
      'cidr calculator',
      'ip subnet calculator',
      'ipv6 subnet calculator',
      'netmask calculator',
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
      'ip to decimal',
      'ip address to integer',
      'ip to hex',
      'ip to binary converter',
      'ipv6 to integer',
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
      'does cidr contain ip',
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
      'normalize mac address',
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
      'in-addr.arpa',
      'ip6.arpa generator',
      'reverse zone calculator',
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
      'vlsm calculator',
      'find free subnet',
      'split cidr into subnets',
      'next available subnet',
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
      'jwt claims viewer',
      'jwt expiry checker',
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
      'epoch to date',
      'iso 8601 converter',
      'epoch time converter',
      'timestamp to date online',
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
      'base64 to text converter',
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
      'sha256 generator online',
      'sha512 hash generator',
      'text to hash converter',
      'checksum generator',
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
      'pod resource calculator',
      'millicores to cpu converter',
    ],
    accent: 'preview',
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

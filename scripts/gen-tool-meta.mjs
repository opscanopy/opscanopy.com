// Prebuild: git-derived "last updated" date per live tool.
//
// For each tool in the registry, the most recent commit date (committer
// date, YYYY-MM-DD) across its engine lib dir + Playground component +
// English page — an honest, unfabricated recency signal instead of a
// hand-maintained date someone forgets to bump. Feeds ToolHero's "Updated"
// badge, ToolCard's real-date "Newest" sort, and /changelog.
//
// Writes src/data/tool-meta.generated.json (gitignored — regenerated every
// build; the wrapper src/data/tool-meta.ts falls back to {} via
// import.meta.glob when this hasn't been generated yet, so `astro dev`
// without a prior `npm run build` still works).
//
// TOOL_PATHS below is an EXPLICIT map, not derived from the slug string,
// because the naming isn't 1:1 (e.g. "cve-ignore-converter" ->
// CveConverterPlayground.astro, lib "cve-ignore"; "kubernetes-resource-
// calculator" -> K8sResourceCalculatorPlayground.astro, lib "k8s-resources").
// Completeness-checked against the live registry below — a tool that ships
// live with no entry here fails the build loudly instead of silently
// shipping with no Updated date.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveTools } from '../src/data/tools.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT, 'src/data/tool-meta.generated.json');

const TOOL_PATHS = {
  'loki-alert-rule-tester': { lib: 'alertlint', component: 'AlertLintPlayground.astro' },
  'cve-ignore-converter': { lib: 'cve-ignore', component: 'CveConverterPlayground.astro' },
  'github-actions-validator': { lib: 'gha-validator', component: 'GhaValidatorPlayground.astro' },
  'cron-expression-tester': { lib: 'cron-tester', component: 'CronTesterPlayground.astro' },
  'cron-to-systemd': { lib: 'cron-systemd', component: 'CronToSystemdPlayground.astro' },
  'regex-log-tester': { lib: 'regex-tester', component: 'RegexLogTesterPlayground.astro' },
  'env-example-checker': { lib: 'env-checker', component: 'EnvCheckerPlayground.astro' },
  'logql-promql-helper': { lib: 'logql-promql', component: 'LogqlPromqlPlayground.astro' },
  'promql-explainer': { lib: 'promql-explainer', component: 'PromqlExplainerPlayground.astro' },
  'subnet-calculator': { lib: 'subnet-calculator', component: 'SubnetCalculatorPlayground.astro' },
  'ip-address-converter': { lib: 'ip-converter', component: 'IpConverterPlayground.astro' },
  'cidr-checker': { lib: 'cidr-checker', component: 'CidrCheckerPlayground.astro' },
  'mac-address-formatter': { lib: 'mac-formatter', component: 'MacFormatterPlayground.astro' },
  'reverse-dns-ptr': { lib: 'ptr-helper', component: 'PtrHelperPlayground.astro' },
  'subnet-splitter': { lib: 'subnet-splitter', component: 'SubnetSplitterPlayground.astro' },
  'jwt-decoder': { lib: 'jwt-decoder', component: 'JwtDecoderPlayground.astro' },
  'timestamp-converter': { lib: 'timestamp-converter', component: 'TimestampConverterPlayground.astro' },
  'base64-encoder-decoder': { lib: 'base64-codec', component: 'Base64Playground.astro' },
  'hash-generator': { lib: 'hash-generator', component: 'HashGeneratorPlayground.astro' },
  'kubernetes-resource-calculator': { lib: 'k8s-resources', component: 'K8sResourceCalculatorPlayground.astro' },
  'github-actions-expression-tester': {
    lib: 'github-actions-expression-tester',
    component: 'GithubActionsExpressionPlayground.astro',
  },
  'docker-run-to-compose': { lib: 'docker-run-to-compose', component: 'DockerRunToComposePlayground.astro' },
  'gitlab-ci-validator': { lib: 'gitlab-ci-validator', component: 'GitlabCiValidatorPlayground.astro' },
  'prometheus-relabel-tester': {
    lib: 'prometheus-relabel-tester',
    component: 'PrometheusRelabelTesterPlayground.astro',
  },
  'alertmanager-route-tester': {
    lib: 'alertmanager-route-tester',
    component: 'AlertmanagerRouteTesterPlayground.astro',
  },
};

const missing = liveTools.map((t) => t.slug).filter((slug) => !TOOL_PATHS[slug]);
if (missing.length > 0) {
  console.error(
    `gen-tool-meta: ${missing.length} live tool(s) have no TOOL_PATHS entry — add one before this ` +
      `can build a complete changelog:\n  ${missing.join('\n  ')}`,
  );
  process.exit(1);
}

/** Most recent committer date (YYYY-MM-DD) touching any of `paths`, or null if never committed (fresh checkout with no git history for that path). */
function lastCommitDate(paths) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...paths], {
      cwd: ROOT,
      encoding: 'utf-8',
    }).trim();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

const meta = {};
for (const tool of liveTools) {
  const { lib, component } = TOOL_PATHS[tool.slug];
  const paths = [
    join('src', 'lib', lib),
    join('src', 'components', component),
    join('src', 'pages', `${tool.slug}.astro`),
  ];
  const date = lastCommitDate(paths);
  if (date) meta[tool.slug] = date;
}

writeFileSync(OUT_FILE, JSON.stringify(meta, null, 2) + '\n');
console.log(`gen-tool-meta: wrote ${Object.keys(meta).length}/${liveTools.length} tool dates to ${OUT_FILE}`);

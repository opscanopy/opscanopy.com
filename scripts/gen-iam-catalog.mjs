#!/usr/bin/env node
// Builds src/data/iam-catalog.json from the AWS Service Reference (v1).
// Run BY HAND (network), never at build: `node scripts/gen-iam-catalog.mjs`.
// Each action is trimmed to { n, l, r, c }; see src/lib/aws-iam-policy-generator/types.ts.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://servicereference.us-east-1.amazonaws.com';
const OUT = fileURLToPath(new URL('../src/data/iam-catalog.json', import.meta.url));
const NAMES = {
  dynamodb: 'Amazon DynamoDB',
  ec2: 'Amazon EC2',
  ecr: 'Amazon ECR',
  iam: 'AWS Identity and Access Management (IAM)',
  kms: 'AWS Key Management Service (KMS)',
  lambda: 'AWS Lambda',
  logs: 'Amazon CloudWatch Logs',
  s3: 'Amazon S3',
  secretsmanager: 'AWS Secrets Manager',
  sns: 'Amazon SNS',
  sqs: 'Amazon SQS',
  sts: 'AWS Security Token Service (STS)',
};

const getJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
};

// Precedence from the plan: PermissionManagement > TaggingOnly > Write > List > Read.
export function accessLevel(p = {}) {
  if (p.IsPermissionManagement) return 'Permissions management';
  if (p.IsTaggingOnly) return 'Tagging';
  if (p.IsWrite) return 'Write';
  if (p.IsList) return 'List';
  return 'Read';
}

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const sorted = (xs = []) => [...xs].sort();

export function trimService(prefix, raw, modified) {
  const actions = raw.Actions.map((a) => ({
    n: a.Name,
    l: accessLevel(a.Annotations?.Properties),
    r: sorted((a.Resources ?? []).map((r) => r.Name)),
    c: sorted(a.ActionConditionKeys),
  })).sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));
  return {
    prefix,
    name: NAMES[prefix],
    version: raw.Version,
    modified,
    actions,
    resources: (raw.Resources ?? []).map((r) => ({ name: r.Name, arnFormats: sorted(r.ARNFormats) })).sort(byName),
    conditionKeys: (raw.ConditionKeys ?? []).map((k) => ({ name: k.Name, types: sorted(k.Types) })).sort(byName),
  };
}

async function main() {
  const index = await getJson(`${BASE}/`);
  const services = {};
  for (const prefix of Object.keys(NAMES).sort()) {
    const entry = index.find((s) => s.service === prefix);
    if (!entry) throw new Error(`${prefix} missing from the service index`);
    const raw = await getJson(entry.url);
    services[prefix] = trimService(prefix, raw, new Date(entry.modified * 1000).toISOString().slice(0, 10));
  }
  const head = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: 'AWS Service Reference (servicereference.us-east-1.amazonaws.com) v1',
  };
  // One service per line: readable diffs, still compact.
  const lines = Object.entries(services).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  const body = `{\n  "generatedAt": ${JSON.stringify(head.generatedAt)},\n  "source": ${JSON.stringify(head.source)},\n  "services": {\n${lines.join(',\n')}\n  }\n}\n`;
  JSON.parse(body); // fail before writing anything malformed
  writeFileSync(OUT, body);
  const n = Object.values(services).reduce((t, s) => t + s.actions.length, 0);
  console.log(`wrote ${OUT}: ${Object.keys(services).length} services, ${n} actions, ${body.length} bytes`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

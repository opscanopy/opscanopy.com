/**
 * AWS IAM Policy Generator — pure engine. No DOM, no clock, never imports the catalogue:
 * callers pass it in. Grammar follows the IAM JSON policy element reference
 * (docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html).
 */
import type { AccessLevel, Catalog, CatalogAction, Condition, PolicyKind, PolicyResult, PolicyWarning, Principal, Statement } from './types';

export const VERSION = '2012-10-17';

const BASE_OPERATORS = [
  'StringEquals', 'StringNotEquals', 'StringEqualsIgnoreCase', 'StringNotEqualsIgnoreCase', 'StringLike', 'StringNotLike',
  'NumericEquals', 'NumericNotEquals', 'NumericLessThan', 'NumericLessThanEquals', 'NumericGreaterThan', 'NumericGreaterThanEquals',
  'DateEquals', 'DateNotEquals', 'DateLessThan', 'DateLessThanEquals', 'DateGreaterThan', 'DateGreaterThanEquals',
  'Bool', 'BinaryEquals', 'IpAddress', 'NotIpAddress',
  'ArnEquals', 'ArnLike', 'ArnNotEquals', 'ArnNotLike',
  'Null',
];

/** The base operators; any of them except Null also takes an `IfExists` suffix, and any may carry a set prefix. */
export const CONDITION_OPERATORS: string[] = BASE_OPERATORS;

/** `[ForAllValues:|ForAnyValue:]<base>[IfExists]` — IfExists is not defined for Null. */
export function isConditionOperator(op: string): boolean {
  const bare = op.replace(/^(?:ForAllValues|ForAnyValue):/, '');
  if (BASE_OPERATORS.includes(bare)) return true;
  const base = bare.endsWith('IfExists') ? bare.slice(0, -'IfExists'.length) : '';
  return base !== '' && base !== 'Null' && BASE_OPERATORS.includes(base);
}

/** IAM counts characters without whitespace. Bucket policies are capped at 20 KB. */
export const LIMITS = {
  managed: { label: 'Customer managed policy', chars: 6144 },
  'inline-user': { label: 'Inline policies per user (total)', chars: 2048 },
  'inline-role': { label: 'Inline policies per role (total)', chars: 10240 },
  'inline-group': { label: 'Inline policies per group (total)', chars: 5120 },
  's3-bucket': { label: 'S3 bucket policy', chars: 20480 },
  trust: { label: 'Role trust policy (default quota)', chars: 2048 },
} satisfies Record<string, { label: string; chars: number }>;

// IAM matches the service prefix case-insensitively (S3:GetObject is accepted), so allow either case here.
const ACTION_RE = /^[A-Za-z0-9-]+:[A-Za-z0-9*?]+$/;
const SID_RE = /^[A-Za-z0-9]+$/;
// `prefix:name[/tag]`. The prefix may be a host (token.actions.githubusercontent.com:sub) or an
// OIDC provider path; a tag key after `/` may contain spaces.
const COND_KEY_RE = /^[A-Za-z0-9._/-]+:[^\s<>"][^<>"]*$/;
const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const DATE_RE = /^(\d+|\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?)$/;
const IP_KEYS = ['aws:sourceip', 'aws:vpcsourceip'];
// The web identity providers IAM accepts by name in a Federated principal; anything else needs an IdP ARN.
const WEB_IDPS = ['cognito-identity.amazonaws.com', 'www.amazon.com', 'graph.facebook.com', 'accounts.google.com'];

const one = (xs: string[]): string | string[] => (xs.length === 1 ? xs[0] : xs);

function globRe(pattern: string): RegExp {
  return new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
}

/** Catalogue actions an action string (exact or wildcard) matches; null when the service is not in the catalogue. */
function matchActions(catalog: Catalog, action: string): CatalogAction[] | null {
  const i = action.indexOf(':');
  if (i < 0) return null;
  const svc = catalog.services[action.slice(0, i).toLowerCase()];
  if (!svc) return null;
  const re = globRe(action.slice(i + 1));
  return svc.actions.filter((a) => re.test(a.n));
}

function principalJson(ps: Principal[]): unknown {
  if (ps.some((p) => p.type === '*')) return '*';
  const out: Record<string, string | string[]> = {};
  for (const p of ps) {
    const prev = out[p.type];
    const ids = [...(prev === undefined ? [] : Array.isArray(prev) ? prev : [prev]), ...p.ids];
    out[p.type] = one(ids);
  }
  return out;
}

function conditionJson(cs: Condition[]): Record<string, Record<string, string | string[]>> {
  const out: Record<string, Record<string, string | string[]>> = {};
  for (const c of cs) (out[c.op] ??= {})[c.key] = one(c.values);
  return out;
}

function statementJson(s: Statement): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (s.sid) o.Sid = s.sid;
  o.Effect = s.effect;
  if (s.principals?.length) o.Principal = principalJson(s.principals);
  if (s.notActions?.length) o.NotAction = one(s.notActions);
  else o.Action = one(s.actions);
  if (s.notResources?.length) o.NotResource = one(s.notResources);
  else if (s.resources.length) o.Resource = one(s.resources);
  if (s.conditions?.length) o.Condition = conditionJson(s.conditions);
  return o;
}

function validate(kind: PolicyKind, statements: Statement[], catalog?: Catalog): PolicyWarning[] {
  const w: PolicyWarning[] = [];
  const err = (statement: number, message: string) => w.push({ level: 'error', statement, message });
  const warn = (statement: number, message: string) => w.push({ level: 'warn', statement, message });
  if (!statements.length) err(-1, 'A policy needs at least one statement.');
  const sids = new Set<string>();

  statements.forEach((s, i) => {
    const n = `Statement ${i + 1}`;
    if (s.sid !== undefined && s.sid !== '') {
      // IAM identity and trust policies take alphanumeric Sids only; S3 bucket policies also accept
      // spaces, hyphens, underscores and periods (AWS's own S3 examples use sentence-style Sids).
      if (kind !== 's3-bucket' && !SID_RE.test(s.sid)) err(i, `${n}: Sid "${s.sid}" may only contain letters A–Z, a–z and digits 0–9.`);
      if (sids.has(s.sid)) err(i, `${n}: Sid "${s.sid}" is already used; Sids must be unique within a policy.`);
      sids.add(s.sid);
    }
    if (s.effect !== 'Allow' && s.effect !== 'Deny') err(i, `${n}: Effect must be "Allow" or "Deny".`);

    const actions = s.actions ?? [];
    const notActions = s.notActions ?? [];
    if (actions.length && notActions.length) err(i, `${n}: use Action or NotAction, not both.`);
    if (!actions.length && !notActions.length) err(i, `${n}: add at least one action.`);
    for (const a of [...actions, ...notActions]) {
      if (a !== '*' && !ACTION_RE.test(a)) err(i, `${n}: "${a}" is not an action; use service:Action, e.g. s3:GetObject.`);
    }
    if (kind === 'trust') {
      // IAM: "AssumeRole policy may only specify STS AssumeRole actions."
      const bad = actions.filter((a) => !/^sts:/i.test(a));
      if (bad.length) err(i, `${n}: ${bad.join(', ')} cannot appear in a trust policy; it may list only sts: actions such as sts:AssumeRole.`);
    }

    const resources = s.resources ?? [];
    const notResources = s.notResources ?? [];
    if (kind === 'trust') {
      if (resources.length || notResources.length) err(i, `${n}: a trust policy cannot have a Resource or NotResource element.`);
    } else {
      if (resources.length && notResources.length) err(i, `${n}: use Resource or NotResource, not both.`);
      if (!resources.length && !notResources.length) err(i, `${n}: add at least one resource ARN (or "*").`);
      for (const r of [...resources, ...notResources]) {
        if (r !== '*' && !r.startsWith('arn:')) err(i, `${n}: resource "${r}" must be an ARN (arn:…) or "*".`);
        else if (r !== '*') {
          const parts = r.split(':');
          if (parts.length < 6 || !parts[1] || !parts[2] || !parts.slice(5).join(':')) {
            err(i, `${n}: "${r}" has no resource part; an ARN is arn:partition:service:region:account:resource.`);
          }
        }
      }
    }

    const principals = s.principals ?? [];
    if (kind === 'identity') {
      if (principals.length) err(i, `${n}: an identity-based policy cannot have a Principal; the identity it is attached to is the principal.`);
    } else {
      if (!principals.length) err(i, `${n}: a ${kind === 'trust' ? 'trust' : 'bucket'} policy statement needs a Principal.`);
      for (const p of principals) {
        if (p.type !== '*' && !p.ids.length) err(i, `${n}: the ${p.type} principal has no identifiers.`);
        for (const id of p.type === '*' ? [] : p.ids) {
          if (p.type === 'AWS' && id !== '*' && !/^\d{12}$/.test(id) && !id.startsWith('arn:')) {
            err(i, `${n}: "${id}" is not a valid AWS principal; use a 12-digit account ID or an ARN.`);
          }
          if (p.type === 'Federated' && id !== '*' && !id.startsWith('arn:') && !WEB_IDPS.includes(id)) {
            err(i, `${n}: Federated principal "${id}" needs an identity provider ARN (arn:aws:iam::<account>:oidc-provider/… or saml-provider/…).`);
          }
        }
      }
    }

    const conditions = s.conditions ?? [];
    const seen = new Set<string>();
    for (const c of conditions) {
      if (!isConditionOperator(c.op)) err(i, `${n}: "${c.op}" is not a condition operator.`);
      if (!c.key) err(i, `${n}: a ${c.op} condition needs a condition key.`);
      if (!c.values.length) err(i, `${n}: the ${c.op} condition on ${c.key || 'its key'} needs at least one value.`);
      const k = `${c.op}\u0000${c.key}`;
      if (seen.has(k)) err(i, `${n}: ${c.op} on ${c.key} appears twice; put both values in one condition.`);
      seen.add(k);
      // Type checks, as IAM Access Analyzer makes them: legal JSON that can never match.
      if (c.key && !COND_KEY_RE.test(c.key)) warn(i, `${n}: "${c.key}" is not a condition key; keys look like aws:SourceIp or s3:prefix.`);
      const base = c.op.replace(/^(?:ForAllValues|ForAnyValue):/, '').replace(/IfExists$/, '');
      if (base.startsWith('String') && IP_KEYS.includes(c.key.toLowerCase())) {
        warn(i, `${n}: ${c.op} compares ${c.key} as literal text, so a CIDR range never matches; use IpAddress or NotIpAddress.`);
      }
      for (const v of c.values) {
        if (v.includes('${')) continue; // policy variable, resolved at request time
        if (base.startsWith('Numeric') && !NUMBER_RE.test(v)) warn(i, `${n}: "${v}" is not a number, so ${c.op} on ${c.key} never matches.`);
        if (base.startsWith('Date') && !DATE_RE.test(v)) warn(i, `${n}: "${v}" is not an ISO 8601 date or epoch time, so ${c.op} on ${c.key} never matches.`);
      }
    }

    if (s.effect !== 'Allow') return;
    // Warnings — legal policies that grant more than they look like they do.
    if (notActions.length) warn(i, `${n}: Allow with NotAction grants every action except those listed, including ones AWS adds later.`);
    const star = actions.filter((a) => a === '*' || /^[a-z0-9-]+:\*$/.test(a));
    if (star.length) warn(i, `${n}: ${star.join(', ')} allows every action${star.includes('*') ? ' in every service' : ' in the service'}; list the actions you need.`);
    if (kind === 's3-bucket' && principals.some((p) => p.type === '*' || p.ids.includes('*')) && !conditions.length) {
      warn(i, `${n}: Principal "*" with no Condition makes this statement public to anyone on the internet.`);
    }
    if (kind === 'trust' && principals.some((p) => p.type === '*' || p.ids.includes('*')) && !conditions.length) {
      err(i, `${n}: Principal "*" with no Condition lets any AWS principal in any account assume this role; add a Condition such as aws:PrincipalOrgID or sts:ExternalId.`);
    }
    if (catalog) {
      const pm = new Set<string>();
      const scoped = new Set<string>();
      for (const a of actions) {
        const m = matchActions(catalog, a);
        if (m === null) continue;
        if (!m.length) warn(i, `${n}: ${a} matches no action in the ${a.split(':')[0]} catalogue; check the spelling.`);
        for (const x of m) {
          const name = `${a.split(':')[0]}:${x.n}`;
          if (x.l === 'Permissions management') pm.add(name);
          if (kind === 'identity' && resources.includes('*') && x.r.length && (x.l === 'Write' || x.l === 'Permissions management')) scoped.add(name);
        }
        // The classic S3 mistake: a bucket action on object ARNs (bucket/*) or the reverse grants nothing.
        if (/[*?]/.test(a) || !/^s3:/i.test(a) || m.length !== 1) continue;
        const r = m[0].r;
        const onBucket = r.includes('bucket');
        const onObject = r.includes('object');
        if (!onBucket && !onObject) continue;
        const s3 = resources.filter((x) => /^arn:[^:]+:s3:::./.test(x));
        if (!s3.length || s3.length !== resources.length) continue;
        const fits = s3.some((x) => {
          const rest = x.slice(x.indexOf(':::') + 3);
          if (rest.includes('/')) return onObject;
          return /[*?]/.test(rest) || onBucket;
        });
        if (!fits) {
          warn(i, `${n}: ${a} acts on ${onBucket ? 'bucket ARNs (arn:aws:s3:::bucket-name)' : 'object ARNs (arn:aws:s3:::bucket-name/*)'}, not on the listed resources, so this grant has no effect.`);
        }
      }
      const list = (xs: Set<string>) => {
        const a = [...xs];
        return a.slice(0, 3).join(', ') + (a.length > 3 ? ` and ${a.length - 3} more` : '');
      };
      if (pm.size) warn(i, `${n}: ${list(pm)} ${pm.size === 1 ? 'is a Permissions management action' : 'are Permissions management actions'} that can change who has access; scope it tightly.`);
      if (scoped.size) warn(i, `${n}: Resource "*" on ${list(scoped)}, which ${scoped.size === 1 ? 'supports' : 'support'} resource-level permissions; name the ARNs instead.`);
    }
  });
  return w;
}

export function buildPolicy(kind: PolicyKind, statements: Statement[], catalog?: Catalog, limitKey?: keyof typeof LIMITS): PolicyResult {
  const policy = { Version: VERSION, Statement: statements.map(statementJson) };
  const minifiedLength = JSON.stringify(policy).length;
  const limit = LIMITS[limitKey ?? (kind === 's3-bucket' ? 's3-bucket' : kind === 'trust' ? 'trust' : 'managed')];
  const warnings = validate(kind, statements, catalog);
  const overLimit = minifiedLength > limit.chars;
  if (overLimit) warnings.push({ level: 'error', statement: -1, message: `The policy is ${minifiedLength} characters without whitespace; the ${limit.label.toLowerCase()} limit is ${limit.chars}.` });
  return {
    kind,
    json: JSON.stringify(policy, null, 2),
    minifiedLength,
    limit,
    overLimit,
    warnings,
    valid: !warnings.some((x) => x.level === 'error'),
  };
}

/** HCL quoted string. `${` and `%{` are template sequences in HCL, so IAM policy variables must be doubled. */
const hcl = (s: string) =>
  '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/\$\{/g, () => '$${').replace(/%\{/g, '%%{') + '"';
const hclList = (xs: string[]) => `[${xs.map(hcl).join(', ')}]`;

/** A `data "aws_iam_policy_document"` block equivalent to the statements. */
export function toTerraform(statements: Statement[], name = 'policy'): string {
  const id = name.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^(?=[^A-Za-z_])/, '_') || 'policy';
  const L: string[] = [`data "aws_iam_policy_document" "${id}" {`];
  for (const s of statements) {
    L.push('  statement {');
    // terraform fmt aligns the `=` of consecutive attributes.
    const attrs: [string, string][] = [];
    if (s.sid) attrs.push(['sid', hcl(s.sid)]);
    attrs.push(['effect', hcl(s.effect)]);
    if (s.actions.length) attrs.push(['actions', hclList(s.actions)]);
    if (s.notActions?.length) attrs.push(['not_actions', hclList(s.notActions)]);
    if (s.resources.length) attrs.push(['resources', hclList(s.resources)]);
    if (s.notResources?.length) attrs.push(['not_resources', hclList(s.notResources)]);
    const w = Math.max(...attrs.map(([k]) => k.length));
    for (const [k, v] of attrs) L.push(`    ${k.padEnd(w)} = ${v}`);
    for (const p of s.principals ?? []) {
      L.push('    principals {', `      type        = ${hcl(p.type)}`, `      identifiers = ${hclList(p.type === '*' ? ['*'] : p.ids)}`, '    }');
    }
    for (const c of s.conditions ?? []) {
      L.push('    condition {', `      test     = ${hcl(c.op)}`, `      variable = ${hcl(c.key)}`, `      values   = ${hclList(c.values)}`, '    }');
    }
    L.push('  }');
  }
  L.push('}');
  return L.join('\n') + '\n';
}

/** ARN formats for a resource type, with the partition filled in as `aws`. Empty when unknown. */
export function arnTemplate(catalog: Catalog, service: string, resourceType: string): string[] {
  const r = catalog.services[service]?.resources.find((x) => x.name === resourceType);
  return r ? r.arnFormats.map((f) => f.replace(/\$\{Partition\}/g, 'aws')) : [];
}

/** A service's actions, optionally filtered to the given access levels. */
export function actionsFor(catalog: Catalog, service: string, levels?: AccessLevel[]): CatalogAction[] {
  const all = catalog.services[service]?.actions ?? [];
  return levels?.length ? all.filter((a) => levels.includes(a.l)) : all;
}

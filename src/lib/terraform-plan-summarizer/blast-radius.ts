/**
 * blast-radius.ts — which destructive actions deserve to be read first.
 *
 * A plan's danger is not proportional to its size: 40 tag updates are noise and
 * one `-/+ aws_db_instance` is an outage. This module is a deliberately small,
 * AUDITABLE table — 17 patterns, each with the class of damage and a sentence
 * naming what specifically breaks. It is exported so the page can print it and a
 * reader can disagree with it; a hidden heuristic would be worse than none.
 *
 * Two rules keep it honest:
 *
 *  1. **Only destructive actions are flagged** — `delete` and `replace`. Creating
 *     a database is not a blast radius, and flagging it would train people to
 *     ignore the band. `forget` (a `removed` block that keeps the real object) is
 *     not destructive either.
 *  2. **A non-match is never "safe"** — it is unclassified. The page says so.
 *     Nobody can enumerate every provider's stateful resources, and pretending
 *     otherwise is the confidently-wrong failure this tool exists to prevent.
 */
import type { PlanAction, RiskClass, RiskVerdict } from './types';

type MatchKind = 'exact' | 'prefix' | 'suffix' | 'prefix-suffix';

export interface RiskRule {
  /** Human-readable pattern, e.g. `aws_efs_*` or `*_nat_gateway`. */
  pattern: string;
  kind: MatchKind;
  klass: RiskClass;
  /** Set for `prefix` and `prefix-suffix`. */
  prefix?: string;
  /** Set for `suffix` and `prefix-suffix`. */
  suffix?: string;
  /** Takes the concrete type so a wildcard rule names the real resource. */
  reason: (type: string) => string;
}

/** Checked in order; the first match wins. Exact patterns come first. */
export const RISK_PATTERNS: RiskRule[] = [
  {
    pattern: 'aws_db_instance',
    kind: 'exact',
    klass: 'data-store',
    reason: (t) =>
      `Destroying an ${t} drops the database and everything in it. Only a final snapshot ` +
      '(skip_final_snapshot = false) or a backup taken beforehand survives — Terraform takes neither.',
  },
  {
    pattern: 'aws_rds_cluster',
    kind: 'exact',
    klass: 'data-store',
    reason: (t) =>
      `Destroying an ${t} removes the cluster and its storage volume. Every reader endpoint ` +
      'disappears with it, and only a snapshot taken beforehand can bring the data back.',
  },
  {
    pattern: 'aws_dynamodb_table',
    kind: 'exact',
    klass: 'data-store',
    reason: (t) =>
      `Destroying an ${t} deletes every item in it. Point-in-time recovery has to have been ` +
      'enabled BEFORE this apply for any of it to be recoverable.',
  },
  {
    pattern: 'aws_instance',
    kind: 'exact',
    klass: 'data-store',
    reason: (t) =>
      `Replacing an ${t} discards whatever was written to its root and instance-store volumes. ` +
      'Only separately managed EBS volumes survive, and its private IP and instance id change.',
  },
  {
    pattern: 'aws_ebs_volume',
    kind: 'exact',
    klass: 'data-store',
    reason: (t) =>
      `Destroying an ${t} deletes the block device and the filesystem on it. A snapshot is the ` +
      'only way back, and this plan does not take one.',
  },
  {
    pattern: 'aws_s3_bucket',
    kind: 'exact',
    klass: 'data-store',
    reason: (t) =>
      `Destroying an ${t} needs the bucket empty, or force_destroy = true — and with ` +
      'force_destroy every object AND every noncurrent version is deleted, silently.',
  },
  {
    pattern: 'aws_msk_cluster',
    kind: 'exact',
    klass: 'data-store',
    reason: (t) =>
      `Replacing an ${t} replaces the brokers and their storage, so retained topic data and ` +
      'every stored consumer offset go with them.',
  },
  {
    pattern: 'aws_opensearch_domain',
    kind: 'exact',
    klass: 'data-store',
    reason: (t) =>
      `Destroying an ${t} deletes every index in it. Only a snapshot already written to a ` +
      'separate repository survives the apply.',
  },
  {
    pattern: 'google_sql_database_instance',
    kind: 'exact',
    klass: 'data-store',
    reason: (t) =>
      `Destroying a ${t} drops the database. deletion_protection has to be off for this apply ` +
      'to run at all, which means the last guard has already been removed.',
  },
  {
    pattern: 'aws_eks_cluster',
    kind: 'exact',
    klass: 'control-plane',
    reason: (t) =>
      `Replacing an ${t} replaces the control plane: the API endpoint and cluster CA change, ` +
      'every kubeconfig and in-cluster service account token stops working, and node groups must rejoin.',
  },
  {
    pattern: 'google_container_cluster',
    kind: 'exact',
    klass: 'control-plane',
    reason: (t) =>
      `Replacing a ${t} replaces the control plane, so the API endpoint and cluster CA change ` +
      'and every node pool is rebuilt underneath your workloads.',
  },
  {
    pattern: 'azurerm_kubernetes_cluster',
    kind: 'exact',
    klass: 'control-plane',
    reason: (t) =>
      `Replacing an ${t} replaces the control plane and its node pools: kubeconfigs, the API ` +
      'FQDN and every persistent-volume binding are invalidated.',
  },
  {
    pattern: 'aws_elasticache_*',
    kind: 'prefix',
    prefix: 'aws_elasticache_',
    klass: 'data-store',
    reason: (t) =>
      `Replacing ${t} throws away the cache: sessions, queues and anything else that only ever ` +
      'lived in memory are gone, and the endpoint address changes.',
  },
  {
    pattern: 'aws_efs_*',
    kind: 'prefix',
    prefix: 'aws_efs_',
    klass: 'data-store',
    reason: (t) =>
      `Destroying ${t} deletes the shared filesystem and everything mounted clients had written ` +
      'to it. Every mount target goes with it.',
  },
  {
    pattern: 'azurerm_*_database',
    kind: 'prefix-suffix',
    prefix: 'azurerm_',
    suffix: '_database',
    klass: 'data-store',
    reason: (t) =>
      `Destroying ${t} drops the database and its data. Point-in-time restore depends on a ` +
      'retention window tied to the server, so it does not survive the server being replaced.',
  },
  {
    pattern: '*_nat_gateway',
    kind: 'suffix',
    suffix: '_nat_gateway',
    klass: 'egress-path',
    reason: (t) =>
      `Replacing ${t} changes the public egress IP address. Anything that allow-lists it — a ` +
      'partner API, a database firewall, an SFTP endpoint — starts refusing your traffic.',
  },
  {
    pattern: '*_kms_key',
    kind: 'suffix',
    suffix: '_kms_key',
    klass: 'crypto-key',
    reason: (t) =>
      `Destroying ${t} schedules the key for deletion. When the waiting period ends, everything ` +
      'encrypted with it becomes unreadable forever — including snapshots and old backups.',
  },
];

/** Short, human label for a class. Used by the UI and the Markdown report. */
export const RISK_CLASS_LABEL: Record<RiskClass, string> = {
  'data-store': 'data store',
  'egress-path': 'egress path',
  'control-plane': 'control plane',
  'crypto-key': 'encryption key',
};

function matches(rule: RiskRule, type: string): boolean {
  switch (rule.kind) {
    case 'exact':
      return type === rule.pattern;
    case 'prefix':
      return rule.prefix !== undefined && type.startsWith(rule.prefix) && type.length > rule.prefix.length;
    case 'suffix':
      return rule.suffix !== undefined && type.endsWith(rule.suffix) && type.length > rule.suffix.length;
    case 'prefix-suffix':
      return (
        rule.prefix !== undefined &&
        rule.suffix !== undefined &&
        type.startsWith(rule.prefix) &&
        type.endsWith(rule.suffix) &&
        type.length > rule.prefix.length + rule.suffix.length
      );
    default:
      return false;
  }
}

/** Non-null only for a destructive action on a type in the table above. */
export function classifyRisk(type: string, action: PlanAction): RiskVerdict | null {
  if (action !== 'delete' && action !== 'replace') return null;
  if (type.length === 0) return null;
  for (const rule of RISK_PATTERNS) {
    if (matches(rule, type)) {
      return { klass: rule.klass, pattern: rule.pattern, reason: rule.reason(type) };
    }
  }
  return null;
}

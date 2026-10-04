/**
 * AWS IAM Policy Generator — shared types. The catalogue (src/data/iam-catalog.json) is
 * always passed in; nothing here imports it.
 */
export type AccessLevel = 'List' | 'Read' | 'Write' | 'Permissions management' | 'Tagging';

export interface CatalogAction {
  n: string;
  l: AccessLevel;
  /** Resource type names (keys into CatalogService.resources). Empty = the action only supports Resource "*". */
  r: string[];
  /** Condition keys. */
  c: string[];
}

export interface CatalogService {
  prefix: string;
  name: string;
  version: string;
  modified: string;
  actions: CatalogAction[];
  resources: { name: string; arnFormats: string[] }[];
  conditionKeys: { name: string; types: string[] }[];
}

export interface Catalog {
  generatedAt: string;
  source: string;
  services: Record<string, CatalogService>;
}

/**
 * - `identity`: attached to a user/group/role. Principal forbidden, Resource required.
 * - `s3-bucket`: an S3 bucket (resource-based) policy. Principal and Resource required.
 * - `trust`: a role trust policy (AssumeRolePolicyDocument). Principal required, Resource
 *   forbidden — IAM rejects a trust policy that carries a Resource element.
 */
export type PolicyKind = 'identity' | 's3-bucket' | 'trust';

/** `type: '*'` renders as `"Principal": "*"` (ids ignored). */
export interface Principal {
  type: 'AWS' | 'Service' | 'Federated' | '*';
  ids: string[];
}

export interface Condition {
  op: string;
  key: string;
  values: string[];
}

export interface Statement {
  sid?: string;
  effect: 'Allow' | 'Deny';
  actions: string[];
  notActions?: string[];
  resources: string[];
  notResources?: string[];
  principals?: Principal[];
  conditions?: Condition[];
}

/** `statement` is the 0-based statement index, or -1 for a policy-level message. */
export interface PolicyWarning {
  level: 'warn' | 'error';
  statement: number;
  message: string;
}

export interface PolicyResult {
  kind: PolicyKind;
  /** Pretty, 2-space. */
  json: string;
  /** Length of the whitespace-free JSON, which is what IAM counts against its quotas. */
  minifiedLength: number;
  limit: { label: string; chars: number };
  overLimit: boolean;
  warnings: PolicyWarning[];
  /** No `error`-level warnings and not over the limit. */
  valid: boolean;
}

import { existsSync, readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { buildPolicy, toTerraform, arnTemplate, actionsFor, isConditionOperator, LIMITS, VERSION } from './engine';
import { PRESETS } from './presets';
import { FIXTURE_CATALOG as cat } from './fixture-catalog';
import type { Catalog, PolicyResult, Statement } from './types';

const allow = (actions: string[], resources: string[], extra: Partial<Statement> = {}): Statement => ({ effect: 'Allow', actions, resources, ...extra });
const errors = (r: PolicyResult) => r.warnings.filter((w) => w.level === 'error').map((w) => w.message);
const warns = (r: PolicyResult) => r.warnings.filter((w) => w.level === 'warn').map((w) => w.message);

describe('JSON shape', () => {
  it('single values are strings, multiple are arrays; Version is fixed', () => {
    const p = JSON.parse(buildPolicy('identity', [allow(['s3:GetObject'], ['arn:aws:s3:::b/*']), allow(['s3:GetObject', 's3:PutObject'], ['arn:aws:s3:::b/a', 'arn:aws:s3:::b/c'])]).json);
    expect(p.Version).toBe(VERSION);
    expect(p.Statement[0]).toEqual({ Effect: 'Allow', Action: 's3:GetObject', Resource: 'arn:aws:s3:::b/*' });
    expect(p.Statement[1].Action).toEqual(['s3:GetObject', 's3:PutObject']);
    expect(p.Statement[1].Resource).toHaveLength(2);
  });
  it('pretty-prints with 2 spaces and orders Sid, Effect, Principal, Action, Resource, Condition', () => {
    const r = buildPolicy('s3-bucket', [
      allow(['s3:GetObject'], ['arn:aws:s3:::b/*'], { sid: 'A', principals: [{ type: 'AWS', ids: ['arn:aws:iam::111122223333:root'] }], conditions: [{ op: 'Bool', key: 'aws:SecureTransport', values: ['true'] }] }),
    ]);
    expect(r.json.split('\n')[1]).toBe('  "Version": "2012-10-17",');
    expect(Object.keys(JSON.parse(r.json).Statement[0])).toEqual(['Sid', 'Effect', 'Principal', 'Action', 'Resource', 'Condition']);
  });
  it('Principal renders as {"AWS": ...}, merges ids of a type, and "*" as a bare string', () => {
    const st = (principals: Statement['principals']) => JSON.parse(buildPolicy('s3-bucket', [allow(['s3:GetObject'], ['arn:aws:s3:::b/*'], { principals, conditions: [{ op: 'Bool', key: 'aws:SecureTransport', values: ['true'] }] })]).json).Statement[0].Principal;
    expect(st([{ type: 'AWS', ids: ['arn:aws:iam::111122223333:root'] }])).toEqual({ AWS: 'arn:aws:iam::111122223333:root' });
    expect(st([{ type: 'Service', ids: ['a.amazonaws.com'] }, { type: 'Service', ids: ['b.amazonaws.com'] }])).toEqual({ Service: ['a.amazonaws.com', 'b.amazonaws.com'] });
    expect(st([{ type: '*', ids: [] }])).toBe('*');
  });
  it('Condition renders as {op: {key: value-or-array}}, grouping keys under one operator', () => {
    const c = JSON.parse(buildPolicy('identity', [allow(['s3:GetObject'], ['arn:aws:s3:::b/*'], { conditions: [
      { op: 'StringEquals', key: 'aws:PrincipalTag/team', values: ['ops'] },
      { op: 'StringEquals', key: 'aws:RequestedRegion', values: ['us-east-1', 'eu-west-1'] },
      { op: 'IpAddress', key: 'aws:SourceIp', values: ['203.0.113.0/24'] },
    ] })]).json).Statement[0].Condition;
    expect(c).toEqual({ StringEquals: { 'aws:PrincipalTag/team': 'ops', 'aws:RequestedRegion': ['us-east-1', 'eu-west-1'] }, IpAddress: { 'aws:SourceIp': '203.0.113.0/24' } });
  });
  it('NotAction / NotResource replace Action / Resource', () => {
    const s = JSON.parse(buildPolicy('identity', [{ effect: 'Deny', actions: [], notActions: ['iam:*'], resources: [], notResources: ['arn:aws:s3:::b'] }]).json).Statement[0];
    expect(s).toEqual({ Effect: 'Deny', NotAction: 'iam:*', NotResource: 'arn:aws:s3:::b' });
  });
});

describe('grammar errors', () => {
  const ok = allow(['s3:GetObject'], ['arn:aws:s3:::b/*']);
  it('accepts a well-formed identity policy', () => {
    const r = buildPolicy('identity', [ok], cat);
    expect(r.valid).toBe(true);
    expect(r.warnings).toEqual([]);
  });
  it('no statements', () => expect(errors(buildPolicy('identity', []))[0]).toMatch(/at least one statement/));
  it('Sid must be alphanumeric', () => {
    expect(errors(buildPolicy('identity', [{ ...ok, sid: 'read-objects' }]))[0]).toMatch(/may only contain/);
    expect(buildPolicy('identity', [{ ...ok, sid: 'ReadObjects2' }]).valid).toBe(true);
  });
  it('S3 bucket policies accept sentence-style Sids; identity and trust policies do not', () => {
    const pub = { ...ok, principals: [{ type: '*' as const, ids: ['*'] }], sid: 'Allow public read from www.example.com' };
    expect(buildPolicy('s3-bucket', [pub]).valid).toBe(true);
    expect(errors(buildPolicy('identity', [{ ...ok, sid: 'Allow public read' }]))[0]).toMatch(/may only contain/);
  });
  it('accepts an upper-case service prefix (IAM matches it case-insensitively)', () => {
    expect(buildPolicy('identity', [allow(['S3:GetObject'], ['arn:aws:s3:::b/*'])], cat).valid).toBe(true);
  });
  it('Sid must be unique', () => {
    expect(errors(buildPolicy('identity', [{ ...ok, sid: 'A' }, { ...ok, sid: 'A' }]))[0]).toMatch(/unique/);
    expect(buildPolicy('identity', [{ ...ok, sid: 'A' }, { ...ok, sid: 'B' }]).valid).toBe(true);
  });
  it('Effect must be Allow or Deny', () => {
    expect(errors(buildPolicy('identity', [{ ...ok, effect: 'allow' as never }]))[0]).toMatch(/Effect/);
  });
  it('Action and NotAction are exclusive, and one is required', () => {
    expect(errors(buildPolicy('identity', [{ ...ok, notActions: ['s3:PutObject'] }]))).toContain('Statement 1: use Action or NotAction, not both.');
    expect(errors(buildPolicy('identity', [{ ...ok, actions: [] }]))[0]).toMatch(/at least one action/);
  });
  it('Resource and NotResource are exclusive, and one is required', () => {
    expect(errors(buildPolicy('identity', [{ ...ok, notResources: ['arn:aws:s3:::c'] }]))[0]).toMatch(/Resource or NotResource, not both/);
    expect(errors(buildPolicy('identity', [{ ...ok, resources: [] }]))[0]).toMatch(/at least one resource/);
  });
  it('rejects malformed actions and resources', () => {
    expect(errors(buildPolicy('identity', [allow(['GetObject'], ['*'])]))[0]).toMatch(/is not an action/);
    expect(errors(buildPolicy('identity', [allow(['s3:GetObject'], ['example-bucket'])]))[0]).toMatch(/must be an ARN/);
  });
  it('identity policies cannot have a Principal', () => {
    expect(errors(buildPolicy('identity', [{ ...ok, principals: [{ type: 'AWS', ids: ['arn:aws:iam::111122223333:root'] }] }]))[0]).toMatch(/cannot have a Principal/);
  });
  it('bucket and trust policies need a Principal with identifiers', () => {
    expect(errors(buildPolicy('s3-bucket', [ok]))[0]).toMatch(/needs a Principal/);
    expect(errors(buildPolicy('trust', [{ ...ok, resources: [] }]))[0]).toMatch(/trust policy statement needs a Principal/);
    expect(errors(buildPolicy('s3-bucket', [{ ...ok, principals: [{ type: 'AWS', ids: [] }] }]))[0]).toMatch(/no identifiers/);
  });
  it('trust policies cannot have a Resource', () => {
    const fed = { principals: [{ type: 'Federated' as const, ids: ['arn:aws:iam::111122223333:oidc-provider/x'] }] };
    expect(errors(buildPolicy('trust', [allow(['sts:AssumeRoleWithWebIdentity'], ['*'], fed)]))[0]).toMatch(/cannot have a Resource/);
    expect(buildPolicy('trust', [allow(['sts:AssumeRoleWithWebIdentity'], [], fed)], cat).valid).toBe(true);
  });
  it('validates condition operators, keys, values and duplicates', () => {
    const c = (conditions: Statement['conditions']) => errors(buildPolicy('identity', [{ ...ok, conditions }]));
    expect(c([{ op: 'StringEqual', key: 'aws:SourceIp', values: ['x'] }])[0]).toMatch(/not a condition operator/);
    expect(c([{ op: 'StringEquals', key: '', values: ['x'] }])[0]).toMatch(/needs a condition key/);
    expect(c([{ op: 'StringEquals', key: 'k', values: [] }])[0]).toMatch(/at least one value/);
    expect(c([{ op: 'StringEquals', key: 'k', values: ['a'] }, { op: 'StringEquals', key: 'k', values: ['b'] }])[0]).toMatch(/appears twice/);
  });
});

describe('condition operators', () => {
  it.each(['StringLike', 'NumericLessThanEquals', 'DateGreaterThan', 'Bool', 'BinaryEquals', 'IpAddress', 'NotIpAddress', 'ArnLike', 'Null',
    'StringEqualsIfExists', 'BoolIfExists', 'ForAllValues:StringLike', 'ForAnyValue:StringEquals', 'ForAnyValue:StringLikeIfExists'])('%s is valid', (op) => expect(isConditionOperator(op)).toBe(true));
  it.each(['NullIfExists', 'StringEqual', 'stringequals', 'ForSomeValues:StringLike', 'IfExists', 'StringEqualsIfExistsIfExists'])('%s is invalid', (op) => expect(isConditionOperator(op)).toBe(false));
});

describe('limits', () => {
  const big = (n: number) => [allow(Array.from({ length: n }, (_, i) => `s3:GetObjectVersion${i}`), ['arn:aws:s3:::b/*'])];
  it('defaults: managed for identity, 20 KB for bucket, 2,048 for trust', () => {
    expect(LIMITS.managed.chars).toBe(6144);
    expect(LIMITS['inline-user'].chars).toBe(2048);
    expect(LIMITS['inline-role'].chars).toBe(10240);
    expect(LIMITS['inline-group'].chars).toBe(5120);
    expect(LIMITS['s3-bucket'].chars).toBe(20480);
    expect(buildPolicy('identity', big(1)).limit).toBe(LIMITS.managed);
    expect(buildPolicy('s3-bucket', big(1)).limit).toBe(LIMITS['s3-bucket']);
    expect(buildPolicy('trust', []).limit).toBe(LIMITS.trust);
  });
  it('counts characters without whitespace', () => {
    const r = buildPolicy('identity', big(1));
    expect(r.minifiedLength).toBe(r.json.replace(/\s/g, '').length);
  });
  it('flags a policy over the chosen limit as an error, and not one under it', () => {
    const r = buildPolicy('identity', big(100), undefined, 'inline-user');
    expect(r.minifiedLength).toBeGreaterThan(2048);
    expect(r.overLimit).toBe(true);
    expect(r.valid).toBe(false);
    expect(errors(r).at(-1)).toMatch(/limit is 2048/);
    const ok = buildPolicy('identity', big(100), undefined, 'inline-role');
    expect(ok.overLimit).toBe(false);
    expect(ok.valid).toBe(true);
  });
});

describe('warnings (true and false positives)', () => {
  it('"*" and "svc:*" actions', () => {
    expect(warns(buildPolicy('identity', [allow(['*'], ['*'])]))[0]).toMatch(/every action in every service/);
    expect(warns(buildPolicy('identity', [allow(['s3:*'], ['arn:aws:s3:::b'])]))[0]).toMatch(/every action in the service/);
    expect(warns(buildPolicy('identity', [allow(['s3:Get*'], ['arn:aws:s3:::b/*'])]))).toEqual([]);
    expect(warns(buildPolicy('identity', [{ effect: 'Deny', actions: ['*'], resources: ['*'] }]))).toEqual([]);
  });
  it('Resource "*" on a scoped Write / Permissions management action (needs the catalogue)', () => {
    expect(warns(buildPolicy('identity', [allow(['s3:PutObject'], ['*'])], cat))[0]).toMatch(/Resource "\*" on s3:PutObject/);
    expect(warns(buildPolicy('identity', [allow(['s3:PutObject'], ['*'])]))).toEqual([]); // no catalogue
    expect(warns(buildPolicy('identity', [allow(['s3:PutObject'], ['arn:aws:s3:::b/*'])], cat))).toEqual([]);
    expect(warns(buildPolicy('identity', [allow(['s3:GetObject'], ['*'])], cat))).toEqual([]); // Read
    expect(warns(buildPolicy('identity', [allow(['ecr:GetAuthorizationToken'], ['*'])], cat))).toEqual([]); // no resource type
  });
  it('wildcards expand against the catalogue', () => {
    expect(warns(buildPolicy('identity', [allow(['s3:Put*'], ['*'])], cat)).join('\n')).toMatch(/s3:PutObject, s3:PutBucketPolicy/);
  });
  it('Permissions management actions', () => {
    expect(warns(buildPolicy('identity', [allow(['kms:CreateGrant'], ['arn:aws:kms:us-east-1:123456789012:key/k'])], cat))[0]).toMatch(/kms:CreateGrant is a Permissions management action/);
    expect(warns(buildPolicy('identity', [allow(['kms:Decrypt'], ['arn:aws:kms:us-east-1:123456789012:key/k'])], cat))).toEqual([]);
  });
  it('unknown actions in a catalogued service; uncatalogued services pass', () => {
    expect(warns(buildPolicy('identity', [allow(['s3:GetObjekt'], ['arn:aws:s3:::b/*'])], cat))[0]).toMatch(/matches no action/);
    expect(warns(buildPolicy('identity', [allow(['ec2:DescribeInstances'], ['*'])], cat))).toEqual([]);
  });
  it('Allow with NotAction', () => {
    expect(warns(buildPolicy('identity', [{ effect: 'Allow', actions: [], notActions: ['iam:*'], resources: ['*'] }]))[0]).toMatch(/NotAction grants every action except/);
    expect(warns(buildPolicy('identity', [{ effect: 'Deny', actions: [], notActions: ['iam:*'], resources: ['*'] }]))).toEqual([]);
  });
  it('bucket Principal "*" without a Condition', () => {
    const pub = allow(['s3:GetObject'], ['arn:aws:s3:::b/*'], { principals: [{ type: '*', ids: [] }] });
    expect(warns(buildPolicy('s3-bucket', [pub]))[0]).toMatch(/public to anyone/);
    expect(warns(buildPolicy('s3-bucket', [{ ...pub, principals: [{ type: 'AWS', ids: ['*'] }] }]))[0]).toMatch(/public to anyone/);
    expect(warns(buildPolicy('s3-bucket', [{ ...pub, conditions: [{ op: 'StringEquals', key: 'aws:SourceVpce', values: ['vpce-1a2b3c4d'] }] }]))).toEqual([]);
    expect(warns(buildPolicy('s3-bucket', [{ ...pub, principals: [{ type: 'AWS', ids: ['arn:aws:iam::111122223333:root'] }] }]))).toEqual([]);
  });
});

describe('presets', () => {
  it('there are six with unique slugs', () => {
    expect(PRESETS.map((p) => p.slug)).toEqual(['s3-read-only-bucket', 's3-bucket-public-read', 'lambda-basic-execution', 'ecr-pull', 'kms-decrypt-key', 'github-actions-oidc-trust']);
  });
  it.each(PRESETS)('$slug is valid; only the public-read preset warns', (p) => {
    const r = buildPolicy(p.kind, p.statements, cat);
    expect(errors(r)).toEqual([]);
    expect(warns(r).length > 0).toBe(p.slug === 's3-bucket-public-read');
  });

  const real = new URL('../../data/iam-catalog.json', import.meta.url);
  it.skipIf(!existsSync(real))('every preset action resolves in the real catalogue', () => {
    const catalog = JSON.parse(readFileSync(real, 'utf8')) as Catalog;
    for (const p of PRESETS) {
      for (const s of p.statements) for (const a of s.actions) {
        const [svc, name] = a.split(':');
        expect(catalog.services[svc]?.actions.some((x) => x.n === name), a).toBe(true);
      }
      expect(errors(buildPolicy(p.kind, p.statements, catalog))).toEqual([]);
    }
  });

  it('Terraform goldens', () => {
    expect(Object.fromEntries(PRESETS.map((p) => [p.slug, toTerraform(p.statements, p.slug.replace(/-/g, '_'))]))).toMatchInlineSnapshot(`
      {
        "ecr-pull": "data "aws_iam_policy_document" "ecr_pull" {
        statement {
          sid       = "GetAuthToken"
          effect    = "Allow"
          actions   = ["ecr:GetAuthorizationToken"]
          resources = ["*"]
        }
        statement {
          sid       = "PullImages"
          effect    = "Allow"
          actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
          resources = ["arn:aws:ecr:us-east-1:123456789012:repository/my-repo"]
        }
      }
      ",
        "github-actions-oidc-trust": "data "aws_iam_policy_document" "github_actions_oidc_trust" {
        statement {
          effect  = "Allow"
          actions = ["sts:AssumeRoleWithWebIdentity"]
          principals {
            type        = "Federated"
            identifiers = ["arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"]
          }
          condition {
            test     = "StringEquals"
            variable = "token.actions.githubusercontent.com:aud"
            values   = ["sts.amazonaws.com"]
          }
          condition {
            test     = "StringLike"
            variable = "token.actions.githubusercontent.com:sub"
            values   = ["repo:my-org/my-repo:ref:refs/heads/main"]
          }
        }
      }
      ",
        "kms-decrypt-key": "data "aws_iam_policy_document" "kms_decrypt_key" {
        statement {
          sid       = "DecryptViaS3"
          effect    = "Allow"
          actions   = ["kms:Decrypt"]
          resources = ["arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab"]
          condition {
            test     = "StringEquals"
            variable = "kms:ViaService"
            values   = ["s3.us-east-1.amazonaws.com"]
          }
        }
      }
      ",
        "lambda-basic-execution": "data "aws_iam_policy_document" "lambda_basic_execution" {
        statement {
          sid       = "CreateLogGroup"
          effect    = "Allow"
          actions   = ["logs:CreateLogGroup"]
          resources = ["arn:aws:logs:us-east-1:123456789012:*"]
        }
        statement {
          sid       = "WriteLogs"
          effect    = "Allow"
          actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
          resources = ["arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/my-function:*"]
        }
      }
      ",
        "s3-bucket-public-read": "data "aws_iam_policy_document" "s3_bucket_public_read" {
        statement {
          sid       = "PublicReadGetObject"
          effect    = "Allow"
          actions   = ["s3:GetObject"]
          resources = ["arn:aws:s3:::example-bucket/*"]
          principals {
            type        = "*"
            identifiers = ["*"]
          }
        }
      }
      ",
        "s3-read-only-bucket": "data "aws_iam_policy_document" "s3_read_only_bucket" {
        statement {
          sid       = "ListBucket"
          effect    = "Allow"
          actions   = ["s3:ListBucket"]
          resources = ["arn:aws:s3:::example-bucket"]
        }
        statement {
          sid       = "ReadObjects"
          effect    = "Allow"
          actions   = ["s3:GetObject"]
          resources = ["arn:aws:s3:::example-bucket/*"]
        }
      }
      ",
      }
    `);
  });
});

describe('toTerraform', () => {
  it('escapes HCL strings and doubles template sequences', () => {
    const tf = toTerraform([allow(['s3:GetObject'], ['arn:aws:s3:::b/${aws:username}/*'], { conditions: [{ op: 'StringLike', key: 'k', values: ['a"b\\c', '%{x}'] }] })]);
    expect(tf).toContain('resources = ["arn:aws:s3:::b/$${aws:username}/*"]');
    expect(tf).toContain('values   = ["a\\"b\\\\c", "%%{x}"]');
  });
  it('defaults the name and sanitises it', () => {
    expect(toTerraform([]).startsWith('data "aws_iam_policy_document" "policy" {')).toBe(true);
    expect(toTerraform([], 'my policy!').startsWith('data "aws_iam_policy_document" "my_policy_" {')).toBe(true);
    expect(toTerraform([], '9x').startsWith('data "aws_iam_policy_document" "_9x" {')).toBe(true);
  });
  it('renders not_actions / not_resources and a "*" principal', () => {
    const tf = toTerraform([{ effect: 'Deny', actions: [], notActions: ['iam:*'], resources: [], notResources: ['arn:aws:s3:::b'], principals: [{ type: '*', ids: [] }] }]);
    expect(tf).toContain('    not_actions   = ["iam:*"]\n    not_resources = ["arn:aws:s3:::b"]');
    expect(tf).toContain('      type        = "*"\n      identifiers = ["*"]');
  });
});

describe('catalogue helpers', () => {
  it('arnTemplate fills the partition', () => {
    expect(arnTemplate(cat, 's3', 'object')).toEqual(['arn:aws:s3:::${BucketName}/${ObjectName}']);
    expect(arnTemplate(cat, 's3', 'nope')).toEqual([]);
    expect(arnTemplate(cat, 'nope', 'object')).toEqual([]);
  });
  it('actionsFor filters by access level', () => {
    expect(actionsFor(cat, 'kms').length).toBe(4);
    expect(actionsFor(cat, 'kms', ['Permissions management']).map((a) => a.n)).toEqual(['CreateGrant']);
    expect(actionsFor(cat, 's3', ['List', 'Tagging']).map((a) => a.n)).toEqual(['ListBucket', 'ListAllMyBuckets', 'PutObjectTagging']);
    expect(actionsFor(cat, 'nope')).toEqual([]);
  });
  it('every fixture resource type an action names exists', () => {
    for (const s of Object.values(cat.services)) for (const a of s.actions) for (const r of a.r) expect(arnTemplate(cat, s.prefix, r).length, `${s.prefix}:${a.n} → ${r}`).toBeGreaterThan(0);
  });
});

/**
 * Six least-privilege starting points, each checked against the AWS documentation it cites
 * in its note. Placeholders (example-bucket, 123456789012, my-function, my-org/my-repo) are
 * AWS-documentation style and are meant to be replaced.
 */
import type { PolicyKind, Statement } from './types';

export interface Preset {
  slug: string;
  label: string;
  kind: PolicyKind;
  statements: Statement[];
  note: string;
}

export const PRESETS: Preset[] = [
  {
    slug: 's3-read-only-bucket',
    label: 'S3 read-only (one bucket)',
    kind: 'identity',
    statements: [
      { sid: 'ListBucket', effect: 'Allow', actions: ['s3:ListBucket'], resources: ['arn:aws:s3:::example-bucket'] },
      { sid: 'ReadObjects', effect: 'Allow', actions: ['s3:GetObject'], resources: ['arn:aws:s3:::example-bucket/*'] },
    ],
    note: 's3:ListBucket acts on the bucket ARN and s3:GetObject on object ARNs (bucket/*), so they need separate resources — granting both on one ARN leaves one of them with no effect.',
  },
  {
    slug: 's3-bucket-public-read',
    label: 'S3 public read (bucket policy)',
    kind: 's3-bucket',
    statements: [
      { sid: 'PublicReadGetObject', effect: 'Allow', principals: [{ type: '*', ids: [] }], actions: ['s3:GetObject'], resources: ['arn:aws:s3:::example-bucket/*'] },
    ],
    note: 'Makes every object in the bucket readable by anyone. S3 rejects or ignores this policy while Block Public Access is on (BlockPublicPolicy / RestrictPublicBuckets), so it must be turned off for the bucket first. For a website, prefer CloudFront with origin access control and keep the bucket private.',
  },
  {
    slug: 'lambda-basic-execution',
    label: 'Lambda basic execution (CloudWatch Logs)',
    kind: 'identity',
    statements: [
      { sid: 'CreateLogGroup', effect: 'Allow', actions: ['logs:CreateLogGroup'], resources: ['arn:aws:logs:us-east-1:123456789012:*'] },
      {
        sid: 'WriteLogs',
        effect: 'Allow',
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/my-function:*'],
      },
    ],
    note: 'A scoped version of the AWSLambdaBasicExecutionRole managed policy, which grants the same three actions on Resource "*": here the function may create its log group and write streams only under /aws/lambda/<function-name>, the default log group name.',
  },
  {
    slug: 'ecr-pull',
    label: 'ECR pull (one repository)',
    kind: 'identity',
    statements: [
      { sid: 'GetAuthToken', effect: 'Allow', actions: ['ecr:GetAuthorizationToken'], resources: ['*'] },
      {
        sid: 'PullImages',
        effect: 'Allow',
        actions: ['ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchCheckLayerAvailability'],
        resources: ['arn:aws:ecr:us-east-1:123456789012:repository/my-repo'],
      },
    ],
    note: 'ecr:GetAuthorizationToken does not support resource-level permissions, so it must use Resource "*"; the three pull actions are scoped to the repository ARN.',
  },
  {
    slug: 'kms-decrypt-key',
    label: 'KMS decrypt (one key, via S3)',
    kind: 'identity',
    statements: [
      {
        sid: 'DecryptViaS3',
        effect: 'Allow',
        actions: ['kms:Decrypt'],
        resources: ['arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab'],
        conditions: [{ op: 'StringEquals', key: 'kms:ViaService', values: ['s3.us-east-1.amazonaws.com'] }],
      },
    ],
    note: 'Allows decrypting with one key, and only when the request comes through S3 in us-east-1 (kms:ViaService). Remove the condition to allow direct kms:Decrypt calls. The key policy must also allow the account to delegate access through IAM.',
  },
  {
    slug: 'github-actions-oidc-trust',
    label: 'GitHub Actions OIDC (role trust policy)',
    kind: 'trust',
    statements: [
      {
        effect: 'Allow',
        principals: [{ type: 'Federated', ids: ['arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com'] }],
        actions: ['sts:AssumeRoleWithWebIdentity'],
        resources: [],
        conditions: [
          { op: 'StringEquals', key: 'token.actions.githubusercontent.com:aud', values: ['sts.amazonaws.com'] },
          { op: 'StringLike', key: 'token.actions.githubusercontent.com:sub', values: ['repo:my-org/my-repo:ref:refs/heads/main'] },
        ],
      },
    ],
    note: 'Lets workflows in my-org/my-repo running on main assume the role, with no long-lived keys. Always keep the sub condition: without it, any GitHub repository could assume the role, and IAM rejects a trust policy for this provider that lacks it. Repositories created after 15 July 2026 (or opted in) use the immutable form repo:my-org@<owner-id>/my-repo@<repo-id>:ref:refs/heads/main. The OIDC provider must exist in the account first.',
  },
];

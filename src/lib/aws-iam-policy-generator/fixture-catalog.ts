/**
 * A small hand-written Catalog for engine tests: a subset of six services with access levels,
 * resource types and ARN formats copied from the AWS Service Reference. Not the real catalogue
 * (src/data/iam-catalog.json), which the engine never imports.
 */
import type { Catalog } from './types';

export const FIXTURE_CATALOG: Catalog = {
  generatedAt: '2026-10-05T00:00:00.000Z',
  source: 'fixture',
  services: {
    s3: {
      prefix: 's3', name: 'Amazon S3', version: 'v1.4', modified: '2026-09-08',
      actions: [
        { n: 'ListBucket', l: 'List', r: ['accesspoint', 'bucket'], c: ['s3:prefix'] },
        { n: 'ListAllMyBuckets', l: 'List', r: [], c: [] },
        { n: 'GetObject', l: 'Read', r: ['accesspointobject', 'object'], c: [] },
        { n: 'GetBucketPolicy', l: 'Read', r: ['bucket'], c: [] },
        { n: 'PutObject', l: 'Write', r: ['accesspointobject', 'object'], c: ['s3:x-amz-acl'] },
        { n: 'DeleteObject', l: 'Write', r: ['accesspointobject', 'object'], c: [] },
        { n: 'PutBucketPolicy', l: 'Permissions management', r: ['bucket'], c: [] },
        { n: 'PutObjectTagging', l: 'Tagging', r: ['accesspointobject', 'object'], c: [] },
      ],
      resources: [
        { name: 'accesspoint', arnFormats: ['arn:${Partition}:s3:${Region}:${Account}:accesspoint/${AccessPointName}'] },
        { name: 'accesspointobject', arnFormats: ['arn:${Partition}:s3:${Region}:${Account}:accesspoint/${AccessPointName}/object/${ObjectName}'] },
        { name: 'bucket', arnFormats: ['arn:${Partition}:s3:::${BucketName}'] },
        { name: 'object', arnFormats: ['arn:${Partition}:s3:::${BucketName}/${ObjectName}'] },
      ],
      conditionKeys: [{ name: 's3:prefix', types: ['String'] }, { name: 's3:x-amz-acl', types: ['String'] }],
    },
    lambda: {
      prefix: 'lambda', name: 'AWS Lambda', version: 'v1.4', modified: '2026-09-08',
      actions: [
        { n: 'GetFunction', l: 'Read', r: ['function'], c: [] },
        { n: 'InvokeFunction', l: 'Write', r: ['function'], c: [] },
        { n: 'AddPermission', l: 'Permissions management', r: ['function'], c: ['lambda:Principal'] },
      ],
      resources: [{ name: 'function', arnFormats: ['arn:${Partition}:lambda:${Region}:${Account}:function:${FunctionName}'] }],
      conditionKeys: [{ name: 'lambda:Principal', types: ['String'] }],
    },
    logs: {
      prefix: 'logs', name: 'Amazon CloudWatch Logs', version: 'v1.4', modified: '2026-09-08',
      actions: [
        { n: 'CreateLogGroup', l: 'Write', r: ['log-group'], c: ['aws:TagKeys'] },
        { n: 'CreateLogStream', l: 'Write', r: ['log-stream'], c: [] },
        { n: 'PutLogEvents', l: 'Write', r: ['log-stream'], c: [] },
        { n: 'DescribeLogGroups', l: 'List', r: [], c: [] },
      ],
      resources: [
        { name: 'log-group', arnFormats: ['arn:${Partition}:logs:${Region}:${Account}:log-group:${LogGroupName}'] },
        { name: 'log-stream', arnFormats: ['arn:${Partition}:logs:${Region}:${Account}:log-group:${LogGroupName}:log-stream:${LogStreamName}'] },
      ],
      conditionKeys: [{ name: 'aws:TagKeys', types: ['ArrayOfString'] }],
    },
    kms: {
      prefix: 'kms', name: 'AWS Key Management Service', version: 'v1.4', modified: '2026-09-08',
      actions: [
        { n: 'Decrypt', l: 'Write', r: ['key'], c: ['kms:ViaService'] },
        { n: 'Encrypt', l: 'Write', r: ['key'], c: ['kms:ViaService'] },
        { n: 'CreateGrant', l: 'Permissions management', r: ['key'], c: ['kms:ViaService'] },
        { n: 'ListKeys', l: 'List', r: [], c: [] },
      ],
      resources: [{ name: 'key', arnFormats: ['arn:${Partition}:kms:${Region}:${Account}:key/${KeyId}'] }],
      conditionKeys: [{ name: 'kms:ViaService', types: ['String'] }],
    },
    ecr: {
      prefix: 'ecr', name: 'Amazon Elastic Container Registry', version: 'v1.4', modified: '2026-09-08',
      actions: [
        { n: 'GetAuthorizationToken', l: 'Read', r: [], c: [] },
        { n: 'BatchGetImage', l: 'Read', r: ['repository'], c: [] },
        { n: 'GetDownloadUrlForLayer', l: 'Read', r: ['repository'], c: [] },
        { n: 'BatchCheckLayerAvailability', l: 'Read', r: ['repository'], c: [] },
        { n: 'PutImage', l: 'Write', r: ['repository'], c: [] },
      ],
      resources: [{ name: 'repository', arnFormats: ['arn:${Partition}:ecr:${Region}:${Account}:repository/${RepositoryName}'] }],
      conditionKeys: [],
    },
    sts: {
      prefix: 'sts', name: 'AWS Security Token Service', version: 'v1.4', modified: '2026-09-08',
      actions: [
        { n: 'AssumeRole', l: 'Write', r: ['role'], c: [] },
        { n: 'AssumeRoleWithWebIdentity', l: 'Write', r: ['role'], c: ['token.actions.githubusercontent.com:sub'] },
        { n: 'GetCallerIdentity', l: 'Read', r: [], c: [] },
      ],
      resources: [{ name: 'role', arnFormats: ['arn:${Partition}:iam::${Account}:role/${RoleNameWithPath}'] }],
      conditionKeys: [{ name: 'token.actions.githubusercontent.com:sub', types: ['String'] }],
    },
  },
};

---
title: "GitHub Actions OIDC to AWS: Deploy Without Access Keys"
description: "Set up GitHub Actions OIDC federation to AWS end to end: the IAM identity provider, a role trust policy that pins the repository, branch or environment, configure-aws-credentials, the same setup in Terraform, a least-privilege permissions policy, and how to fix sts:AssumeRoleWithWebIdentity errors."
track: aws
order: 3
difficulty: intermediate
estMinutes: 16
updatedDate: 2026-10-05
tags: ["aws", "iam", "github-actions", "oidc", "ci-cd", "terraform", "security"]
relatedTools: ["aws-iam-policy-generator"]
seoTitle: "GitHub Actions OIDC to AWS: Deploy Without Access Keys"
metaDescription: "Connect GitHub Actions to AWS with OIDC: the IAM identity provider, a trust policy with aud and sub, configure-aws-credentials, Terraform and error fixes."
faqs:
  - q: "Do I still need a thumbprint for the GitHub OIDC provider in AWS?"
    a: "No. As of October 2026 the thumbprint is optional when you create the provider with the CLI, the API or Terraform. AWS verifies token.actions.githubusercontent.com against its own library of trusted root certificate authorities, and only falls back to configured thumbprints for providers whose certificates it cannot verify that way. The aws-actions/configure-aws-credentials README says the fingerprint step is no longer necessary."
  - q: "What permissions does a GitHub Actions workflow need for OIDC?"
    a: "The job needs id-token: write so it can request the OIDC token from GitHub, plus whatever else it uses, typically contents: read for actions/checkout. Setting a permissions block replaces the defaults, so list every permission the job needs. id-token has no read level: write is the only value that lets the job fetch a token."
  - q: "Why does my trust policy fail when the job uses a GitHub environment?"
    a: "When a job references an environment, GitHub puts the environment in the sub claim instead of the branch: repo:ORG/REPO:environment:prod rather than repo:ORG/REPO:ref:refs/heads/main. A trust policy that only allows the branch form will reject that job. Allow the environment form for the role that deploys through the environment."
  - q: "Can a pull request from a fork assume my AWS role?"
    a: "Not with the pull_request event by default. GitHub downgrades every write permission to read for workflows triggered by pull requests from forks, and id-token has no read level, so the job cannot get a token. Avoid granting cloud access from pull_request_target workflows, which run with write permissions in the context of the base repository."
  - q: "What is the immutable sub claim format?"
    a: "Repositories created after July 15, 2026, and repositories renamed or transferred after that date, emit a sub claim with numeric IDs: repo:ORG@ORG_ID/REPO@REPO_ID:ref:refs/heads/main. Older repositories keep the name-only format unless an admin opts in. A trust policy written for one format does not match the other, which shows up as Not authorized to perform sts:AssumeRoleWithWebIdentity."
  - q: "Should I create one IAM role per repository?"
    a: "Usually one role per repository and environment. A production deploy role that trusts only repo:ORG/REPO:environment:prod, and a separate read-only role for pull request plans, keeps each role's permissions small and makes CloudTrail show exactly which pipeline did what. The OIDC provider itself is shared: there is one per account."
---

A long-lived AWS access key stored as a GitHub secret is the most common way a CI pipeline gets AWS credentials, and the most common way those credentials leak. The key works from anywhere, never expires on its own, and is one misconfigured log line or compromised dependency away from being somebody else's key.

GitHub Actions can skip the key entirely. Each workflow run can ask GitHub for a short-lived OpenID Connect (OIDC) token that says, in signed claims, which repository, branch or environment the job belongs to. AWS STS checks that token against a trust policy you write, and if it matches, hands back temporary credentials for an IAM role. Nothing is stored, and the credentials expire after an hour by default.

This guide builds that setup end to end: the identity provider, the trust policy, the workflow, the same thing in Terraform, a permissions policy scoped to one deploy job, and the fixes for the errors you will meet along the way. It assumes you know what an IAM role and a policy are; if not, read [IAM roles in AWS for DevOps Engineers](/learn/guides/aws-for-devops-engineers/#iam-roles--why-roles-beat-long-lived-keys) first. Facts and versions below are current as of October 2026.

## How the exchange works

Four things happen on every run:

1. The job asks GitHub's OIDC endpoint for a token. This only works if the job has the `id-token: write` permission.
2. GitHub returns a signed JWT. Its issuer (`iss`) is `https://token.actions.githubusercontent.com`, its audience (`aud`) is `sts.amazonaws.com` when you use the official AWS action, and its subject (`sub`) describes where the job runs, for example `repo:acme/web:ref:refs/heads/main`.
3. The `aws-actions/configure-aws-credentials` action calls `sts:AssumeRoleWithWebIdentity` with that token and the role ARN you give it.
4. STS verifies the signature against the identity provider registered in your account, evaluates the role's trust policy conditions against the claims, and returns temporary credentials. The action exports them as environment variables for the rest of the job.

The security of the whole arrangement lives in step 4. The token proves *that* a job came from GitHub; the trust policy decides *which* GitHub jobs you accept. Every GitHub repository on the planet can mint a token from the same issuer, so a trust policy that does not pin your repository trusts all of them.

## Step 1: create the IAM OIDC identity provider

An account needs exactly one identity provider for `token.actions.githubusercontent.com`, shared by every role that trusts GitHub. IAM refuses a second provider with the same URL, so check before you create:

```bash
aws iam list-open-id-connect-providers
```

If it is not there, create it with the audience the AWS action uses:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

The command returns the provider ARN, which has the form `arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com`. You will reference it in every trust policy.

> **Note:** Older tutorials tell you to download GitHub's certificate chain with OpenSSL and pass a `--thumbprint-list`. As of October 2026 that is optional. AWS's documentation says it verifies an OIDC provider's JWKS endpoint against its own library of trusted root CAs and only falls back to the configured thumbprints when it cannot, and the configure-aws-credentials README says the fingerprint step is no longer necessary. If you omit the thumbprint, IAM fills one in itself; it is harmless.

In the console the same step is **IAM → Identity providers → Add provider → OpenID Connect**, with the provider URL above and `sts.amazonaws.com` as the audience.

## Step 2: write the role trust policy

The trust policy is the role's front door. For GitHub it always has the same shape: the federated principal is your provider ARN, the action is `sts:AssumeRoleWithWebIdentity`, and two conditions do the real work.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "GitHubDeployFromMain",
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:acme/web:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

- **`aud`** confirms the token was minted for AWS STS rather than for some other cloud.
- **`sub`** pins the exact source. This one accepts only jobs in `acme/web` running on the `main` branch.

IAM itself enforces part of this. When GitHub's provider is the trusted principal, IAM checks on every create or update that the trust policy has a `token.actions.githubusercontent.com:sub` condition and that its value is not just a wildcard. A policy without it is rejected with an error. That check stops the worst mistake, but it does not stop a weak one: `repo:acme/*` passes the check and trusts every repository in the organization.

### The sub claim formats you will match

GitHub builds `sub` from the job's context. The forms that matter for AWS roles:

| Job context | `sub` value |
| --- | --- |
| Branch push or dispatch | `repo:ORG/REPO:ref:refs/heads/BRANCH` |
| Tag | `repo:ORG/REPO:ref:refs/tags/TAG` |
| Job with `environment:` | `repo:ORG/REPO:environment:ENV_NAME` |
| `pull_request` event | `repo:ORG/REPO:pull_request` |

Two rows here cause most broken deployments.

**An environment replaces the branch.** When a job declares `environment: prod`, its `sub` is `repo:acme/web:environment:prod` even though it runs on `main`. The branch-only trust policy above rejects it. That is a feature, not a bug: environments can carry protection rules (required reviewers, deployment branch restrictions), so trusting the environment instead of the branch lets GitHub's approval gate stand in front of your AWS role. AWS's own guidance recommends adding those protection rules whenever you trust an environment. A production role is often best written as:

```json
"StringEquals": {
  "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
  "token.actions.githubusercontent.com:sub": "repo:acme/web:environment:prod"
}
```

Then restrict the `prod` environment to the `main` branch in the repository's settings.

**A pull request carries no branch at all.** Every `pull_request` run has the same `sub`, `repo:acme/web:pull_request`, whatever branch it came from. If you want `terraform plan` on pull requests, give that job a separate role that trusts the `pull_request` subject and has read-only permissions. Never widen the deploy role to cover it.

### Wildcards, used narrowly

`StringLike` accepts `*` and `?`, and a condition key can take a list of values, which are ORed together. That is handy for a role used by release tags, or by two specific branches:

```json
"StringEquals": {
  "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
},
"StringLike": {
  "token.actions.githubusercontent.com:sub": [
    "repo:acme/web:ref:refs/tags/v*",
    "repo:acme/web:ref:refs/heads/release/*"
  ]
}
```

> **Warning:** `repo:acme/web:*` (any context in one repository) is the widest pattern worth considering, and it includes pull request runs. `repo:acme/*` trusts every repository in the organization, including the one an intern creates next week. Pin the repository at minimum.

### Immutable subject claims for new repositories

GitHub changed the default `sub` format in 2026. Repositories created after **July 15, 2026**, and any repository renamed or transferred after that date, emit an immutable subject that appends the numeric owner and repository IDs:

```text
repo:acme@1234567/web@987654321:ref:refs/heads/main
repo:acme@1234567/web@987654321:environment:prod
```

The point is to close a takeover risk: with name-only subjects, someone who registered a deleted organization or repository name could mint tokens that matched your trust policy. The IDs stay the same through renames and transfers. Repositories created before that date keep the name-only format unless an admin opts in through the repository or organization OIDC settings or the REST API.

The practical consequence: **write the trust policy for the format your repository actually emits.** A name-only policy does not match an immutable subject, and vice versa. You can look the IDs up with the GitHub CLI:

```bash
gh api repos/acme/web --jq '.owner.id, .id'
```

This change applies to github.com; GitHub Enterprise Server is not affected.

## Step 3: create the role and attach permissions

Save the trust policy as `trust.json` and create the role:

```bash
aws iam create-role \
  --role-name gha-web-deploy \
  --assume-role-policy-document file://trust.json \
  --max-session-duration 3600
```

A new role has no permissions. What it gets should match one job, not "whatever CI might need". For a pipeline that syncs a static site to S3 and invalidates a CloudFront distribution, that is four actions on three resources:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListSiteBucket",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::acme-web-prod"
    },
    {
      "Sid": "WriteSiteObjects",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::acme-web-prod/*"
    },
    {
      "Sid": "InvalidateCdn",
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::123456789012:distribution/E2EXAMPLE1234"
    }
  ]
}
```

Note the split between the bucket ARN and the object ARN: `s3:ListBucket` applies to the bucket, while `PutObject` and `DeleteObject` apply to objects, so they need `/*`. Getting that wrong produces an `AccessDenied` that looks like a trust problem but is not.

```bash
aws iam put-role-policy \
  --role-name gha-web-deploy \
  --policy-name deploy-site \
  --policy-document file://deploy-site.json
```

You do not have to write these by hand. The [AWS IAM Policy Generator](/aws-iam-policy-generator/) builds a policy from the services and actions you pick, shows each action's access level, scopes `Resource` to the right ARN format, warns about `"*"` on write and permission-management actions, and emits the same document as Terraform. The [least-privilege section](/learn/guides/aws-for-devops-engineers/#least-privilege) of the AWS guide covers Access Analyzer and the policy simulator for tightening a policy after it has run for a while.

## Step 4: configure the workflow

```yaml
name: deploy

on:
  push:
    branches: [main]

permissions:
  id-token: write   # lets the job request the OIDC token
  contents: read    # actions/checkout

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: prod
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::123456789012:role/gha-web-deploy
          role-session-name: gha-${{ github.run_id }}
          aws-region: eu-west-1

      - run: aws sts get-caller-identity

      - run: |
          aws s3 sync ./dist s3://acme-web-prod --delete
          aws cloudfront create-invalidation --distribution-id E2EXAMPLE1234 --paths '/*'
```

Points worth knowing:

- **`permissions` replaces the defaults.** The moment you declare a block, any permission you leave out is `none`. If the job also comments on pull requests or pushes tags, list those too.
- **`id-token` has only one useful value.** `write` is what lets the job fetch a token; there is no read level.
- **This job declares `environment: prod`**, so its subject is `repo:acme/web:environment:prod`. The trust policy must allow that form, not the `ref:refs/heads/main` form.
- **The audience defaults to `sts.amazonaws.com`.** Leave the action's `audience` input alone unless you registered a different client ID on the provider.
- **Session length** defaults to one hour. `role-duration-seconds` can ask for up to 12 hours, but never more than the role's `MaxSessionDuration`.
- **The `@v6` tag is the current major version** as of October 2026. For production pipelines, pin the action to a full commit SHA and let Dependabot update it, the same way you would any third-party action that touches credentials.
- **`role-session-name`** shows up in CloudTrail. Including the run ID lets you trace an API call back to the exact workflow run.

## The same setup in Terraform

Most teams manage this as code. The provider is account-wide, so it often lives in a shared "bootstrap" stack while the roles live next to the repositories they serve.

```hcl
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # thumbprint_list is optional in current AWS provider versions
}

data "aws_iam_policy_document" "gha_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:acme/web:environment:prod"]
    }
  }
}

resource "aws_iam_role" "gha_web_deploy" {
  name                 = "gha-web-deploy"
  assume_role_policy   = data.aws_iam_policy_document.gha_trust.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "deploy_site" {
  statement {
    sid       = "ListSiteBucket"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::acme-web-prod"]
  }

  statement {
    sid       = "WriteSiteObjects"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::acme-web-prod/*"]
  }

  statement {
    sid       = "InvalidateCdn"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = ["arn:aws:cloudfront::123456789012:distribution/E2EXAMPLE1234"]
  }
}

resource "aws_iam_role_policy" "deploy_site" {
  name   = "deploy-site"
  role   = aws_iam_role.gha_web_deploy.id
  policy = data.aws_iam_policy_document.deploy_site.json
}
```

If the provider already exists in the account (created by hand or by another stack), do not declare a second one: `terraform apply` fails because IAM allows only one provider per URL. Either `terraform import` it, or read it with the data source and use its ARN:

```hcl
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}
```

Two `condition` blocks in one statement are ANDed, which is what you want for `aud` plus `sub`. Several values inside one `condition` block are ORed. To generate the `deploy_site` document for other services, the [IAM Policy Generator](/aws-iam-policy-generator/) has a Terraform output tab that writes `data "aws_iam_policy_document"` blocks in this shape.

## Troubleshooting

### "Not authorized to perform sts:AssumeRoleWithWebIdentity"

This is STS saying the token was valid but the trust policy did not accept it. Work through these in order:

1. **The subject does not match.** By far the most common cause. Check whether the job uses an `environment:` (subject becomes `environment:NAME`), runs on `pull_request` (subject becomes `pull_request`), or runs on a tag. `StringEquals` is case-sensitive, so `environment:Prod` does not match `environment:prod`.
2. **The repository emits immutable subjects.** A repository created, renamed or transferred after July 15, 2026 sends `repo:ORG@ID/REPO@ID:…`. A name-only trust policy rejects it with exactly this error. Update the policy to include the IDs.
3. **The audience does not match.** If you changed the action's `audience` input, the provider's client ID list and the `aud` condition must both carry the same value.
4. **The role ARN or account is wrong.** A typo in `role-to-assume`, or a role in a different account from the provider the trust policy names, fails the same way.

When you cannot tell which, print the subject the job actually sends. This step reads the token GitHub would hand to the AWS action and prints only its `sub` claim:

```yaml
- name: Show OIDC subject
  run: |
    curl -sS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
      "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sts.amazonaws.com" \
    | jq -r '.value' \
    | python3 -c "import sys,json,base64; p=sys.stdin.read().strip().split('.')[1]; p+='='*(-len(p)%4); print(json.loads(base64.urlsafe_b64decode(p))['sub'])"
```

Copy that value into the trust policy, then delete the step. `ACTIONS_ID_TOKEN_REQUEST_URL` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN` only exist when the job has `id-token: write`.

### The action cannot load credentials at all

If the step fails before STS is ever called, the job almost certainly lacks `id-token: write`. Check for a job-level `permissions` block that overrides the workflow-level one, and for reusable workflows: the caller must grant `id-token: write` for the called workflow to get it. Pull requests from forks also land here, because GitHub downgrades their write permissions to read by default.

### Access denied after the role was assumed

If `aws sts get-caller-identity` prints the role and a later command fails with `AccessDenied`, the trust policy is fine and the permissions policy is the problem. Check the resource ARN (bucket versus `bucket/*` is the classic one), the Region in the ARN for regional services, and any explicit deny from a permissions boundary or a service control policy. The error message names the action and resource that were refused; build the missing statement in the [policy generator](/aws-iam-policy-generator/) rather than reaching for `"*"`.

### "The requested DurationSeconds exceeds the MaxSessionDuration"

The workflow asked for a longer session than the role allows. Lower `role-duration-seconds` or raise the role's `--max-session-duration` (up to 43,200 seconds).

## A short checklist

- One OIDC provider per account, audience `sts.amazonaws.com`, no thumbprint needed.
- One role per repository and environment, each trust policy with `aud` and a `sub` that names the repository at minimum.
- Production roles trust `environment:prod`, and the environment has protection rules and a branch restriction.
- Pull request jobs, if they need AWS at all, use a separate read-only role.
- Trust policies match the subject format your repository emits: immutable for repositories created, renamed or transferred after July 15, 2026.
- Permissions policies name actions and resource ARNs; `"*"` only where a service has no resource-level permissions.
- The action pinned to a commit SHA, and the old access-key secrets deleted from the repository once the role works.

That last step is the one teams forget. The point of OIDC is that there is no key to leak; a migration that leaves the old `AWS_ACCESS_KEY_ID` secret in place has added a second door, not closed the first. Deactivate the IAM user's keys, watch CloudTrail for a week to confirm nothing still uses them, then delete them.

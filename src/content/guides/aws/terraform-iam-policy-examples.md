---
title: "Terraform IAM Policy Examples: aws_iam_policy_document"
description: "How to write AWS IAM policies in Terraform with aws_iam_policy_document: statements, principals and conditions, attaching policies to roles, merging documents, S3 bucket policies, six complete examples and how to validate them."
track: aws
order: 5
difficulty: intermediate
estMinutes: 25
updatedDate: 2026-10-05
tags: ["aws", "iam", "terraform", "security", "s3", "oidc"]
relatedTools: ["aws-iam-policy-generator"]
seoTitle: "Terraform IAM Policy Examples (aws_iam_policy_document)"
metaDescription: "Write AWS IAM policies in Terraform with aws_iam_policy_document: S3, Lambda, ECR, KMS and GitHub OIDC examples, attachment, merging and validation."
faqs:
  - q: "Should I use aws_iam_policy_document or jsonencode in Terraform?"
    a: "Both are fine, and the AWS provider docs recommend either over a raw JSON heredoc. aws_iam_policy_document gives you typed blocks, the effect defaulting to Allow, and the source_policy_documents and override_policy_documents arguments for merging. jsonencode is shorter for a one-off policy and reads exactly like the JSON AWS documents. Pick one per codebase and stay with it."
  - q: "Does aws_iam_policy_document call the AWS API?"
    a: "No. It is a data source that renders JSON locally from its arguments, exposed as the json and minified_json attributes. It does not check that actions exist or that ARNs point at real resources. AWS only validates the document when a resource such as aws_iam_policy or aws_iam_role_policy sends it to IAM during apply."
  - q: "What is the difference between aws_iam_role_policy and aws_iam_role_policy_attachment?"
    a: "aws_iam_role_policy writes an inline policy that lives inside one role and is deleted with it. aws_iam_role_policy_attachment attaches a managed policy, either AWS managed or one you created with aws_iam_policy, which can be shared by many roles. Inline role policies share a 10,240-character budget per role; each customer managed policy can be up to 6,144 characters. IAM does not count whitespace for either limit."
  - q: "How do I write an assume role (trust) policy in Terraform?"
    a: "Use an aws_iam_policy_document with a principals block and the sts:AssumeRole action (or sts:AssumeRoleWithWebIdentity for OIDC), then pass its json attribute to the assume_role_policy argument of aws_iam_role. A trust policy cannot be an aws_iam_policy resource; it is a property of the role."
  - q: "How do I render \"Principal\": \"*\" with aws_iam_policy_document?"
    a: "Use type = \"*\" and identifiers = [\"*\"] in the principals block. type = \"AWS\" with identifiers = [\"*\"] renders {\"AWS\": \"*\"} instead, which the provider docs note behaves differently in some cases, such as role trust policies."
  - q: "Does terraform validate catch IAM policy mistakes?"
    a: "Only Terraform-level ones: a misspelled argument, a missing required block, a wrong type. It never contacts AWS, so an invalid action name, a wrong ARN format or an over-broad Resource passes. Run IAM Access Analyzer's validate-policy on the rendered JSON to catch those before apply."
---

Most IAM policies in a Terraform codebase are written one of three ways: an `aws_iam_policy_document` data source, `jsonencode()`, or a JSON heredoc pasted from the console. This guide covers the first in depth because it is the one with real features, shows when the other two are fine, and then gives six complete examples you can copy: S3 read-only, Lambda logging, ECR pull, KMS decrypt, an S3 bucket policy and a GitHub Actions OIDC trust policy. It ends with a validation step that catches what `terraform validate` cannot.

It assumes you already know what an IAM policy is: Effect, Action, Resource, Condition, and why explicit Deny wins. If not, read the IAM section of [AWS for DevOps Engineers](/learn/guides/aws-for-devops-engineers/) first. If you want to build a policy by picking actions instead of typing them, the [AWS IAM Policy Generator](/aws-iam-policy-generator/) produces both the JSON and the matching `aws_iam_policy_document` block.

Provider behaviour described here matches the HashiCorp AWS provider documentation as of October 2026.

## Three ways to write a policy

Here is the same one-statement policy written all three ways.

A heredoc is raw JSON inside a Terraform string:

```hcl
resource "aws_iam_policy" "read_reports" {
  name   = "read-reports"
  policy = <<-EOT
    {
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::acme-reports/*"
      }]
    }
  EOT
}
```

`jsonencode()` turns a Terraform object into JSON:

```hcl
resource "aws_iam_policy" "read_reports" {
  name = "read-reports"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "s3:GetObject"
      Resource = "${aws_s3_bucket.reports.arn}/*"
    }]
  })
}
```

`aws_iam_policy_document` describes the policy as blocks and renders JSON for you:

```hcl
data "aws_iam_policy_document" "read_reports" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.reports.arn}/*"]
  }
}

resource "aws_iam_policy" "read_reports" {
  name   = "read-reports"
  policy = data.aws_iam_policy_document.read_reports.json
}
```

The provider docs recommend `jsonencode()` or `aws_iam_policy_document` over raw JSON, and the reasons are practical. A heredoc is a string, so Terraform cannot tell you about a missing comma until AWS rejects the document at apply time, and interpolating values into it means hand-escaping quotes. Both alternatives produce valid JSON by construction and let you reference other resources (`aws_s3_bucket.reports.arn`) without string surgery.

Between the two, the choice is mostly taste:

| | `jsonencode()` | `aws_iam_policy_document` |
|---|---|---|
| Reads like AWS docs | Yes, key for key | No, uses snake_case blocks |
| `effect` default | You must write it | Defaults to `Allow` |
| Merging documents | Manual (`concat` on lists) | `source_policy_documents`, `override_policy_documents` |
| Repeated statements | `for` expressions | `dynamic "statement"` blocks |
| Output | The string itself | `.json` and `.minified_json` |

The data source runs entirely inside Terraform. It does not call AWS, it does not check that `s3:GetObjekt` is a real action, and it does not check that your ARN points at anything. It is a JSON renderer with a schema.

## Anatomy of aws_iam_policy_document

Every argument below comes from the provider's data source reference.

```hcl
data "aws_iam_policy_document" "example" {
  # version defaults to "2012-10-17"; leave it alone.
  policy_id = "example-policy"   # optional, rendered as "Id"

  statement {
    sid       = "ReadAppConfig"  # optional, but needed for overrides
    effect    = "Allow"          # optional, defaults to Allow
    actions   = ["ssm:GetParameter", "ssm:GetParametersByPath"]
    resources = ["arn:aws:ssm:eu-west-1:111122223333:parameter/app/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/env"
      values   = ["prod", "staging"]
    }
  }
}
```

A few rules worth memorising:

- **`actions` / `not_actions`** and **`resources` / `not_resources`** are the list forms of `Action`, `NotAction`, `Resource` and `NotResource`. `resources` conflicts with `not_resources`. An identity policy statement needs one of them; AWS rejects the document at apply otherwise.
- **`principals`** takes a `type` (`AWS`, `Service`, `Federated`, `CanonicalUser` or `*`) and a list of `identifiers`. Use it only in resource-based policies (bucket policies, KMS key policies) and trust policies. An identity policy has no Principal, because the principal is whoever the policy is attached to.
- **`condition`**: values inside one block are ORed, and multiple blocks are ANDed. Two `condition` blocks means both must match; one block with two `values` means either value matches.
- **`"Principal": "*"`** comes from `type = "*"` with `identifiers = ["*"]`. `type = "AWS"` with `identifiers = ["*"]` renders `{"AWS": "*"}`, which the provider notes behaves differently in some places, such as trust policies.

> **Tip:** Give every statement a `sid`. It costs a few characters, makes Access Analyzer findings and CloudTrail debugging easier to map back to code, and it is required if you ever want to override the statement (see merging, below). A `sid` must be alphanumeric, so `ReadAppConfig` works and `read-app-config` does not.

## Attaching a policy to a role

Rendering JSON does nothing on its own. Something has to send it to IAM, and there are two sensible ways to do it for a role.

**Managed policy plus attachment.** Create a customer managed policy with `aws_iam_policy`, then attach it with `aws_iam_role_policy_attachment`. The policy has its own ARN, keeps a version history in IAM, and can be attached to many roles.

```hcl
resource "aws_iam_policy" "app_read" {
  name   = "app-read"
  policy = data.aws_iam_policy_document.example.json
}

resource "aws_iam_role_policy_attachment" "app_read" {
  role       = aws_iam_role.app.name
  policy_arn = aws_iam_policy.app_read.arn
}
```

The same attachment resource works for AWS managed policies: `policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"`.

**Inline policy.** `aws_iam_role_policy` embeds the document inside one role. It has no ARN of its own and is deleted with the role.

```hcl
resource "aws_iam_role_policy" "app_read" {
  name   = "app-read"
  role   = aws_iam_role.app.id
  policy = data.aws_iam_policy_document.example.json
}
```

Pick managed when more than one role needs the permissions or you want them visible as a named policy in the console. Pick inline when the permissions belong to exactly one role and should never outlive it. Size matters too: each customer managed policy can hold 6,144 characters, while all inline policies on a role share a combined 10,240. IAM ignores whitespace when counting either limit, so pretty-printed JSON costs you nothing.

> **Caution:** As of October 2026, the `inline_policy` block and `managed_policy_arns` argument on `aws_iam_role` are deprecated. They also take exclusive control of the role's policies, so mixing them with `aws_iam_role_policy` or `aws_iam_role_policy_attachment` on the same role makes Terraform flip-flop on every apply. Use the standalone resources. If you want Terraform to remove policies added outside it, the provider now has `aws_iam_role_policies_exclusive` and `aws_iam_role_policy_attachments_exclusive` for that job.

## Trust policies: assume_role_policy

A role has two kinds of policy. Permission policies say what the role can do. The trust policy says who can become the role. In Terraform the trust policy is not a separate resource: it is the `assume_role_policy` argument on `aws_iam_role`, and the provider docs note it cannot be an `aws_iam_policy`. It can be an `aws_iam_policy_document`, which is the usual approach:

```hcl
data "aws_iam_policy_document" "ec2_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "app-server"
  assume_role_policy = data.aws_iam_policy_document.ec2_trust.json
}
```

Trust policies always have a `principals` block and never a `resources` list, because the resource is the role itself. They also have their own size limit: 2,048 characters by default, raisable to 8,192 through Service Quotas. The [IAM trust policy guide](/learn/guides/iam-trust-policy-explained/) goes deeper on principals, external IDs and the confused-deputy problem.

## Merging documents

`aws_iam_policy_document` can merge other rendered documents into itself, which is the main reason to choose it over `jsonencode()` in larger codebases.

- **`source_policy_documents`** is a list of JSON documents whose statements are copied in. Statements across the source documents must have unique `sid`s.
- **`override_policy_documents`** is a list of JSON documents whose statements replace any earlier statement with the same `sid`, in sources or earlier overrides. Statements with a new `sid` (or none) are simply added.
- A statement **without a `sid` can never be overridden**, only added to.

A common use is a shared baseline that every role gets, plus a per-team override:

```hcl
data "aws_iam_policy_document" "baseline" {
  statement {
    sid       = "ReadParams"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:eu-west-1:111122223333:parameter/shared/*"]
  }

  statement {
    sid       = "DenyIamWrites"
    effect    = "Deny"
    actions   = ["iam:Create*", "iam:Delete*", "iam:Put*", "iam:Attach*"]
    resources = ["*"]
  }
}

data "aws_iam_policy_document" "payments_override" {
  statement {
    sid       = "ReadParams"   # same sid: replaces the baseline statement
    actions   = ["ssm:GetParameter", "ssm:GetParametersByPath"]
    resources = ["arn:aws:ssm:eu-west-1:111122223333:parameter/payments/*"]
  }
}

data "aws_iam_policy_document" "payments" {
  source_policy_documents   = [data.aws_iam_policy_document.baseline.json]
  override_policy_documents = [data.aws_iam_policy_document.payments_override.json]
}
```

The rendered `payments` policy has two statements: the payments version of `ReadParams` and the untouched `DenyIamWrites`. Merging is also the clean way to combine statements from modules, because each module can export a `.json` output and the caller merges them in one place.

## Six complete examples

Each example below is a full, working configuration fragment. Resource names (`acme-reports`, `orders-api`, `payments-api`) and the account ID `111122223333` are placeholders. The examples use `var.region` and `data.aws_caller_identity.current.account_id` so nothing is hard-coded twice:

```hcl
variable "region" {
  type    = string
  default = "eu-west-1"
}

data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
}
```

### 1. S3 read-only on one bucket

Listing and reading are different resource types in S3. `s3:ListBucket` acts on the bucket ARN; `s3:GetObject` acts on object ARNs, which are the bucket ARN plus `/key`. Put them in separate statements, or a policy that looks right silently fails one of the two calls.

```hcl
data "aws_iam_policy_document" "s3_read" {
  statement {
    sid       = "ListBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.reports.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["monthly/*"]
    }
  }

  statement {
    sid       = "ReadObjects"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.reports.arn}/monthly/*"]
  }
}
```

The `s3:prefix` condition limits listing to the `monthly/` prefix, matching the read scope. Drop the condition block and the `/monthly` path segment for whole-bucket access.

### 2. Lambda execution role with CloudWatch Logs

The AWS managed policy `AWSLambdaBasicExecutionRole` grants `logs:CreateLogGroup`, `logs:CreateLogStream` and `logs:PutLogEvents` on every log group in the account. This version scopes them to the function's own log group, `/aws/lambda/<function-name>`, which is where Lambda writes by default.

```hcl
data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "orders_api" {
  name               = "orders-api-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

data "aws_iam_policy_document" "orders_api_logs" {
  statement {
    sid       = "CreateGroup"
    actions   = ["logs:CreateLogGroup"]
    resources = ["arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/orders-api"]
  }

  statement {
    sid     = "WriteStreams"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "arn:aws:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/orders-api:*",
    ]
  }
}

resource "aws_iam_role_policy" "orders_api_logs" {
  name   = "logs"
  role   = aws_iam_role.orders_api.id
  policy = data.aws_iam_policy_document.orders_api_logs.json
}
```

The two statements exist because `CreateLogGroup` acts on a log group ARN while the other two act on log stream ARNs (`log-group:NAME:log-stream:STREAM`), which the trailing `:*` matches. If Terraform creates the log group itself with `aws_cloudwatch_log_group` (a good idea, since it lets you set retention), delete the `CreateGroup` statement: the function no longer needs it.

### 3. ECR image pull

Pulling an image needs one account-level call and three repository-level calls. `ecr:GetAuthorizationToken` has no resource type in the AWS Service Authorization Reference, so its statement must use `"*"`. The other three accept a repository ARN and should get one.

```hcl
data "aws_iam_policy_document" "ecr_pull" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "PullFromRepo"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
    ]
    resources = [aws_ecr_repository.orders_api.arn]
  }
}
```

`Resource: "*"` on `GetAuthorizationToken` is not a least-privilege failure. It is the only legal value for that action, and the token on its own grants nothing without the repository permissions.

### 4. KMS decrypt, only through Secrets Manager

A role that reads a secret encrypted with a customer managed KMS key needs `kms:Decrypt` on that key. The `kms:ViaService` condition limits the grant to requests that Secrets Manager makes on the role's behalf, so the role cannot call `kms:Decrypt` directly on other ciphertext encrypted with the same key.

```hcl
data "aws_iam_policy_document" "read_db_secret" {
  statement {
    sid       = "ReadSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.db.arn]
  }

  statement {
    sid       = "DecryptViaSecretsManager"
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.secrets.arn]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.region}.amazonaws.com"]
    }
  }
}
```

The value format is `<service>.<region>.amazonaws.com`. Remember that KMS also checks the key policy: this identity policy only works if the key policy lets the account's IAM policies grant access, which the default key policy does.

### 5. S3 bucket policy with aws_s3_bucket_policy

A bucket policy is resource-based, so it needs `principals`. This one does two things: it lets an application role read objects, and it denies every request that does not use TLS, using the global `aws:SecureTransport` key.

```hcl
data "aws_iam_policy_document" "reports_bucket" {
  statement {
    sid       = "AppRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.reports.arn}/*"]

    principals {
      type        = "AWS"
      identifiers = [aws_iam_role.app.arn]
    }
  }

  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.reports.arn,
      "${aws_s3_bucket.reports.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "reports" {
  bucket = aws_s3_bucket.reports.id
  policy = data.aws_iam_policy_document.reports_bucket.json
}
```

A bucket holds exactly one policy, so two `aws_s3_bucket_policy` resources for the same bucket overwrite each other on every apply. If different modules contribute statements, merge them with `source_policy_documents` and keep one policy resource. Bucket policies are limited to 20 KB.

`Principal: "*"` is safe here because the statement is a Deny with a condition. In an Allow statement, a wildcard principal without a condition makes the bucket public, which S3 Block Public Access will refuse if it is on (it is by default on new buckets).

### 6. GitHub Actions OIDC trust policy

This lets a GitHub Actions workflow assume a role with short-lived credentials instead of stored access keys. Per GitHub's documentation, the provider URL is `https://token.actions.githubusercontent.com` and the audience for the official AWS action is `sts.amazonaws.com`.

```hcl
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "github_trust" {
  statement {
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
      values   = ["repo:acme/payments-api:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "github-deploy-payments-api"
  assume_role_policy = data.aws_iam_policy_document.github_trust.json
}
```

The `sub` condition is the security boundary. Without it, any workflow in any repository on GitHub that requests a token with the right audience could assume the role. Scope it to one repository and one branch (as above) or one deployment environment (`repo:acme/payments-api:environment:production`). `StringLike` with `repo:acme/payments-api:*` allows every branch, tag and pull request in the repository, so use it knowingly.

No `thumbprint_list` is set. As of October 2026 the argument is optional, and the provider docs note that for GitHub (along with Auth0, GitLab and Google) AWS validates the JWKS endpoint against its own library of trusted root CAs and disregards any configured thumbprint. The IAM docs put it more generally: AWS uses that CA library for any provider whose certificate chains to it, and falls back to the thumbprints only when the certificate does not, cannot be retrieved, or requires TLS 1.3. The workflow side, including the `id-token: write` permission it needs, is covered in the [GitHub Actions OIDC guide](/learn/guides/github-actions-oidc-aws/).

## Validating policies before apply

There are three layers of checking, and each catches a different class of mistake.

**`terraform fmt` and `terraform validate`.** These check the configuration: a misspelled argument (`action` instead of `actions`), a `condition` block missing `variable`, a `resources` list next to `not_resources`. `terraform validate` never contacts AWS, so it cannot tell you that `s3:GetObjects` is not an action or that an ARN is malformed.

**`terraform plan`.** The data source renders during plan when all its inputs are known, so the plan shows the exact JSON that will be sent. Read it. Most over-broad policies are visible to the eye once rendered.

**IAM Access Analyzer `validate-policy`.** This is the step that checks the policy as IAM sees it, with findings typed as `ERROR`, `SECURITY_WARNING`, `WARNING` and `SUGGESTION`. Export the rendered JSON through an output and the plan file:

```hcl
output "s3_read_policy_json" {
  value = data.aws_iam_policy_document.s3_read.json
}
```

```bash
terraform plan -out=tfplan
terraform show -json tfplan \
  | jq -r '.planned_values.outputs.s3_read_policy_json.value' > policy.json

aws accessanalyzer validate-policy \
  --policy-type IDENTITY_POLICY \
  --policy-document file://policy.json \
  --query 'findings[].[findingType,issueCode]' \
  --output table
```

For a bucket policy, use `--policy-type RESOURCE_POLICY --validate-policy-resource-type AWS::S3::Bucket`. For a trust policy, use `RESOURCE_POLICY` with `AWS::IAM::AssumeRolePolicyDocument`. An empty findings list means IAM has nothing to say; any `ERROR` means the policy would not work as written, and a CI job can fail on it.

> **Note:** Access Analyzer checks grammar and known risky patterns. It does not know your intent, so a policy that grants `s3:*` on the wrong bucket can pass cleanly. Keep the scope review in code review, where someone who knows what the role is for reads the rendered JSON.

## Common mistakes

- **Object actions on the bucket ARN.** `s3:GetObject` on `arn:aws:s3:::acme-reports` matches nothing; it needs `arn:aws:s3:::acme-reports/*`. The reverse applies to `s3:ListBucket`.
- **A `principals` block in an identity policy.** IAM rejects it at apply. Principals belong in bucket policies, key policies and trust policies only.
- **Two owners for one policy.** Two `aws_s3_bucket_policy` resources on one bucket, or `aws_iam_role_policy` plus the deprecated `inline_policy` on one role, make every apply undo the last one.
- **Overriding a statement with no `sid`.** It silently gets added alongside the original instead of replacing it.
- **`"Resource": "*"` by habit.** It is required for a few actions such as `ecr:GetAuthorizationToken`, but on write actions with a scoped resource type it grants the action on everything in the account.
- **An OIDC trust policy without a `sub` condition.** See example 6.

To start from a known-good shape instead of a blank file, the [AWS IAM Policy Generator](/aws-iam-policy-generator/) lets you choose a service, filter its actions by access level, scope resources with the correct ARN template and copy either the JSON or the `aws_iam_policy_document` block. It warns about the same patterns listed above, and nothing you build leaves the page.

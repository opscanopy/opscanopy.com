---
title: "IAM Trust Policy Explained: Who Can Assume a Role"
description: "How an IAM role trust policy decides who may assume a role: principal types, the three sts:AssumeRole actions, cross-account roles with an external ID, service conditions, session tags and source identity, and the errors you will actually hit."
track: aws
order: 4
difficulty: intermediate
estMinutes: 14
updatedDate: 2026-10-05
tags: ["aws", "iam", "sts", "trust-policy", "assume-role", "security"]
relatedTools: ["aws-iam-policy-generator"]
seoTitle: "IAM Trust Policy Explained: Who Can Assume a Role"
metaDescription: "What an IAM role trust policy is, how it differs from a permission policy, every principal type, cross-account ExternalId, and common AssumeRole errors."
faqs:
  - q: "What is an IAM trust policy?"
    a: "A trust policy is the resource-based policy attached to an IAM role. Its Principal element names who may assume the role, and its Action element names how: sts:AssumeRole for AWS principals and services, sts:AssumeRoleWithWebIdentity for OIDC providers, sts:AssumeRoleWithSAML for SAML providers. It grants no permissions on any other resource; the role's permission policies do that."
  - q: "What is the difference between a trust policy and a permission policy?"
    a: "The trust policy answers who can become the role. The permission policy answers what the role can do once someone has become it. A role needs both: a trust policy with nobody in it cannot be assumed, and a role with no permission policies can be assumed but can do nothing."
  - q: "Does a cross-account role need permissions on both sides?"
    a: "Yes. The role's trust policy in the target account must trust the caller's account or the caller's role or user, and the caller's own account must grant it an identity-based policy allowing sts:AssumeRole on that role's ARN. Within one account, naming the user or role ARN directly in the trust policy is enough on its own."
  - q: "What is an external ID and is it a secret?"
    a: "An external ID is a value a third party includes when it calls AssumeRole, checked by an sts:ExternalId condition in your trust policy. It stops the confused deputy problem, where another customer of the same vendor tricks the vendor into using your role. The vendor generates it, unique per customer. AWS does not treat it as a secret; anyone who can read the role can see it."
  - q: "Why does my trust policy show an ID like AROA... instead of a role ARN?"
    a: "IAM stores a role or user named in a trust policy as its unique principal ID. If that role or user is deleted, the ID can no longer be mapped back to an ARN, so the raw ID appears. Recreating a role with the same name does not restore trust, because the new role has a new ID. Edit the trust policy and put the ARN back."
  - q: "How long can an assumed-role session last?"
    a: "From 900 seconds up to the role's maximum session duration, which you can set between 1 and 12 hours. Without DurationSeconds the session lasts one hour. Role chaining, using one role's credentials to assume another, is capped at one hour regardless of the setting."
---

Every IAM role has two policies doing two different jobs, and most "AccessDenied on AssumeRole" tickets come down to someone editing the wrong one. This guide is about the half that people tend to copy from a blog post and never look at again: the **trust policy**, which decides who can assume a role at all. It covers principal types, the three `sts:AssumeRole*` actions, cross-account roles with an external ID, condition keys for services and organizations, session tags and source identity, and the error messages you get when one of these is wrong. Every policy shape here is checked against the AWS IAM and STS documentation as of October 2026.

If you are new to IAM itself (users, groups, roles and how policies are evaluated), read the [IAM section of AWS for DevOps Engineers](/learn/guides/aws-for-devops-engineers/#iam--identity-and-access-management) first. That guide already walks through creating an EC2 role with a trust policy; this one picks up from there.

## Trust policy vs permission policy

A role is an identity with no long-term credentials. Someone or something calls AWS STS, STS checks whether they are allowed to become the role, and if so it hands back temporary credentials. Two policies take part in that, and they never overlap:

| | Trust policy | Permission policy |
|---|---|---|
| **Question it answers** | Who can become this role? | What can the role do once assumed? |
| **Policy type** | Resource-based (the role is the resource) | Identity-based |
| **Has a `Principal`?** | Yes, always | Never |
| **Typical `Action`** | `sts:AssumeRole`, `sts:AssumeRoleWithWebIdentity`, `sts:AssumeRoleWithSAML`, plus `sts:TagSession` / `sts:SetSourceIdentity` | Service actions such as `s3:GetObject` |
| **How many per role** | Exactly one | Up to 20 managed by default (25 with a quota increase), plus inline |
| **CLI to change it** | `aws iam update-assume-role-policy` | `aws iam attach-role-policy` / `put-role-policy` |

The trust policy is the only resource-based policy type IAM itself has. That is why it carries a `Principal` element when an identity-based policy is forbidden from having one: an identity policy's principal is whatever it is attached to, but a role has to say who is allowed in from outside.

The smallest useful trust policy lets one AWS service assume the role. This is the one a Lambda execution role needs, exactly as the Lambda documentation gives it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

Note what is missing: there is no `Resource`. The resource is the role the policy is attached to. Adding a `Resource` element to a trust policy is one of the quickest ways to get a `MalformedPolicyDocument` error back from IAM.

To see or replace a role's trust policy from the CLI:

```bash
# Read the current trust policy
aws iam get-role --role-name deploy-role \
  --query 'Role.AssumeRolePolicyDocument'

# Replace it with the contents of trust.json (it is replaced wholesale, not merged)
aws iam update-assume-role-policy --role-name deploy-role \
  --policy-document file://trust.json
```

> **Tip:** The other half of the role, the permission policy, is where least privilege actually lives. The [AWS IAM Policy Generator](/aws-iam-policy-generator/) builds that side from AWS's own action catalogue, with the size limits and the risky-pattern warnings applied as you type.

## The Principal element: who can be trusted

The `Principal` element takes one of a small number of keys, `AWS`, `Service` or `Federated`, each with a value or an array of values. Several principals in one statement are an **OR**: any one of them can assume the role.

### AWS accounts

```json
"Principal": { "AWS": "arn:aws:iam::111122223333:root" }
```

`"111122223333"` on its own means the same thing, and IAM may rewrite it to the ARN form when you save. The `:root` suffix confuses people: it does **not** mean only the root user can assume the role. It delegates the decision to that account. Any user or role in `111122223333` can assume your role, provided an administrator there has given it an identity policy allowing `sts:AssumeRole` on your role's ARN.

### IAM roles and users

```json
"Principal": {
  "AWS": [
    "arn:aws:iam::111122223333:role/ci-runner",
    "arn:aws:iam::111122223333:user/alice"
  ]
}
```

Naming a specific role or user is tighter than naming the account. Two rules apply. You cannot use a wildcard to match part of a principal ARN (`role/ci-*` is rejected), and you cannot name an IAM **group**: groups hold permissions but never authenticate, so they are not principals.

When you save a trust policy that names a role or user, IAM converts the ARN into that identity's **unique principal ID** and converts it back for display. This stops someone from deleting a trusted role and recreating one with the same name to inherit the trust. The side effect: if the role really is deleted, the trust policy shows a raw ID beginning `AROA` (roles) or `AIDA` (users), and recreating the role does not fix it. You have to edit the trust policy and put the ARN back.

You can also trust a specific role session (`arn:aws:sts::111122223333:assumed-role/role-name/session-name`), but AWS recommends trusting the role ARN and narrowing with conditions instead.

### AWS services

```json
"Principal": {
  "Service": ["ecs-tasks.amazonaws.com", "lambda.amazonaws.com"]
}
```

A service principal is usually `service-name.amazonaws.com`, and the exact string is defined by the service, so look it up on that service's IAM page rather than guessing. Multiple services go in an array under a single `Service` key; you cannot repeat the key. `"Service": "*"` is not allowed. For role trust policies AWS recommends the non-regional form of the service principal, because IAM roles are global.

### Federated identity providers (OIDC and SAML)

```json
"Principal": {
  "Federated": "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
}
```

```json
"Principal": {
  "Federated": "arn:aws:iam::111122223333:saml-provider/CorpIdP"
}
```

A `Federated` principal points at an identity provider you have registered in IAM, or one of the four built-in OIDC providers (`cognito-identity.amazonaws.com`, `www.amazon.com`, `graph.facebook.com`, `accounts.google.com`). OIDC federated principals are only valid in role trust policies, nowhere else.

### Everyone: `"*"`

`"Principal": "*"` (or `{"AWS": "*"}`) trusts every principal in every account, including ones you have never heard of. AWS's guidance is blunt: do not leave a role open like this. If you ever use it, a `Condition` has to do all the work of keeping strangers out, usually `aws:PrincipalOrgID` (below). IAM Access Analyzer flags roles that principals outside your organization can assume, and it is worth running on any account that has trust policies written by hand.

## The three ways in: AssumeRole, WebIdentity and SAML

The `Action` in a trust policy must match the STS operation the caller uses, and the operation is decided by what kind of principal the caller is.

| STS operation | Caller | Principal key | Caller needs AWS credentials? |
|---|---|---|---|
| `sts:AssumeRole` | IAM users, role sessions, AWS services | `AWS` or `Service` | Yes |
| `sts:AssumeRoleWithWebIdentity` | Holder of a JWT from an OIDC provider (GitHub Actions, EKS service accounts, Cognito) | `Federated` (OIDC provider) | No: the token is the proof |
| `sts:AssumeRoleWithSAML` | Holder of a SAML assertion from your IdP | `Federated` (SAML provider) | No: the assertion is the proof |

Mixing these up is a silent failure. A statement that allows `sts:AssumeRole` to a `Federated` OIDC principal will never match, because the OIDC caller is calling `AssumeRoleWithWebIdentity`.

### An OIDC trust policy for GitHub Actions

Because an OIDC caller needs no AWS credentials, the conditions are the only thing separating your repository from every other repository on GitHub. This is the shape GitHub's own documentation gives, with the provider URL `token.actions.githubusercontent.com` and the audience `sts.amazonaws.com` used by the official `aws-actions/configure-aws-credentials` action:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:octo-org/octo-repo:environment:prod"
        }
      }
    }
  ]
}
```

GitHub's default `sub` formats are `repo:ORG/REPO:ref:refs/heads/BRANCH`, `repo:ORG/REPO:ref:refs/tags/TAG`, `repo:ORG/REPO:environment:NAME` and `repo:ORG/REPO:pull_request`. Repositories created after July 15, 2026 (or opted in) emit the immutable form instead, `repo:ORG@ORG_ID/REPO@REPO_ID:…`, and a policy written for one form never matches the other. Pinning the `sub` to an environment is a good default for a deploy role, because GitHub environments can require reviewers before a job gets a token. If you need a wildcard (`repo:octo-org/octo-repo:*`), switch that key to `StringLike`; `StringEquals` treats `*` as a literal character. Never omit the `sub` condition. The workflow side, `permissions: id-token: write` and the action configuration, is covered step by step in [GitHub Actions OIDC to AWS](/learn/guides/github-actions-oidc-aws/).

### A SAML trust policy

```json
{
  "Version": "2012-10-17",
  "Statement": {
    "Effect": "Allow",
    "Action": "sts:AssumeRoleWithSAML",
    "Principal": { "Federated": "arn:aws:iam::111122223333:saml-provider/CorpIdP" },
    "Condition": {
      "StringEquals": { "SAML:aud": "https://signin.aws.amazon.com/saml" }
    }
  }
}
```

`SAML:aud` must match the AWS sign-in endpoint your IdP posts the assertion to. AWS now recommends Regional endpoints such as `https://us-east-1.signin.aws.amazon.com/saml` over the global one for resiliency. You can list several in an array, but the value has to match what your IdP actually sends.

## Cross-account roles and the external ID

Cross-account access takes **two grants, one in each account**. The role's trust policy in the target account (say `444455556666`) trusts the source account or a specific role there. The caller's identity policy in the source account allows it to call `sts:AssumeRole` on that exact role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::444455556666:role/audit-read"
    }
  ]
}
```

Within a single account the rule is different, and it trips people up in the other direction. If the trust policy names the user or role ARN directly, that is enough: a resource-based policy granting access to a principal in the same account needs no matching identity policy. If the trust policy only names the account, the user also needs an identity policy allowing `sts:AssumeRole`.

### The confused deputy and `sts:ExternalId`

Third-party SaaS tools (cost monitors, security scanners, observability vendors) usually ask you for a role they can assume from their AWS account. Role ARNs are not secret. If another customer of the same vendor types in your role ARN, the vendor would cheerfully assume your role on their behalf. AWS calls this the **confused deputy** problem: the vendor is the deputy, and it has been tricked into using its trust on the wrong customer's behalf.

The fix is an external ID that the vendor generates, unique per customer, and always sends in its `AssumeRole` call:

```json
{
  "Version": "2012-10-17",
  "Statement": {
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::999988887777:root" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": { "sts:ExternalId": "c7f3e2a1-5b9d-4e8f-a0c6-1d2e3f4a5b6c" }
    }
  }
}
```

When the other customer gives the vendor your ARN, the vendor sends *their* external ID, the condition fails, and the call is denied. Things to get right:

- **The vendor picks the value, not you.** It has to be unique across the vendor's customers, and only the vendor can guarantee that.
- **It is not a secret.** Anyone who can read the role can see it. It works because the attacker cannot change which ID the vendor sends, not because the ID is hidden.
- **Format:** 2 to 1,224 characters, alphanumeric plus `+ = , . @ : / -`, no spaces.
- **Test it.** A well-built vendor tries your role *without* the external ID first and refuses to store the ARN if that succeeds. Do the same check yourself:

```bash
aws sts assume-role \
  --role-arn arn:aws:iam::111122223333:role/vendor-readonly \
  --role-session-name check \
  --external-id c7f3e2a1-5b9d-4e8f-a0c6-1d2e3f4a5b6c
```

For your own accounts, where you are not using a third-party deputy, an external ID adds little. Name the specific role in `Principal` instead.

## Conditions that harden a trust policy

### Services: `aws:SourceAccount` and `aws:SourceArn`

A service principal like `scheduler.amazonaws.com` is shared by every AWS customer. A trust policy that trusts the bare service lets the service assume your role on behalf of any resource that names it, including a resource in someone else's account. That is the cross-service version of the confused deputy. Where a service supports it, add the global keys that identify whose resource the service is acting for. This is EventBridge Scheduler's documented execution-role trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "scheduler.amazonaws.com" },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": "111122223333",
          "aws:SourceArn": "arn:aws:scheduler:us-west-2:111122223333:schedule-group/nightly"
        }
      }
    }
  ]
}
```

If `aws:SourceArn` contains a wildcard, use `ArnLike` instead of `StringEquals`. The ARN shape is the service's call too: Scheduler, for one, requires a schedule-group ARN here, never an individual schedule. Before adding either key, check the service's own "confused deputy prevention" page: a service that does not send the key in its `AssumeRole` request will fail the condition every time, and the role silently stops working.

### Organizations: `aws:PrincipalOrgID`

`aws:PrincipalOrgID` is present in the request when the caller belongs to an AWS Organization, with a value like `o-a1b2c3d4e5`. It is a useful second lock on a trusted account, because it keeps holding if that account is ever moved out of your organization:

```json
"Principal": { "AWS": "arn:aws:iam::111122223333:role/ci-runner" },
"Action": "sts:AssumeRole",
"Condition": {
  "StringEquals": { "aws:PrincipalOrgID": "o-a1b2c3d4e5" }
}
```

`aws:PrincipalOrgPaths` narrows this to an OU. It is multivalued, so it needs `ForAnyValue:StringLike` (for example `"o-a1b2c3d4e5/r-ab12/ou-ab12-22222222/*"`). Combining `"Principal": "*"` with `aws:PrincipalOrgID` trusts every account in the organization. That is legitimate for a shared read-only role and nothing narrower.

### Humans: MFA

For roles people assume from the CLI, require MFA in the trust policy with `"Condition": {"Bool": {"aws:MultiFactorAuthPresent": "true"}}`, and have the caller pass `--serial-number` and `--token-code` to `aws sts assume-role`. In a trust policy that **allows**, `Bool` is right: a missing key fails the match, which is what you want. The `BoolIfExists` advice you may have seen applies to **deny** statements in identity policies, where a missing key needs handling the other way round.

## Session tags and source identity

Two more permissions-only actions can appear in a trust policy, alongside the `AssumeRole*` action. Neither is an API call in its own right; each unlocks an optional parameter of the assume call.

**`sts:TagSession`** lets the caller attach session tags (`--tags Key=Project,Value=Atlas` on the CLI, or `PrincipalTag` claims from an IdP) that then appear as `aws:PrincipalTag/...` in every later request. This is the basis of attribute-based access control. If the caller passes tags and the trust policy does not allow `sts:TagSession`, the whole assume call fails, not just the tags. That catches people out when an IdP is configured to send tags: **every** role connected to that IdP needs `sts:TagSession` in its trust policy. Limits are 50 tags, 128-character keys and 256-character values.

**`sts:SetSourceIdentity`** lets the caller stamp a value, typically the human's user name, that is recorded in CloudTrail and **cannot be changed for the life of the session**, even across role chaining. Where several people share one role, it answers "who actually ran this?". The `sts:SourceIdentity` condition key can require a particular value:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:user/DevUser" },
      "Action": ["sts:AssumeRole", "sts:SetSourceIdentity"],
      "Condition": {
        "StringEquals": { "sts:SourceIdentity": "DevUser" }
      }
    }
  ]
}
```

For cross-account chains, `sts:SetSourceIdentity` must be allowed in the caller's permission policy **and** in the target role's trust policy. The same IdP rule applies as for tags: once an IdP starts sending a source identity, every role it federates into needs the permission. Roles that require a source identity cannot be assumed through the console's Switch Role page, which offers no way to set one; use the CLI or API.

## Common errors and what they mean

**`User: arn:aws:iam::111122223333:user/alice is not authorized to perform: sts:AssumeRole on resource: arn:aws:iam::444455556666:role/audit-read`**
Work through it in order: the role name in the ARN is case-sensitive, so check the exact spelling; check that the trust policy's `Principal` includes the caller or its account; for cross-account or account-level trust, check that the caller has an identity policy allowing `sts:AssumeRole` on that ARN; then check every `Condition`, since a missing external ID, MFA code, tag or source identity all produce this same message.

**`Not authorized to perform sts:AssumeRoleWithWebIdentity`** (seen in GitHub Actions logs)
Almost always a `sub` that does not match: a different branch, a workflow running under an environment when the policy expects a branch ref, a pull request, a wildcard used under `StringEquals`, or a repository that emits the immutable `ORG@ID/REPO@ID` subject while the policy names the repository by name alone. Also check that the `Action` is `sts:AssumeRoleWithWebIdentity` and that the provider ARN's account ID is right.

**`MalformedPolicyDocument: Invalid principal in policy`**
IAM validates principals when you save. The usual causes are a typo in an account ID, a role or user that does not exist yet (create it first, or trust the account and narrow with `aws:PrincipalArn`), a role that names itself while it is still being created, a partial wildcard in an ARN, or a group ARN.

**A trust policy showing `AROA...` instead of an ARN**
The trusted role was deleted (see the unique-ID note above). Recreating it is not enough; edit the trust policy.

**`The requested DurationSeconds exceeds the MaxSessionDuration set for this role`**, or the one-hour role-chaining limit
`DurationSeconds` runs from 900 up to the role's maximum session duration, which can be set from 1 to 12 hours; the default is 3,600. If you assumed this role using another role's credentials, the cap is one hour whatever the setting says.

**`LimitExceeded` when saving a long trust policy**
Role trust policies default to 2,048 characters. You can request up to 8,192 through Service Quotas. Before asking, consider whether ten individual role ARNs could become one account principal plus an `aws:PrincipalArn` condition.

**The role assumes fine, but every call is AccessDenied**
The trust policy is fine; the permission side is not. Check the role's permission policies, any permissions boundary, any session policy the caller passed, and SCPs in the organization. This is the moment to rebuild the permission policy properly, scoped to the resources the role actually touches. The [AWS IAM Policy Generator](/aws-iam-policy-generator/) produces it as JSON or as a Terraform `aws_iam_policy_document`.

## A checklist before you save

- `Principal` names the narrowest thing that works: a role ARN beats an account, and an account beats `"*"`.
- `Action` matches the STS operation the caller uses: `AssumeRole`, `AssumeRoleWithWebIdentity` or `AssumeRoleWithSAML`.
- OIDC roles pin both `aud` and `sub`.
- Third-party roles require the vendor's `sts:ExternalId`.
- Service roles carry `aws:SourceAccount` / `aws:SourceArn` where the service documents them.
- `sts:TagSession` and `sts:SetSourceIdentity` are present if anything upstream sends tags or a source identity.
- No `Resource` element, no group principals, no partial wildcards in principal ARNs.
- IAM Access Analyzer shows no unexpected external access to the role.

The trust policy is short, so it gets little review, and it is the part of a role that faces the outside world. Five minutes on the list above is time well spent.

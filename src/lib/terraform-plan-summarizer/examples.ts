/**
 * examples.ts — the six example chips, in chip order.
 *
 * Chip 1 is also the boot seed, so it is the everyday case: a small deploy whose
 * counts reconcile cleanly against Terraform's own "Plan:" line and where nothing
 * is high blast radius. The other five are the five reasons somebody opens this
 * tool: a replacement they did not expect, a module teardown that takes the
 * egress path with it, the JSON format, a plan that does nothing, and — the one
 * that matters most — a truncated CI paste whose numbers do not add up.
 *
 * Every fixture is shaped like real Terraform output (1.5+ text; `show -json`
 * format_version 1.2). Chip 6 deliberately carries real ANSI colour codes and
 * CRLF line endings, because that is what a copy out of a GitHub Actions log
 * actually contains.
 */

export interface PlanExample {
  id: string;
  /** Chip label — short enough for a row of six on a 390px screen. */
  label: string;
  input: string;
}

const WEB_DEPLOY = `Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create
  ~ update in-place
  - destroy

Terraform will perform the following actions:

  # aws_ecs_task_definition.web will be created
  + resource "aws_ecs_task_definition" "web" {
      + arn                   = (known after apply)
      + container_definitions = (known after apply)
      + cpu                   = "512"
      + family                = "web"
      + id                    = (known after apply)
      + memory                = "1024"
      + revision              = (known after apply)
    }

  # aws_ecs_service.web will be updated in-place
  ~ resource "aws_ecs_service" "web" {
        id                                 = "arn:aws:ecs:eu-west-1:123456789012:service/prod/web"
        name                               = "web"
      ~ task_definition                    = "arn:aws:ecs:eu-west-1:123456789012:task-definition/web:41" -> (known after apply)
        wait_for_steady_state              = true
    }

  # aws_cloudwatch_log_group.web_old will be destroyed
  # (because aws_cloudwatch_log_group.web_old is not in configuration)
  - resource "aws_cloudwatch_log_group" "web_old" {
      - arn               = "arn:aws:logs:eu-west-1:123456789012:log-group:/ecs/web-old" -> null
      - name              = "/ecs/web-old" -> null
      - retention_in_days = 7 -> null
      - skip_destroy      = false -> null
    }

Changes to Outputs:
  ~ service_revision = "web:41" -> (known after apply)

Plan: 1 to add, 1 to change, 1 to destroy.

Do you want to perform these actions?
  Terraform will perform the actions described above.
  Only 'yes' will be accepted to approve.
`;

/**
 * Turning on encryption for an existing RDS instance is the classic surprise
 * replacement: storage_encrypted is ForceNew in the AWS provider
 * (internal/service/rds/instance.go), so the diff is a destroy-and-recreate of
 * the primary database. engine_version would be the wrong example — the
 * provider modifies it in place (a major version needs
 * allow_major_version_upgrade), it never forces a replacement.
 */
const RDS_REPLACE = `Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  ~ update in-place
-/+ destroy and then create replacement

Terraform will perform the following actions:

  # module.data.aws_db_instance.primary must be replaced
-/+ resource "aws_db_instance" "primary" {
      ~ address                               = "primary.abc123.eu-west-1.rds.amazonaws.com" -> (known after apply)
      ~ arn                                   = "arn:aws:rds:eu-west-1:123456789012:db:primary" -> (known after apply)
      ~ availability_zone                     = "eu-west-1a" -> (known after apply)
      ~ ca_cert_identifier                    = "rds-ca-rsa2048-g1" -> (known after apply)
      ~ endpoint                              = "primary.abc123.eu-west-1.rds.amazonaws.com:5432" -> (known after apply)
      ~ engine_version_actual                 = "15.7" -> (known after apply)
      ~ hosted_zone_id                        = "Z29XKXDKYMONMX" -> (known after apply)
      ~ id                                    = "db-ABCDEFGHIJKLMNOPQRSTUVWXY2" -> (known after apply)
      ~ kms_key_id                            = "" -> (known after apply)
      ~ resource_id                           = "db-ABCDEFGHIJKLMNOPQRSTUVWXY2" -> (known after apply)
      ~ status                                = "available" -> (known after apply)
      ~ storage_encrypted                     = false -> true # forces replacement
        tags                                  = {}
        # (35 unchanged attributes hidden)
    }

  # module.data.aws_db_parameter_group.primary will be updated in-place
  ~ resource "aws_db_parameter_group" "primary" {
        id           = "primary-pg15"
        name         = "primary-pg15"
        tags         = {}
        # (6 unchanged attributes hidden)

      + parameter {
          + apply_method = "immediate"
          + name         = "log_min_duration_statement"
          + value        = "500"
        }

        # (2 unchanged blocks hidden)
    }

Plan: 1 to add, 1 to change, 1 to destroy.
`;

const MODULE_TEARDOWN = `Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  - destroy

Terraform will perform the following actions:

  # module.staging.module.network.aws_nat_gateway.egress[0] will be destroyed
  # (because module.staging.module.network is not in configuration)
  - resource "aws_nat_gateway" "egress" {
      - allocation_id     = "eipalloc-0aaaaaaaaaaaaaaa1" -> null
      - id                = "nat-0aaaaaaaaaaaaaaa1" -> null
      - public_ip         = "203.0.113.24" -> null
      - subnet_id         = "subnet-0aaaaaaaaaaaaaaa1" -> null
    }

  # module.staging.module.network.aws_subnet.private[0] will be destroyed
  # (because module.staging.module.network is not in configuration)
  - resource "aws_subnet" "private" {
      - cidr_block = "10.20.1.0/24" -> null
      - id         = "subnet-0aaaaaaaaaaaaaaa1" -> null
      - vpc_id     = "vpc-0aaaaaaaaaaaaaaa1" -> null
    }

  # module.staging.module.network.aws_subnet.private[1] will be destroyed
  # (because module.staging.module.network is not in configuration)
  - resource "aws_subnet" "private" {
      - cidr_block = "10.20.2.0/24" -> null
      - id         = "subnet-0aaaaaaaaaaaaaaa2" -> null
      - vpc_id     = "vpc-0aaaaaaaaaaaaaaa1" -> null
    }

  # module.staging.aws_ebs_volume.scratch will be destroyed
  # (because module.staging is not in configuration)
  - resource "aws_ebs_volume" "scratch" {
      - availability_zone = "eu-west-1a" -> null
      - id                = "vol-0aaaaaaaaaaaaaaa1" -> null
      - size              = 500 -> null
    }

  # module.staging.aws_iam_role.runner will be destroyed
  # (because module.staging is not in configuration)
  - resource "aws_iam_role" "runner" {
      - arn  = "arn:aws:iam::123456789012:role/staging-runner" -> null
      - id   = "staging-runner" -> null
      - name = "staging-runner" -> null
    }

Changes to Outputs:
  - staging_nat_ip = "203.0.113.24" -> null

Plan: 0 to add, 0 to change, 5 to destroy.
`;

const SHOW_JSON = JSON.stringify(
  {
    format_version: '1.2',
    terraform_version: '1.9.5',
    resource_drift: [
      {
        address: 'aws_security_group.web',
        mode: 'managed',
        type: 'aws_security_group',
        name: 'web',
        provider_name: 'registry.terraform.io/hashicorp/aws',
        change: { actions: ['update'] },
      },
    ],
    resource_changes: [
      {
        address: 'aws_eks_cluster.platform',
        mode: 'managed',
        type: 'aws_eks_cluster',
        name: 'platform',
        provider_name: 'registry.terraform.io/hashicorp/aws',
        change: {
          actions: ['delete', 'create'],
          replace_paths: [['encryption_config']],
          before_sensitive: {},
          after_sensitive: {},
        },
        action_reason: 'replace_because_cannot_update',
      },
      {
        address: 'module.platform.aws_iam_role.nodes',
        module_address: 'module.platform',
        mode: 'managed',
        type: 'aws_iam_role',
        name: 'nodes',
        provider_name: 'registry.terraform.io/hashicorp/aws',
        change: { actions: ['create'] },
      },
      {
        address: 'aws_secretsmanager_secret_version.db',
        mode: 'managed',
        type: 'aws_secretsmanager_secret_version',
        name: 'db',
        provider_name: 'registry.terraform.io/hashicorp/aws',
        change: {
          actions: ['update'],
          before_sensitive: { secret_string: true },
          after_sensitive: { secret_string: true },
        },
      },
      {
        address: 'data.aws_ami.bottlerocket',
        mode: 'data',
        type: 'aws_ami',
        name: 'bottlerocket',
        provider_name: 'registry.terraform.io/hashicorp/aws',
        change: { actions: ['read'] },
        action_reason: 'read_because_config_unknown',
      },
      {
        address: 'aws_s3_bucket.artifacts',
        previous_address: 'aws_s3_bucket.build_artifacts',
        mode: 'managed',
        type: 'aws_s3_bucket',
        name: 'artifacts',
        provider_name: 'registry.terraform.io/hashicorp/aws',
        change: { actions: ['no-op'] },
      },
    ],
    output_changes: {
      cluster_endpoint: { actions: ['update'], after_sensitive: false },
      kubeconfig: { actions: ['update'], after_sensitive: true },
    },
  },
  null,
  2,
);

const NO_CHANGES = `aws_iam_role.app: Refreshing state... [id=app]
aws_ecs_service.web: Refreshing state... [id=arn:aws:ecs:eu-west-1:123456789012:service/prod/web]
module.data.aws_db_instance.primary: Refreshing state... [id=primary]

No changes. Your infrastructure matches the configuration.

Terraform has compared your real infrastructure against your configuration and
found no differences, so no changes are needed.
`;

/**
 * A GitHub Actions log excerpt: bold/colour escapes, CRLF endings, and a middle
 * the log viewer folded away — which is exactly why the reconciliation warning
 * exists. Terraform's own line says nine actions; four survived the copy.
 */
const TRUNCATED_CI = [
  '\u001b[0m\u001b[1mTerraform used the selected providers to generate the following execution\u001b[0m',
  'plan. Resource actions are indicated with the following symbols:',
  '  \u001b[32m+\u001b[0m create',
  '  \u001b[33m~\u001b[0m update in-place',
  '  \u001b[31m-\u001b[0m destroy',
  '',
  '\u001b[1mTerraform will perform the following actions:\u001b[0m',
  '',
  '  \u001b[1m# aws_lb_target_group.blue\u001b[0m will be created',
  '  \u001b[32m+\u001b[0m resource "aws_lb_target_group" "blue" {',
  '      \u001b[32m+\u001b[0m arn      = (known after apply)',
  '      \u001b[32m+\u001b[0m name     = "blue"',
  '      \u001b[32m+\u001b[0m port     = 8080',
  '      \u001b[32m+\u001b[0m protocol = "HTTP"',
  '    }',
  '',
  '  \u001b[1m# aws_lb_listener_rule.blue\u001b[0m will be created',
  '  \u001b[32m+\u001b[0m resource "aws_lb_listener_rule" "blue" {',
  '      \u001b[32m+\u001b[0m arn      = (known after apply)',
  '      \u001b[32m+\u001b[0m priority = 100',
  '    }',
  '',
  '  \u001b[1m# aws_autoscaling_group.web\u001b[0m will be updated in-place',
  '  \u001b[33m~\u001b[0m resource "aws_autoscaling_group" "web" {',
  '        id               = "web-20240112"',
  '      \u001b[33m~\u001b[0m desired_capacity = 4 -> 6',
  '    }',
  '',
  '  \u001b[1m# aws_lb_target_group.green\u001b[0m will be destroyed',
  '  \u001b[31m-\u001b[0m resource "aws_lb_target_group" "green" {',
  '      \u001b[31m-\u001b[0m arn  = "arn:aws:elasticloadbalancing:eu-west-1:123456789012:targetgroup/green/aaaa" -> null',
  '      \u001b[31m-\u001b[0m name = "green" -> null',
  '    }',
  '',
  '##[group]Show more (2417 lines)',
  '##[endgroup]',
  '',
  '\u001b[1mPlan:\u001b[0m 4 to add, 3 to change, 2 to destroy.',
  '',
].join('\r\n');

export const examples: PlanExample[] = [
  { id: 'web-deploy', label: 'Web deploy', input: WEB_DEPLOY },
  { id: 'rds-replace', label: 'RDS replace', input: RDS_REPLACE },
  { id: 'module-teardown', label: 'Module teardown', input: MODULE_TEARDOWN },
  { id: 'show-json', label: 'show -json', input: SHOW_JSON },
  { id: 'no-changes', label: 'No changes', input: NO_CHANGES },
  { id: 'truncated-ci', label: 'Truncated CI log', input: TRUNCATED_CI },
];

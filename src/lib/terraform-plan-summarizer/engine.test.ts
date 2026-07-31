/**
 * engine.test.ts — the pinned corpus for the Terraform Plan Summarizer.
 *
 * Every fixture below is shaped like real output from a real Terraform version
 * (1.5 / 1.7 / 1.9 text, `show -json` format_version 0.1–1.2). The wordings of
 * every diagnostic and reconciliation message are asserted BYTE-FOR-BYTE,
 * because they are the tool's product: a vague "invalid input" is exactly the
 * failure mode the playground contract forbids.
 *
 * The 17 cases the build spec pins are tagged `[C1]`…`[C17]` on the `it()` that
 * covers them, so a reviewer can grep rather than trust a summary:
 *
 *   C1  ANSI escapes                C10 (known after apply) never crashes
 *   C2  CRLF                        C11 (sensitive value) flag
 *   C3  -/+ vs +/-                  C12 truncated paste → absent + partial
 *   C4  forces-replacement blame    C13 "No changes." calm success
 *   C5  <= read excluded            C14 reconciliation math warning
 *   C6  moved / imported            C15 outputs-only plan valid
 *   C7  tainted                     C16 drift preamble separated
 *   C8  module.a.module.b nesting   C17 format_version range + unknown major
 *   C9  [0] and ["prod"] indexes
 *
 * Plus: the blast-radius table, Terraform's replace = +1 add AND +1 destroy
 * accounting, the Markdown report, and a hostile-input table proving the engine
 * never throws on garbage, empty, truncated or huge input.
 */
import { describe, expect, it } from 'vitest';
import { summarizePlan, toMarkdown } from './engine';
import { detectInput } from './detect';
import { classifyRisk, RISK_PATTERNS } from './blast-radius';
import { parseAddress } from './text-parser';
import { examples } from './examples';
import type { PlanSummary, ResourceChange } from './types';

/* ────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

function byAddress(summary: PlanSummary, address: string): ResourceChange {
  const found = summary.changes.find((c) => c.address === address);
  if (!found) {
    throw new Error(
      `no change for ${address}; parsed: ${summary.changes.map((c) => c.address).join(', ')}`,
    );
  }
  return found;
}

function messages(summary: PlanSummary): string[] {
  return summary.diagnostics.map((d) => d.message);
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Text fixtures                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

/** Mixed create / update / destroy, an output change, and a matching Plan line. */
const TEXT_MIXED = `Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  + create
  ~ update in-place
  - destroy

Terraform will perform the following actions:

  # aws_ecs_task_definition.web will be created
  + resource "aws_ecs_task_definition" "web" {
      + arn    = (known after apply)
      + family = "web"
      + id     = (known after apply)
    }

  # aws_ecs_service.web will be updated in-place
  ~ resource "aws_ecs_service" "web" {
        id              = "arn:aws:ecs:eu-west-1:123456789012:service/prod/web"
        name            = "web"
      ~ task_definition = "web:41" -> (known after apply)
    }

  # aws_cloudwatch_log_group.web_old will be destroyed
  # (because aws_cloudwatch_log_group.web_old is not in configuration)
  - resource "aws_cloudwatch_log_group" "web_old" {
      - name              = "/ecs/web-old" -> null
      - retention_in_days = 7 -> null
    }

Changes to Outputs:
  ~ service_revision = "web:41" -> (known after apply)

Plan: 1 to add, 1 to change, 1 to destroy.
`;

/** `-/+` destroy-then-create, with the replacement blamed on one attribute. */
const TEXT_RDS_REPLACE = `Terraform will perform the following actions:

  # module.data.aws_db_instance.primary must be replaced
-/+ resource "aws_db_instance" "primary" {
      ~ address                     = "primary.abc.eu-west-1.rds.amazonaws.com" -> (known after apply)
        allocated_storage           = 100
      ~ engine_version              = "13.4" -> "15.3" # forces replacement
      ~ id                          = "primary" -> (known after apply)
        identifier                  = "primary"
      ~ password                    = (sensitive value)
    }

Plan: 1 to add, 0 to change, 1 to destroy.
`;

/** `+/-` create-before-destroy. */
const TEXT_CBD_REPLACE = `Terraform will perform the following actions:

  # aws_instance.web must be replaced
+/- resource "aws_instance" "web" {
      ~ ami = "ami-0aaaaaaaaaaaaaaa1" -> "ami-0aaaaaaaaaaaaaaa2" # forces replacement
      ~ id  = "i-0123456789abcdef0" -> (known after apply)
    }

Plan: 1 to add, 0 to change, 1 to destroy.
`;

/** Two resources: only the second one is forced to replace. */
const TEXT_BLAME = `Terraform will perform the following actions:

  # aws_launch_template.app will be updated in-place
  ~ resource "aws_launch_template" "app" {
      ~ image_id = "ami-0aaaaaaaaaaaaaaa1" -> "ami-0aaaaaaaaaaaaaaa2"
    }

  # aws_ecs_cluster.main must be replaced
-/+ resource "aws_ecs_cluster" "main" {
      ~ name = "prod-old" -> "prod-new" # forces replacement
    }

Plan: 1 to add, 1 to change, 1 to destroy.
`;

/** A data source read during apply sits outside add/change/destroy. */
const TEXT_READ = `Terraform will perform the following actions:

  # data.aws_ami.ubuntu will be read during apply
  # (config refers to values not yet known)
 <= data "aws_ami" "ubuntu" {
      + id          = (known after apply)
      + most_recent = true
      + owners      = [
          + "099720109477",
        ]
    }

  # aws_instance.web will be created
  + resource "aws_instance" "web" {
      + ami = (known after apply)
      + id  = (known after apply)
    }

Plan: 1 to add, 0 to change, 0 to destroy.
`;

/** A `moved` no-op and a 1.5-style `import` block, neither of which is an add. */
const TEXT_MOVE_IMPORT = `Terraform will perform the following actions:

  # aws_instance.old has moved to aws_instance.new
    resource "aws_instance" "old" {
        id            = "i-0123456789abcdef0"
        instance_type = "t3.small"
    }

  # aws_s3_bucket.legacy will be imported
    resource "aws_s3_bucket" "legacy" {
        bucket = "acme-legacy-assets"
        id     = "acme-legacy-assets"
    }

Plan: 1 to import, 0 to add, 0 to change, 0 to destroy.
`;

const TEXT_TAINTED = `Terraform will perform the following actions:

  # aws_instance.bastion is tainted, so must be replaced
-/+ resource "aws_instance" "bastion" {
      ~ id = "i-0123456789abcdef0" -> (known after apply)
    }

Plan: 1 to add, 0 to change, 1 to destroy.
`;

/** Nested modules, a count index, a for_each module key, and a NAT gateway. */
const TEXT_MODULES = `Terraform will perform the following actions:

  # module.network.module.subnets.aws_subnet.private[0] will be destroyed
  # (because module.network.module.subnets.aws_subnet.private is not in configuration)
  - resource "aws_subnet" "private" {
      - cidr_block = "10.0.1.0/24" -> null
      - id         = "subnet-0aaaaaaaaaaaaaaa1" -> null
    }

  # module.envs["prod"].aws_nat_gateway.egress will be destroyed
  - resource "aws_nat_gateway" "egress" {
      - id        = "nat-0aaaaaaaaaaaaaaa1" -> null
      - public_ip = "203.0.113.24" -> null
    }

Plan: 0 to add, 0 to change, 2 to destroy.
`;

/** Cut off mid-resource, the way a CI log excerpt is. No Plan line at all. */
const TEXT_TRUNCATED_NO_PLAN = `Terraform will perform the following actions:

  # aws_iam_role.app will be created
  + resource "aws_iam_role" "app" {
      + arn  = (known after apply)
      + name = "app"
`;

const TEXT_NO_CHANGES = `aws_instance.web: Refreshing state... [id=i-0123456789abcdef0]

No changes. Your infrastructure matches the configuration.

Terraform has compared your real infrastructure against your configuration and
found no differences, so no changes are needed.
`;

/** Middle elided, so the Plan line and the parsed list cannot agree. */
const TEXT_MISMATCH = `Terraform will perform the following actions:

  # aws_iam_role.app will be created
  + resource "aws_iam_role" "app" {
      + name = "app"
    }

Plan: 3 to add, 1 to change, 2 to destroy.
`;

const TEXT_OUTPUTS_ONLY = `Changes to Outputs:
  + api_url = (known after apply)
  - legacy  = "https://old.example.com" -> null

You can apply this plan to save these new output values to the Terraform
state, without changing any real infrastructure.
`;

const TEXT_DRIFT = `Note: Objects have changed outside of Terraform

Terraform detected the following changes made outside of Terraform since the
last "terraform apply" which may have affected this plan:

  # aws_instance.web has changed
  ~ resource "aws_instance" "web" {
        id   = "i-0123456789abcdef0"
      ~ tags = {
          ~ "Name" = "web" -> "web-renamed"
        }
    }

Unless you have made equivalent changes to your configuration, or ignored the
relevant attributes using ignore_changes, the following plan may include
actions to undo or respond to these changes.

──────────────────────────────────────────────────────────────────────────────

Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
  ~ update in-place

Terraform will perform the following actions:

  # aws_instance.web will be updated in-place
  ~ resource "aws_instance" "web" {
      ~ tags = {
          ~ "Name" = "web-renamed" -> "web"
        }
    }

Plan: 0 to add, 1 to change, 0 to destroy.
`;

/* ────────────────────────────────────────────────────────────────────────── */
/* JSON fixtures                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

const JSON_PLAN = JSON.stringify({
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
      address: 'module.data.aws_db_instance.primary',
      module_address: 'module.data',
      mode: 'managed',
      type: 'aws_db_instance',
      name: 'primary',
      provider_name: 'registry.terraform.io/hashicorp/aws',
      change: {
        actions: ['delete', 'create'],
        replace_paths: [['engine_version'], ['root_block_device', 0, 'volume_type']],
        before_sensitive: { password: true },
        after_sensitive: {},
      },
      action_reason: 'replace_because_cannot_update',
    },
    {
      address: 'aws_instance.bastion',
      mode: 'managed',
      type: 'aws_instance',
      name: 'bastion',
      provider_name: 'registry.terraform.io/hashicorp/aws',
      change: { actions: ['create', 'delete'], replace_paths: [] },
      action_reason: 'replace_because_tainted',
    },
    {
      address: 'aws_iam_role.app',
      mode: 'managed',
      type: 'aws_iam_role',
      name: 'app',
      provider_name: 'registry.terraform.io/hashicorp/aws',
      change: { actions: ['create'] },
    },
    {
      address: 'data.aws_ami.ubuntu',
      mode: 'data',
      type: 'aws_ami',
      name: 'ubuntu',
      provider_name: 'registry.terraform.io/hashicorp/aws',
      change: { actions: ['read'] },
      action_reason: 'read_because_config_unknown',
    },
    {
      address: 'aws_instance.new',
      previous_address: 'aws_instance.old',
      mode: 'managed',
      type: 'aws_instance',
      name: 'new',
      provider_name: 'registry.terraform.io/hashicorp/aws',
      change: { actions: ['no-op'] },
    },
    {
      address: 'aws_s3_bucket.legacy',
      mode: 'managed',
      type: 'aws_s3_bucket',
      name: 'legacy',
      provider_name: 'registry.terraform.io/hashicorp/aws',
      change: { actions: ['no-op'], importing: { id: 'acme-legacy-assets' } },
    },
    {
      address: 'module.network.aws_subnet.private[2]',
      module_address: 'module.network',
      mode: 'managed',
      type: 'aws_subnet',
      name: 'private',
      index: 2,
      provider_name: 'registry.terraform.io/hashicorp/aws',
      change: { actions: ['delete'] },
      action_reason: 'delete_because_no_resource_config',
    },
  ],
  output_changes: {
    api_url: { actions: ['create'], after_sensitive: false },
    db_password: { actions: ['update'], after_sensitive: true },
  },
});

/* ────────────────────────────────────────────────────────────────────────── */
/* Pinned wordings — asserted byte-for-byte everywhere below                   */
/* ────────────────────────────────────────────────────────────────────────── */

const MSG = {
  empty:
    'Paste terraform plan output, or the output of "terraform show -json tfplan", to summarize it.',
  stateJson:
    'This is "terraform show -json" output for STATE, not for a plan: it has "values" but no "resource_changes". Run "terraform plan -out=tfplan", then "terraform show -json tfplan".',
  validateJson:
    'This is "terraform validate -json" output, not a plan: it has "valid" and "diagnostics" but no "resource_changes".',
  otherJson:
    'This is JSON, but it has neither "resource_changes" nor "output_changes", so it is not a Terraform plan. Run "terraform show -json tfplan" on a saved plan file.',
  badJson:
    'The input starts with "{" so it was read as JSON, but it is not valid JSON. If it came out of a log the paste is probably truncated.',
  notAPlan:
    'This does not look like terraform plan output: there is no "Plan:" line, no "# <address> will be ..." line, and no "No changes." line. Paste the plan as Terraform printed it, or the output of "terraform show -json tfplan".',
  absentText:
    'No "Plan:" line was found, so these counts could not be cross-checked against Terraform\'s own total. A paste copied out of CI logs is usually truncated — paste the whole plan, or use "terraform show -json tfplan".',
  absentOutputsOnly:
    'This plan changes outputs only. Terraform prints no "Plan:" line for an outputs-only plan, so there is nothing to cross-check — and applying it changes no real infrastructure.',
  absentJson:
    'Read straight from "resource_changes" in "terraform show -json" output, which is a documented, versioned format — there is no "Plan:" text line to cross-check against.',
  noChangesReconciled:
    'Terraform\'s own summary line is "No changes." and no resource actions were parsed — the two agree.',
  unknownFormatVersion:
    'Unknown plan JSON format_version "2.0". This tool is written against 0.1 through 1.x, so fields may have been renamed — treat every count here as unverified.',
} as const;

/* ────────────────────────────────────────────────────────────────────────── */

describe('detectInput', () => {
  it('separates plan text, plan JSON, and the three JSON near-misses', () => {
    expect(detectInput(TEXT_MIXED).kind).toBe('plan-text');
    expect(detectInput(JSON_PLAN).kind).toBe('plan-json');
    expect(detectInput('   \n\t  ').kind).toBe('empty');
    expect(detectInput('{"format_version":"1.0","values":{}}').kind).toBe('state-json');
    expect(detectInput('{"valid":true,"diagnostics":[]}').kind).toBe('validate-json');
    expect(detectInput('{"hello":"world"}').kind).toBe('other-json');
    expect(detectInput('{not json at all').kind).toBe('broken-json');
    expect(detectInput('a totally unrelated log line').kind).toBe('unknown');
  });

  it('recognises a plan JSON that only carries output_changes', () => {
    expect(detectInput('{"format_version":"1.1","output_changes":{}}').kind).toBe('plan-json');
  });

  it('sees through a leading BOM and leading blank lines', () => {
    expect(detectInput(`\uFEFF\n\n${JSON_PLAN}`).kind).toBe('plan-json');
    expect(detectInput(`\uFEFF${TEXT_NO_CHANGES}`).kind).toBe('plan-text');
  });
});

describe('parseAddress', () => {
  it('[C8][C9] splits nested modules, for_each module keys and both index forms', () => {
    expect(parseAddress('aws_instance.web')).toEqual({
      moduleChain: [],
      mode: 'managed',
      type: 'aws_instance',
      name: 'web',
      index: null,
    });
    expect(parseAddress('module.network.module.subnets.aws_subnet.private[0]')).toEqual({
      moduleChain: ['network', 'subnets'],
      mode: 'managed',
      type: 'aws_subnet',
      name: 'private',
      index: '0',
    });
    expect(parseAddress('module.envs["prod"].aws_nat_gateway.egress')).toEqual({
      moduleChain: ['envs["prod"]'],
      mode: 'managed',
      type: 'aws_nat_gateway',
      name: 'egress',
      index: null,
    });
    expect(parseAddress('aws_instance.web["prod"]')).toEqual({
      moduleChain: [],
      mode: 'managed',
      type: 'aws_instance',
      name: 'web',
      index: 'prod',
    });
    expect(parseAddress('data.aws_ami.ubuntu')).toEqual({
      moduleChain: [],
      mode: 'data',
      type: 'aws_ami',
      name: 'ubuntu',
      index: null,
    });
  });

  it('never throws on a malformed address', () => {
    for (const junk of ['', '.', 'module.', 'module.a.', '[0]', 'a..b', '"..."', 'module.a.module']) {
      expect(() => parseAddress(junk)).not.toThrow();
    }
  });
});

describe('summarizePlan — text format', () => {
  it('reads a mixed plan and reconciles it against the "Plan:" line', () => {
    const s = summarizePlan(TEXT_MIXED);
    expect(s.ok).toBe(true);
    expect(s.format).toBe('text');
    expect(s.changes.map((c) => c.address)).toEqual([
      'aws_ecs_task_definition.web',
      'aws_ecs_service.web',
      'aws_cloudwatch_log_group.web_old',
    ]);
    expect(s.changes.map((c) => c.action)).toEqual(['create', 'update', 'delete']);
    expect(s.counts).toEqual({
      create: 1,
      update: 1,
      destroy: 1,
      replace: 0,
      read: 0,
      import: 0,
      move: 0,
      forget: 0,
      noop: 0,
    });
    expect(s.totals).toEqual({ add: 1, change: 1, destroy: 1, import: 0, forget: 0 });
    expect(s.summaryLine).toBe('Plan: 1 to add, 1 to change, 1 to destroy.');
    expect(s.reconciliation.status).toBe('match');
    expect(s.reconciliation.message).toBe(
      'Counts reconcile with Terraform\'s own "Plan:" line (1 to add, 1 to change, 1 to destroy).',
    );
    expect(s.outputChanges).toEqual([
      { name: 'service_revision', action: 'update', sensitive: false },
    ]);
    expect(s.highRisk).toEqual([]);
    expect(s.driftCount).toBe(0);
  });

  it('keeps the verbatim "(because …)" reason Terraform printed', () => {
    const s = summarizePlan(TEXT_MIXED);
    expect(byAddress(s, 'aws_cloudwatch_log_group.web_old').actionReason).toBe(
      'because aws_cloudwatch_log_group.web_old is not in configuration',
    );
    expect(byAddress(s, 'aws_ecs_service.web').actionReason).toBeNull();
  });

  it('[C3][C11] reads -/+ as destroy-then-create and flags the sensitive attribute', () => {
    const s = summarizePlan(TEXT_RDS_REPLACE);
    const rds = byAddress(s, 'module.data.aws_db_instance.primary');
    expect(rds.action).toBe('replace');
    expect(rds.replaceOrder).toBe('destroy-create');
    expect(rds.replaceReasons).toEqual(['engine_version']);
    expect(rds.sensitive).toBe(true);
    expect(rds.moduleChain).toEqual(['data']);
    expect(rds.type).toBe('aws_db_instance');
    expect(rds.name).toBe('primary');
    expect(s.counts.replace).toBe(1);
    expect(s.counts.create).toBe(0);
    expect(s.counts.destroy).toBe(0);
    expect(s.reconciliation.status).toBe('match');
  });

  it('[C3] reads +/- as create-before-destroy', () => {
    const s = summarizePlan(TEXT_CBD_REPLACE);
    const web = byAddress(s, 'aws_instance.web');
    expect(web.action).toBe('replace');
    expect(web.replaceOrder).toBe('create-destroy');
    expect(web.replaceReasons).toEqual(['ami']);
  });

  it('[C4] blames "# forces replacement" on the resource whose block it is in', () => {
    const s = summarizePlan(TEXT_BLAME);
    expect(byAddress(s, 'aws_launch_template.app').replaceReasons).toEqual([]);
    expect(byAddress(s, 'aws_launch_template.app').action).toBe('update');
    expect(byAddress(s, 'aws_ecs_cluster.main').replaceReasons).toEqual(['name']);
  });

  it('[C5][C10] excludes "<= read" from add/change/destroy and survives (known after apply)', () => {
    const s = summarizePlan(TEXT_READ);
    const ami = byAddress(s, 'data.aws_ami.ubuntu');
    expect(ami.action).toBe('read');
    expect(ami.mode).toBe('data');
    expect(s.counts.read).toBe(1);
    expect(s.counts.create).toBe(1);
    expect(s.totals).toEqual({ add: 1, change: 0, destroy: 0, import: 0, forget: 0 });
    expect(s.reconciliation.status).toBe('match');
  });

  it('[C6] reads a move (old → new) and an import, neither of which is an add', () => {
    const s = summarizePlan(TEXT_MOVE_IMPORT);
    const moved = byAddress(s, 'aws_instance.new');
    expect(moved.action).toBe('move');
    expect(moved.movedFrom).toBe('aws_instance.old');
    const imported = byAddress(s, 'aws_s3_bucket.legacy');
    expect(imported.action).toBe('import');
    expect(imported.imported).toBe(true);
    expect(s.counts.move).toBe(1);
    expect(s.counts.import).toBe(1);
    expect(s.totals).toEqual({ add: 0, change: 0, destroy: 0, import: 1, forget: 0 });
    expect(s.reconciliation.status).toBe('match');
  });

  it('[C7] flags a tainted replacement without inventing an attribute to blame', () => {
    const s = summarizePlan(TEXT_TAINTED);
    const bastion = byAddress(s, 'aws_instance.bastion');
    expect(bastion.tainted).toBe(true);
    expect(bastion.action).toBe('replace');
    expect(bastion.replaceReasons).toEqual([]);
    expect(bastion.risk?.klass).toBe('data-store');
  });

  it('[C8][C9] carries nested modules and both index forms through the summary', () => {
    const s = summarizePlan(TEXT_MODULES);
    const subnet = byAddress(s, 'module.network.module.subnets.aws_subnet.private[0]');
    expect(subnet.moduleChain).toEqual(['network', 'subnets']);
    expect(subnet.index).toBe('0');
    const nat = byAddress(s, 'module.envs["prod"].aws_nat_gateway.egress');
    expect(nat.moduleChain).toEqual(['envs["prod"]']);
    expect(nat.risk?.klass).toBe('egress-path');
    expect(s.highRisk.map((c) => c.address)).toEqual([
      'module.envs["prod"].aws_nat_gateway.egress',
    ]);
    expect(s.reconciliation.status).toBe('match');
  });

  it('[C12] returns partial results and reconciliation "absent" for a truncated paste', () => {
    const s = summarizePlan(TEXT_TRUNCATED_NO_PLAN);
    expect(s.ok).toBe(true);
    expect(s.changes.map((c) => c.address)).toEqual(['aws_iam_role.app']);
    expect(s.summaryLine).toBeNull();
    expect(s.reconciliation.status).toBe('absent');
    expect(s.reconciliation.message).toBe(MSG.absentText);
    expect(messages(s)).toContain(MSG.absentText);
    expect(s.diagnostics.find((d) => d.message === MSG.absentText)?.severity).toBe('warning');
  });

  it('[C13] treats "No changes." as a calm success, not an empty result', () => {
    const s = summarizePlan(TEXT_NO_CHANGES);
    expect(s.ok).toBe(true);
    expect(s.noChanges).toBe(true);
    expect(s.changes).toEqual([]);
    expect(s.summaryLine).toBe('No changes. Your infrastructure matches the configuration.');
    expect(s.totals).toEqual({ add: 0, change: 0, destroy: 0, import: 0, forget: 0 });
    expect(s.reconciliation.status).toBe('match');
    expect(s.reconciliation.message).toBe(MSG.noChangesReconciled);
  });

  it('accepts every "No changes." wording Terraform has shipped', () => {
    for (const line of [
      'No changes. Your infrastructure matches the configuration.',
      'No changes. Your infrastructure still matches the configuration.',
      'No changes. Infrastructure is up-to-date.',
    ]) {
      const s = summarizePlan(`${line}\n`);
      expect(s.noChanges, line).toBe(true);
      expect(s.summaryLine, line).toBe(line);
    }
  });

  it('[C14] warns loudly when the parsed list and the "Plan:" line disagree', () => {
    const s = summarizePlan(TEXT_MISMATCH);
    expect(s.ok).toBe(true);
    expect(s.reconciliation.status).toBe('mismatch');
    expect(s.reconciliation.reported).toMatchObject({ add: 3, change: 1, destroy: 2 });
    expect(s.reconciliation.computed).toEqual({
      add: 1,
      change: 0,
      destroy: 0,
      import: 0,
      forget: 0,
    });
    expect(s.reconciliation.message).toBe(
      'Count mismatch. Terraform\'s "Plan:" line reports 3 to add, 1 to change, 2 to destroy; ' +
        'the resources parsed here add up to 1 to add, 0 to change, 0 to destroy. ' +
        'Terraform\'s text output is not a stable format: trust the "Plan:" line and treat ' +
        'the list below as incomplete.',
    );
    expect(s.diagnostics[0]).toEqual({
      severity: 'warning',
      message: s.reconciliation.message,
    });
  });

  it('[C15] accepts an outputs-only plan and explains why there is no "Plan:" line', () => {
    const s = summarizePlan(TEXT_OUTPUTS_ONLY);
    expect(s.ok).toBe(true);
    expect(s.changes).toEqual([]);
    expect(s.outputChanges).toEqual([
      { name: 'api_url', action: 'create', sensitive: false },
      { name: 'legacy', action: 'delete', sensitive: false },
    ]);
    expect(s.reconciliation.status).toBe('absent');
    expect(s.reconciliation.message).toBe(MSG.absentOutputsOnly);
    expect(s.diagnostics.find((d) => d.message === MSG.absentOutputsOnly)?.severity).toBe('info');
  });

  it('[C16] keeps the drift preamble out of the plan counts', () => {
    const s = summarizePlan(TEXT_DRIFT);
    expect(s.driftCount).toBe(1);
    expect(s.drift.map((c) => c.address)).toEqual(['aws_instance.web']);
    expect(s.changes.map((c) => c.address)).toEqual(['aws_instance.web']);
    expect(s.counts.update).toBe(1);
    expect(s.totals).toEqual({ add: 0, change: 1, destroy: 0, import: 0, forget: 0 });
    expect(s.reconciliation.status).toBe('match');
    expect(messages(s)).toContain(
      '1 resource changed outside Terraform (drift). Drift is listed separately and is NOT part of the add/change/destroy counts.',
    );
  });

  it('[C1] strips ANSI colour so a CI paste parses identically to a clean one', () => {
    const ansi = TEXT_MIXED.replace(/^(  # .*)$/gm, '\u001b[1m$1\u001b[0m')
      .replace(/^  \+ resource/gm, '  \u001b[32m+\u001b[0m resource')
      .replace(/^  - resource/gm, '  \u001b[31m-\u001b[0m resource');
    expect(ansi).not.toBe(TEXT_MIXED);
    const s = summarizePlan(ansi);
    const clean = summarizePlan(TEXT_MIXED);
    expect(s.changes.map((c) => `${c.address}:${c.action}`)).toEqual(
      clean.changes.map((c) => `${c.address}:${c.action}`),
    );
    expect(s.counts).toEqual(clean.counts);
    expect(s.reconciliation.status).toBe('match');
  });

  it('[C2] handles CRLF (and a lone CR) exactly like LF', () => {
    const crlf = summarizePlan(TEXT_MIXED.replace(/\n/g, '\r\n'));
    const cr = summarizePlan(TEXT_MIXED.replace(/\n/g, '\r'));
    const lf = summarizePlan(TEXT_MIXED);
    expect(crlf.counts).toEqual(lf.counts);
    expect(cr.counts).toEqual(lf.counts);
    expect(crlf.summaryLine).toBe(lf.summaryLine);
    expect(cr.summaryLine).toBe(lf.summaryLine);
  });

  it('records the CLI product and version when the paste happens to carry it', () => {
    const s = summarizePlan(`Terraform v1.9.5\non linux_amd64\n\n${TEXT_MIXED}`);
    expect(s.versions).toEqual({ product: 'Terraform', version: '1.9.5', formatVersion: null });
    const tofu = summarizePlan(`OpenTofu v1.8.2\n\n${TEXT_MIXED}`);
    expect(tofu.versions.product).toBe('OpenTofu');
    expect(tofu.versions.version).toBe('1.8.2');
  });

  it('keeps an unmodelled "N to X" pair from the Plan line instead of dropping it', () => {
    const s = summarizePlan(
      TEXT_MIXED.replace(
        'Plan: 1 to add, 1 to change, 1 to destroy.',
        'Plan: 1 to add, 1 to change, 1 to destroy, 2 to bounce.',
      ),
    );
    expect(s.reconciliation.reported?.unmodeled).toEqual([{ key: 'bounce', value: 2 }]);
    expect(messages(s)).toContain(
      'Terraform\'s "Plan:" line reports "2 to bounce", which this tool does not model. The number is shown as Terraform printed it and is not part of the tiles above.',
    );
  });
});

describe('summarizePlan — terraform show -json', () => {
  it('maps every actions array, replace_paths and action_reason', () => {
    const s = summarizePlan(JSON_PLAN);
    expect(s.ok).toBe(true);
    expect(s.format).toBe('json');
    expect(s.versions).toEqual({
      product: 'Terraform',
      version: '1.9.5',
      formatVersion: '1.2',
    });

    const rds = byAddress(s, 'module.data.aws_db_instance.primary');
    expect(rds.action).toBe('replace');
    expect(rds.replaceOrder).toBe('destroy-create');
    expect(rds.replaceReasons).toEqual(['engine_version', 'root_block_device[0].volume_type']);
    expect(rds.sensitive).toBe(true);
    expect(rds.provider).toBe('registry.terraform.io/hashicorp/aws');
    expect(rds.actionReason).toBe(
      'an attribute that cannot be updated in place changed, so the resource must be replaced',
    );

    const bastion = byAddress(s, 'aws_instance.bastion');
    expect(bastion.action).toBe('replace');
    expect(bastion.replaceOrder).toBe('create-destroy');
    expect(bastion.tainted).toBe(true);

    expect(byAddress(s, 'data.aws_ami.ubuntu').action).toBe('read');
    expect(byAddress(s, 'aws_instance.new')).toMatchObject({
      action: 'move',
      movedFrom: 'aws_instance.old',
    });
    expect(byAddress(s, 'aws_s3_bucket.legacy')).toMatchObject({
      action: 'import',
      imported: true,
    });
    expect(byAddress(s, 'module.network.aws_subnet.private[2]')).toMatchObject({
      action: 'delete',
      index: '2',
      moduleChain: ['network'],
      actionReason: 'the resource block is no longer in the configuration',
    });

    expect(s.counts).toEqual({
      create: 1,
      update: 0,
      destroy: 1,
      replace: 2,
      read: 1,
      import: 1,
      move: 1,
      forget: 0,
      noop: 0,
    });
    expect(s.totals).toEqual({ add: 3, change: 0, destroy: 3, import: 1, forget: 0 });
  });

  it('reads output_changes, resource_drift and the sensitivity flag', () => {
    const s = summarizePlan(JSON_PLAN);
    expect(s.outputChanges).toEqual([
      { name: 'api_url', action: 'create', sensitive: false },
      { name: 'db_password', action: 'update', sensitive: true },
    ]);
    expect(s.driftCount).toBe(1);
    expect(s.drift[0].address).toBe('aws_security_group.web');
  });

  it('states plainly that JSON has no "Plan:" line to reconcile against', () => {
    const s = summarizePlan(JSON_PLAN);
    expect(s.reconciliation.status).toBe('absent');
    expect(s.reconciliation.message).toBe(MSG.absentJson);
    expect(s.summaryLine).toBeNull();
  });

  it('[C17] accepts format_version 0.1 through 1.x and warns on an unknown major', () => {
    for (const version of ['0.1', '0.2', '1.0', '1.1', '1.2']) {
      const s = summarizePlan(
        JSON.stringify({ format_version: version, resource_changes: [], output_changes: {} }),
      );
      expect(s.ok, version).toBe(true);
      expect(s.versions.formatVersion, version).toBe(version);
      expect(messages(s), version).not.toContainEqual(expect.stringContaining('Unknown plan JSON'));
    }
    const future = summarizePlan(
      JSON.stringify({ format_version: '2.0', resource_changes: [], output_changes: {} }),
    );
    expect(future.ok).toBe(true);
    expect(messages(future)).toContain(MSG.unknownFormatVersion);
    expect(
      future.diagnostics.find((d) => d.message === MSG.unknownFormatVersion)?.severity,
    ).toBe('warning');
  });

  it('names an actions array it does not model instead of guessing', () => {
    const s = summarizePlan(
      JSON.stringify({
        format_version: '1.2',
        resource_changes: [
          {
            address: 'aws_instance.web',
            type: 'aws_instance',
            name: 'web',
            mode: 'managed',
            change: { actions: ['bounce'] },
          },
        ],
      }),
    );
    expect(s.changes[0].action).toBe('no-op');
    expect(messages(s)).toContain(
      'Resource "aws_instance.web" has an actions array this tool does not model: ["bounce"]. It is counted as no-op.',
    );
  });

  it('reads a "forget" action without folding it into destroy', () => {
    const s = summarizePlan(
      JSON.stringify({
        format_version: '1.2',
        resource_changes: [
          {
            address: 'aws_s3_bucket.keepme',
            type: 'aws_s3_bucket',
            name: 'keepme',
            mode: 'managed',
            change: { actions: ['forget'] },
          },
        ],
      }),
    );
    expect(s.changes[0].action).toBe('forget');
    expect(s.counts.forget).toBe(1);
    expect(s.totals).toEqual({ add: 0, change: 0, destroy: 0, import: 0, forget: 1 });
    expect(s.highRisk).toEqual([]);
  });

  it('survives resource_changes entries that are not objects', () => {
    const s = summarizePlan(
      JSON.stringify({
        format_version: '1.2',
        resource_changes: [null, 42, 'nope', { address: 'aws_iam_role.a', change: {} }],
      }),
    );
    expect(s.ok).toBe(true);
    expect(s.changes.map((c) => c.address)).toEqual(['aws_iam_role.a']);
    expect(messages(s)).toContain(
      '3 entries in "resource_changes" were not objects and could not be read.',
    );
  });

  it('reports a non-array resource_changes rather than pretending it read it', () => {
    const s = summarizePlan('{"format_version":"1.2","resource_changes":{"a":1}}');
    expect(s.ok).toBe(false);
    expect(messages(s)).toContain(
      'The JSON has a "resource_changes" key, but it is not an array, so no resource actions could be read.',
    );
  });
});

describe('blast radius', () => {
  it('flags destructive actions only, never a create', () => {
    expect(classifyRisk('aws_db_instance', 'create')).toBeNull();
    expect(classifyRisk('aws_db_instance', 'update')).toBeNull();
    expect(classifyRisk('aws_db_instance', 'read')).toBeNull();
    expect(classifyRisk('aws_db_instance', 'delete')?.klass).toBe('data-store');
    expect(classifyRisk('aws_db_instance', 'replace')?.klass).toBe('data-store');
  });

  it('covers every exact, prefix and suffix pattern in the table', () => {
    const cases: [string, string][] = [
      ['aws_db_instance', 'data-store'],
      ['aws_rds_cluster', 'data-store'],
      ['aws_dynamodb_table', 'data-store'],
      ['aws_elasticache_replication_group', 'data-store'],
      ['aws_instance', 'data-store'],
      ['aws_ebs_volume', 'data-store'],
      ['aws_efs_file_system', 'data-store'],
      ['aws_s3_bucket', 'data-store'],
      ['aws_msk_cluster', 'data-store'],
      ['aws_opensearch_domain', 'data-store'],
      ['google_sql_database_instance', 'data-store'],
      ['azurerm_mssql_database', 'data-store'],
      ['aws_eks_cluster', 'control-plane'],
      ['google_container_cluster', 'control-plane'],
      ['azurerm_kubernetes_cluster', 'control-plane'],
      ['aws_nat_gateway', 'egress-path'],
      ['google_compute_router_nat_gateway', 'egress-path'],
      ['aws_kms_key', 'crypto-key'],
    ];
    for (const [type, klass] of cases) {
      const verdict = classifyRisk(type, 'delete');
      expect(verdict, type).not.toBeNull();
      expect(verdict!.klass, type).toBe(klass);
      expect(verdict!.reason.length, type).toBeGreaterThan(40);
      expect(verdict!.reason, type).toContain(type);
    }
  });

  it('leaves an ordinary resource type unflagged', () => {
    for (const type of ['aws_iam_role', 'aws_cloudwatch_log_group', 'null_resource', '']) {
      expect(classifyRisk(type, 'delete'), type).toBeNull();
    }
  });

  it('exposes an auditable pattern table rather than hiding the rules', () => {
    expect(RISK_PATTERNS.length).toBeGreaterThanOrEqual(15);
    for (const rule of RISK_PATTERNS) {
      expect(rule.pattern.length).toBeGreaterThan(0);
      expect(['data-store', 'egress-path', 'control-plane', 'crypto-key']).toContain(rule.klass);
    }
  });
});

describe('Terraform accounting: a replacement is +1 add AND +1 destroy', () => {
  it('matches Terraform\'s own line without double-counting in the tiles', () => {
    const s = summarizePlan(TEXT_RDS_REPLACE);
    // Tiles: one replacement, zero outright creates, zero outright destroys.
    expect(s.counts.replace).toBe(1);
    expect(s.counts.create).toBe(0);
    expect(s.counts.destroy).toBe(0);
    // Terraform's accounting: the same replacement is an add AND a destroy.
    expect(s.totals.add).toBe(1);
    expect(s.totals.destroy).toBe(1);
    expect(s.reconciliation.status).toBe('match');
  });
});

describe('toMarkdown', () => {
  it('produces a PR-comment-shaped report carrying the exact counts', () => {
    const md = toMarkdown(summarizePlan(TEXT_RDS_REPLACE));
    expect(md).toContain('**Terraform plan summary**');
    expect(md).toContain('| ± replace | 1 |');
    expect(md).toContain('module.data.aws_db_instance.primary');
    expect(md).toContain('forces replacement: engine_version');
    // Terraform's accounting, spelled out — and no `0 to import` padding.
    expect(md).toContain(
      'Terraform counts each replacement once as an add and once as a destroy: 1 to add, 0 to change, 1 to destroy.',
    );
    expect(md).not.toContain('0 to import');
    expect(md).toContain('Plan: 1 to add, 0 to change, 1 to destroy.');
    expect(md).toContain('opscanopy.com/terraform-plan-summarizer/');
  });

  it('says so when there is nothing to do', () => {
    expect(toMarkdown(summarizePlan(TEXT_NO_CHANGES))).toContain('No changes.');
  });

  it('never throws, whatever the summary', () => {
    for (const input of ['', '{', TEXT_TRUNCATED_NO_PLAN, JSON_PLAN, TEXT_OUTPUTS_ONLY]) {
      expect(() => toMarkdown(summarizePlan(input))).not.toThrow();
    }
  });
});

describe('examples', () => {
  it('ships six chips whose ids and labels are unique', () => {
    expect(examples).toHaveLength(6);
    expect(new Set(examples.map((e) => e.id)).size).toBe(6);
    expect(new Set(examples.map((e) => e.label)).size).toBe(6);
  });

  it('every chip parses, and each one demonstrates its own point', () => {
    const summaries = examples.map((e) => summarizePlan(e.input));
    for (const [i, s] of summaries.entries()) {
      expect(s.ok, examples[i].label).toBe(true);
    }
    // Chip 1 is the boot seed: a clean, reconciling everyday plan.
    expect(summaries[0].reconciliation.status).toBe('match');
    expect(summaries[0].highRisk).toEqual([]);
    // Chip 2: an RDS replacement blamed on engine_version.
    expect(summaries[1].highRisk.length).toBeGreaterThan(0);
    expect(summaries[1].changes.some((c) => c.replaceReasons.includes('engine_version'))).toBe(
      true,
    );
    // Chip 3: a module teardown that takes a NAT gateway with it.
    expect(summaries[2].highRisk.some((c) => c.risk?.klass === 'egress-path')).toBe(true);
    // Chip 4: the JSON format.
    expect(summaries[3].format).toBe('json');
    // Chip 5: "No changes."
    expect(summaries[4].noChanges).toBe(true);
    // Chip 6: a truncated CI paste — the reconciliation warning is the point.
    expect(summaries[5].reconciliation.status).toBe('mismatch');
  });

  it('chip 6 really does carry ANSI escapes and CRLF line endings', () => {
    expect(examples[5].input).toMatch(/\u001b\[/);
    expect(examples[5].input).toContain('\r\n');
  });
});

describe('never throws — hostile input', () => {
  const hostile: [string, string][] = [
    ['empty', ''],
    ['whitespace', '   \n\t\r\n '],
    ['NUL and control bytes', 'Plan: \u0000\u0001\u0007 to add\n'],
    ['lone high surrogate', '\uD800# aws_instance.a will be created\n'],
    ['unterminated JSON', '{"format_version":"1.2","resource_changes":['],
    ['JSON array at top level', '[1,2,3]'],
    ['JSON null', 'null'],
    ['JSON true', 'true'],
    ['bare number', '42'],
    ['HTML', '<html><body><script>alert(1)</script></body></html>'],
    ['a diff', '--- a/main.tf\n+++ b/main.tf\n@@ -1 +1 @@\n-a\n+b\n'],
    ['only a Plan line', 'Plan: 4 to add, 0 to change, 0 to destroy.\n'],
    ['only the symbols legend', '  + create\n  ~ update in-place\n  - destroy\n'],
    ['a header comment with no verb', '  # aws_instance.web\n'],
    ['an unterminated resource block', '  # a.b will be created\n  + resource "a" "b" {\n'],
    ['ANSI only', '\u001b[1m\u001b[0m\u001b[31m\u001b[0m'],
    ['every symbol, no addresses', '-/+ +/- <= ~ + -\n'],
    ['a 1 MB single line', `# ${'x'.repeat(1_000_000)} will be created`],
    ['deeply nested JSON', `${'['.repeat(20_000)}${']'.repeat(20_000)}`],
    ['unbalanced brackets in an address', '  # module.a["x.aws_instance.b will be created\n'],
    ['CRLF-only file', '\r\n\r\n\r\n'],
    ['a giant Plan number', 'Plan: 99999999999999999999 to add, 0 to change, 0 to destroy.\n'],
  ];

  for (const [label, input] of hostile) {
    it(`survives ${label}`, () => {
      let summary: PlanSummary | undefined;
      expect(() => {
        summary = summarizePlan(input);
      }).not.toThrow();
      expect(summary).toBeDefined();
      expect(typeof summary!.ok).toBe('boolean');
      expect(Array.isArray(summary!.changes)).toBe(true);
      expect(Array.isArray(summary!.diagnostics)).toBe(true);
      expect(summary!.diagnostics.length).toBeGreaterThan(0);
      expect(() => toMarkdown(summary!)).not.toThrow();
    });
  }

  it('names the failure for each specific kind of not-a-plan input', () => {
    expect(messages(summarizePlan(''))).toContain(MSG.empty);
    expect(messages(summarizePlan('{"format_version":"1.0","values":{}}'))).toContain(
      MSG.stateJson,
    );
    expect(messages(summarizePlan('{"valid":true,"diagnostics":[]}'))).toContain(MSG.validateJson);
    expect(messages(summarizePlan('{"hello":"world"}'))).toContain(MSG.otherJson);
    expect(messages(summarizePlan('{"format_version":"1.2","resource_changes":['))).toContain(
      MSG.badJson,
    );
    expect(messages(summarizePlan('a totally unrelated log line'))).toContain(MSG.notAPlan);
    for (const bad of ['', '{"hello":"world"}', 'a totally unrelated log line']) {
      expect(summarizePlan(bad).ok, bad).toBe(false);
    }
  });

  it('is linear enough for a 50,000-line plan', () => {
    const block = `  # module.big.aws_instance.node[IDX] will be created
  + resource "aws_instance" "node" {
      + ami = (known after apply)
      + id  = (known after apply)
    }

`;
    let plan = 'Terraform will perform the following actions:\n\n';
    for (let i = 0; i < 8_000; i += 1) plan += block.replace('IDX', String(i));
    plan += 'Plan: 8000 to add, 0 to change, 0 to destroy.\n';
    expect(plan.split('\n').length).toBeGreaterThan(48_000);

    const started = Date.now();
    const s = summarizePlan(plan, { maxChanges: 20_000 });
    const elapsed = Date.now() - started;
    expect(s.changes).toHaveLength(8_000);
    expect(s.reconciliation.status).toBe('match');
    expect(elapsed, `parsed 48k lines in ${elapsed}ms`).toBeLessThan(5_000);
  });

  it('caps the parsed change list and says the list is incomplete', () => {
    let plan = 'Terraform will perform the following actions:\n\n';
    for (let i = 0; i < 40; i += 1) {
      plan += `  # aws_iam_role.r${i} will be created\n  + resource "aws_iam_role" "r${i}" {\n      + name = "r${i}"\n    }\n\n`;
    }
    plan += 'Plan: 40 to add, 0 to change, 0 to destroy.\n';
    const s = summarizePlan(plan, { maxChanges: 10 });
    expect(s.changes).toHaveLength(10);
    expect(s.limits.changesTruncated).toBe(true);
    expect(messages(s)).toContain(
      'Stopped after 10 resource changes; the paste contains more. The list below is incomplete, so Terraform\'s "Plan:" line is the authority.',
    );
    // And the reconciliation must not pretend the truncated list adds up.
    expect(s.reconciliation.status).toBe('mismatch');
  });

  it('caps the input at 2 MiB and reports the exact number of characters dropped', () => {
    const cap = 2 * 1024 * 1024;
    const filler = `${'#'.repeat(79)}\n`;
    let plan = TEXT_MIXED;
    while (plan.length < cap + 500) plan += filler;
    const dropped = plan.length - cap;
    const s = summarizePlan(plan);
    expect(s.limits.inputTruncated).toBe(true);
    expect(s.limits.inputChars).toBe(plan.length);
    expect(s.limits.readChars).toBe(cap);
    expect(messages(s)).toContain(
      `Input is longer than the 2,097,152-character (2 MiB) cap, so ${dropped.toLocaleString('en-US')} characters at the end were not read. Every count below covers only the part that was read.`,
    );
  });

  it('caps the diagnostics list', () => {
    // 60 non-object entries produce one diagnostic; force many by mixing in
    // unmodelled action arrays, one diagnostic each.
    const changes = Array.from({ length: 60 }, (_, i) => ({
      address: `aws_instance.n${i}`,
      type: 'aws_instance',
      name: `n${i}`,
      mode: 'managed',
      change: { actions: ['bounce'] },
    }));
    const s = summarizePlan(JSON.stringify({ format_version: '1.2', resource_changes: changes }), {
      maxDiagnostics: 12,
    });
    expect(s.diagnostics).toHaveLength(12);
    expect(s.limits.diagnosticsTruncated).toBe(true);
    expect(messages(s)).toContain('Showing the first 11 findings; more were suppressed.');
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* Regressions — bugs found in adversarial review before the first deploy      */
/* ────────────────────────────────────────────────────────────────────────── */

describe('regression: replace_triggered_by', () => {
  /**
   * Terraform 1.2+ prints `will be replaced due to changes in
   * replace_triggered_by` for a replacement driven by a `lifecycle`
   * `replace_triggered_by` list. The verb was missing from the VERBS table, so
   * the whole resource block was dropped: a plan that destroys and recreates a
   * production database rendered add 0 / change 0 / destroy 0 / replace 0, no
   * blast-radius band at all, and a note telling the reader their COMPLETE paste
   * was truncated. A false "all clear" on a database replacement.
   */
  const PLAN = `Terraform used the selected providers to generate the following execution
plan. Resource actions are indicated with the following symbols:
-/+ destroy and then create replacement

Terraform will perform the following actions:

  # aws_db_instance.primary will be replaced due to changes in replace_triggered_by
-/+ resource "aws_db_instance" "primary" {
      ~ address        = "primary.abc.rds.amazonaws.com" -> (known after apply)
        instance_class = "db.r6g.xlarge"
    }

Plan: 1 to add, 0 to change, 1 to destroy.
`;

  it('reads the resource, counts it as a replacement and reconciles', () => {
    const s = summarizePlan(PLAN);
    expect(s.ok).toBe(true);
    expect(s.changes.map((c) => c.address)).toEqual(['aws_db_instance.primary']);
    expect(s.changes[0].action).toBe('replace');
    expect(s.changes[0].replaceOrder).toBe('destroy-create');
    expect(s.counts.replace).toBe(1);
    expect(s.totals).toEqual({ add: 1, change: 0, destroy: 1, import: 0, forget: 0 });
    // Before the fix this was a mismatch and the tool blamed a truncated paste
    // that was in fact complete.
    expect(s.reconciliation.status).toBe('match');
    expect(messages(s)).not.toContainEqual(
      expect.stringContaining('the rest of the plan is missing'),
    );
  });

  it('flags the database in the high-blast-radius band', () => {
    const s = summarizePlan(PLAN);
    expect(s.highRisk.map((c) => c.address)).toEqual(['aws_db_instance.primary']);
    expect(s.highRisk[0].risk?.klass).toBe('data-store');
  });

  it('recognises a paste made only of replace_triggered_by blocks as plan text', () => {
    const header =
      '  # terraform_data.example2 will be replaced due to changes in replace_triggered_by\n';
    expect(detectInput(header).kind).toBe('plan-text');
  });

  it('does not disturb the other replacement verbs', () => {
    const cases: [string, boolean][] = [
      ['# aws_instance.a is tainted, so must be replaced', true],
      ['# aws_instance.b will be replaced, as requested', false],
      ['# aws_instance.c must be replaced', false],
    ];
    for (const [header, tainted] of cases) {
      const s = summarizePlan(`Terraform will perform the following actions:\n\n  ${header}\n`);
      expect(s.changes, header).toHaveLength(1);
      expect(s.changes[0].action, header).toBe('replace');
      expect(s.changes[0].tainted, header).toBe(tainted);
    }
  });

  it('renders the matching JSON action_reason as a sentence, not a bare enum', () => {
    const s = summarizePlan(
      JSON.stringify({
        format_version: '1.2',
        resource_changes: [
          {
            address: 'terraform_data.example2',
            mode: 'managed',
            type: 'terraform_data',
            name: 'example2',
            change: { actions: ['delete', 'create'] },
            action_reason: 'replace_by_triggers',
          },
        ],
      }),
    );
    expect(s.changes[0].actionReason).toBe(
      'something in its lifecycle replace_triggered_by list changed, so Terraform must replace it',
    );
  });
});

describe('regression: `show -json` lists unchanged resources too', () => {
  /**
   * `resource_changes` is "an array of all resources declared by the root and
   * child modules", so an untouched resource is present with
   * `actions: ["no-op"]` — and `output_changes` carries every root output the
   * same way. Counting those as actions made a plan with 2 real updates announce
   * "482 actions" in the live region, render 480 rows of unchanged resources
   * under "Reads, imports, moves and forgets", and list 8 unchanged outputs as
   * output changes. A plan that does nothing at all never got the "Terraform
   * found nothing to do" verdict.
   */
  function doc(
    quietResources: number,
    updates: number,
    quietOutputs: number,
    changedOutputs: number,
  ): string {
    const resourceChanges = [
      ...Array.from({ length: quietResources }, (_, i) => ({
        address: `aws_iam_role.r${i}`,
        mode: 'managed',
        type: 'aws_iam_role',
        name: `r${i}`,
        change: { actions: ['no-op'] },
      })),
      ...Array.from({ length: updates }, (_, i) => ({
        address: `aws_ecs_service.s${i}`,
        mode: 'managed',
        type: 'aws_ecs_service',
        name: `s${i}`,
        change: { actions: ['update'] },
      })),
    ];
    const outputChanges: Record<string, unknown> = {};
    for (let i = 0; i < quietOutputs; i += 1) outputChanges[`quiet${i}`] = { actions: ['no-op'] };
    for (let i = 0; i < changedOutputs; i += 1) outputChanges[`loud${i}`] = { actions: ['update'] };
    return JSON.stringify({
      format_version: '1.2',
      resource_changes: resourceChanges,
      output_changes: outputChanges,
    });
  }

  it('counts only the real actions and names the unchanged entries', () => {
    const s = summarizePlan(doc(480, 2, 8, 1));
    expect(s.stats.changes).toBe(2);
    expect(s.changes.map((c) => c.address)).toEqual(['aws_ecs_service.s0', 'aws_ecs_service.s1']);
    expect(s.counts.update).toBe(2);
    expect(s.counts.noop).toBe(0);
    expect(s.outputChanges).toEqual([{ name: 'loud0', action: 'update', sensitive: false }]);
    expect(s.stats.unchanged).toBe(488);
    expect(messages(s)).toContain(
      '"terraform show -json" lists everything the configuration declares, not only what changes: ' +
        '480 resources and 8 outputs in this document are unchanged ("no-op"). Unchanged entries ' +
        'are not actions, so they are not counted or listed here.',
    );
    expect(s.noChanges).toBe(false);
  });

  it('gives a plan of nothing but no-ops the "No changes" verdict', () => {
    const s = summarizePlan(doc(40, 0, 0, 0));
    expect(s.ok).toBe(true);
    expect(s.noChanges).toBe(true);
    expect(s.changes).toHaveLength(0);
    expect(s.stats.changes).toBe(0);
    expect(s.stats.unchanged).toBe(40);
    expect(s.totals).toEqual({ add: 0, change: 0, destroy: 0, import: 0, forget: 0 });
    expect(toMarkdown(s)).toContain('No changes. Terraform found nothing to do.');
  });

  it('uses the singular form for one unchanged resource', () => {
    const s = summarizePlan(doc(1, 1, 0, 0));
    expect(messages(s)).toContain(
      '"terraform show -json" lists everything the configuration declares, not only what changes: ' +
        '1 resource in this document is unchanged ("no-op"). Unchanged entries are not actions, so ' +
        'they are not counted or listed here.',
    );
  });

  it('says nothing about unchanged entries when there are none', () => {
    const s = summarizePlan(doc(0, 3, 0, 1));
    expect(s.stats.unchanged).toBe(0);
    expect(messages(s)).not.toContainEqual(expect.stringContaining('are unchanged ("no-op")'));
  });

  /**
   * The narrowing must not silence the case the design relies on: an actions
   * array this tool cannot model is ALSO mapped down to `no-op`, and dropping it
   * would report "nothing to do" for a plan that does something unknown.
   */
  it('keeps an unmodelled actions array visible instead of calling it unchanged', () => {
    const s = summarizePlan(
      JSON.stringify({
        format_version: '1.2',
        resource_changes: [
          {
            address: 'aws_instance.web',
            mode: 'managed',
            type: 'aws_instance',
            name: 'web',
            change: { actions: ['bounce'] },
          },
        ],
      }),
    );
    expect(s.noChanges).toBe(false);
    expect(s.stats.unchanged).toBe(0);
    expect(s.changes).toHaveLength(1);
    expect(s.changes[0].action).toBe('no-op');
    expect(s.counts.noop).toBe(1);
    expect(messages(s)).toContain(
      'Resource "aws_instance.web" has an actions array this tool does not model: ["bounce"]. It is counted as no-op.',
    );
  });

  /** A `["no-op"]` carrying `importing` or `previous_address` IS an action. */
  it('keeps no-op imports and moves, which Terraform encodes the same way', () => {
    const s = summarizePlan(
      JSON.stringify({
        format_version: '1.2',
        resource_changes: [
          {
            address: 'aws_s3_bucket.legacy',
            mode: 'managed',
            type: 'aws_s3_bucket',
            name: 'legacy',
            change: { actions: ['no-op'], importing: { id: 'acme-legacy-assets' } },
          },
          {
            address: 'aws_instance.new',
            previous_address: 'aws_instance.old',
            mode: 'managed',
            type: 'aws_instance',
            name: 'new',
            change: { actions: ['no-op'] },
          },
          {
            address: 'aws_iam_role.quiet',
            mode: 'managed',
            type: 'aws_iam_role',
            name: 'quiet',
            change: { actions: ['no-op'] },
          },
        ],
      }),
    );
    expect(s.changes.map((c) => c.action)).toEqual(['import', 'move']);
    expect(s.stats.unchanged).toBe(1);
    expect(s.noChanges).toBe(false);
  });

  /** Text transcripts print no block for an unchanged resource — always 0. */
  it('never reports unchanged entries for text input', () => {
    expect(summarizePlan(TEXT_MIXED).stats.unchanged).toBe(0);
  });
});

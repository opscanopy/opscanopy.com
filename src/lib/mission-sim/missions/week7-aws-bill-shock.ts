/**
 * Mission — Week 7: "AWS Bill Shock" (a cloud cost-hygiene remediation, config-only).
 *
 * Day 49. Finance forwarded the monthly AWS invoice with three question marks:
 * the bill tripled overnight. Nothing is on fire — every prod box is tiny and
 * healthy — but a forgotten `p3.2xlarge` GPU instance (tag Name=ml-experiment-
 * DELETEME) from a since-abandoned experiment has been running 26 days straight
 * and now owns ~88% of the EC2 spend. Find it, prove it, terminate it before
 * finance calls back.
 *
 * Orient (ls) → read the cost export to see WHAT is burning money (grep
 * p3.2xlarge) → pin down the exact instance id (grep DELETEME instances.txt) →
 * optionally corroborate with `aws ec2 describe-instances` → FIX with
 * `aws ec2 terminate-instances --instance-ids i-0abc123def`.
 *
 * Config-only proof: `aws` is a purely scripted verb (cost-explorer /
 * describe / terminate / sts are all authored responses, zero engine domain
 * logic). The terminate response carries the ONLY effect — setFlags(billFixed)
 * + an APPEND to the cost report (evidence-preserving) + an overwrite of a
 * separate status file. The read/orient objectives run on read-only verbs and
 * complete in ANY order; the remediation objective is gated state-based on
 * flagSet('billFixed'), so a fix-first player can still gather the evidence.
 *
 * NOTE: dormant — deliberately NOT registered in the live mission registry.
 */
import type { MissionConfig } from '../types';

const costReport = [
  'service,usage_type,tag_name,region,usage_hours,cost_usd',
  'EC2,p3.2xlarge,ml-experiment-DELETEME,us-east-1,624,5910.00',
  'EC2,t3.small,api-prod,us-east-1,720,15.20',
  'EC2,t3.small,web-prod,us-east-1,720,15.20',
  'EC2,t3.micro,worker-prod,us-east-1,720,7.60',
  'EBS,gp3 volumes,,us-east-1,-,61.40',
  'S3,standard storage,,us-east-1,-,12.10',
  '--- MONTH-OVER-MONTH -------------------------------------------------',
  'Total EC2 this month: $5,948   (last month: $1,906)   +212%',
  'Single biggest line: p3.2xlarge GPU box — $5,900 / ~88% of the EC2 bill',
].join('\n');

const instances = [
  'INSTANCE ID    TYPE         STATE     UPTIME  NAME',
  'i-0prod01      t3.small     running   142d    api-prod',
  'i-0prod02      t3.small     running   142d    web-prod',
  'i-0prod03      t3.micro     running   142d    worker-prod',
  'i-0abc123def   p3.2xlarge   running   26d     ml-experiment-DELETEME',
].join('\n');

const notes = [
  'ops-jump-01 house rules — the account owners left these:',
  '',
  '- This box has read/write AWS creds for the prod account. Tread carefully.',
  '- Monthly cost export is dumped to ~/aws/cost-report.csv. Read it FIRST.',
  '- A running snapshot is in ~/aws/instances.txt. `aws ec2 describe-instances`',
  '  is live if you want to corroborate before you terminate anything.',
  '- Rule of the house: anything tagged DELETEME was meant to be gone yesterday.',
  '',
  '— the platform team',
].join('\n');

export const week7AwsBillShock: MissionConfig = {
  id: 'week7-aws-bill-shock',
  title: 'AWS Bill Shock',
  week: 7,
  unlockAfterDay: 49,
  promptUser: 'student',
  promptHost: 'ops-jump-01',
  optimalCommands: 5,

  story: [
    '09:40 AM. Not a page — an email from finance with the subject line ' +
      '"WHY IS THE AWS BILL 3x?!". The invoice tripled month-over-month and the ' +
      'CFO wants an answer before the 10:00 sync. Nothing is down; something is just ' +
      'quietly burning money.',
    'You SSH into ops-jump-01, the account jump box. Every production instance here ' +
      'is a tiny t3 that has been humming along for months — so the spike is one new, ' +
      'expensive thing that nobody switched off.',
    'Read the cost export, find the line item that dwarfs everything, confirm the exact ' +
      'instance, and terminate it. Type `help` to see what this terminal can do.',
  ],

  filesystem: {
    '~': {
      aws: {
        'cost-report.csv': costReport,
        'instances.txt': instances,
      },
      'notes.txt': notes,
    },
  },

  // A calm, healthy box: the crisis is money, not availability.
  processes: [
    { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, command: 'systemd' },
    { pid: 620, user: 'root', cpu: 0.0, mem: 0.2, command: 'sshd' },
    { pid: 5000, user: 'student', cpu: 0.0, mem: 0.3, command: 'bash' },
  ],

  supportedCommands: [
    'pwd', 'ls', 'cd', 'cat', 'grep', 'ps', 'aws', 'help', 'hint', 'clear',
  ],

  // Initial state flags. Terminating the runaway box flips billFixed → true.
  flags: { billFixed: false },

  // ── Config-authored verbs (zero domain logic in the engine) ──────────────
  commands: {
    aws: {
      oneLiner: 'AWS CLI (aws ce …, aws ec2 describe/terminate, aws sts …)',
      responses: [
        // ── Diagnostics: pure read, no effect, safe to run in any order ──────
        {
          match: { args: ['ce', 'get-cost-and-usage'] },
          output: [
            'GroupBy=SERVICE  Granularity=MONTHLY  (this month vs last)',
            'EC2-Instances       $5,948.00   (prev $1,906.00)   +212%',
            'EBS                 $61.40',
            'S3                  $12.10',
            'CloudWatch          $4.00',
            '=> EC2 tripled the bill. One line item dominates — inspect your instances.',
          ],
        },
        {
          match: { args: ['ec2', 'describe-instances'] },
          output: [
            'i-0prod01     t3.small     running   api-prod',
            'i-0prod02     t3.small     running   web-prod',
            'i-0prod03     t3.micro     running   worker-prod',
            'i-0abc123def  p3.2xlarge   running   ml-experiment-DELETEME   (26d, GPU, no owner)',
          ],
        },
        {
          match: { args: ['sts', 'get-caller-identity'] },
          output: [
            '{',
            '  "UserId": "AIDAEXAMPLEJUMPADMIN",',
            '  "Account": "334455667788",',
            '  "Arn": "arn:aws:iam::334455667788:user/ops-jump-admin"',
            '}',
            'This is the prod account — terminate with care. That GPU box has no business here.',
          ],
        },

        // ── Idempotent + honest: once terminated, say so and change nothing ──
        {
          match: { flag: { name: 'billFixed' } },
          output: [
            'i-0abc123def already terminated — projected spend is back to baseline. Nothing more to do.',
          ],
        },

        // ── THE FIX: terminate the runaway p3.2xlarge by its exact id ────────
        {
          match: { args: ['ec2', 'terminate-instances'], argIncludes: 'i-0abc123def' },
          output: [
            'Terminating i-0abc123def (p3.2xlarge). shutting-down -> terminated.',
            'Projected monthly spend -$5,900. The bill is back to baseline.',
          ],
          outKind: 'sys',
          effect: {
            setFlags: { billFixed: true },
            // append-only: preserves the "p3.2xlarge" spike evidence in the report
            appendFiles: {
              '~/aws/cost-report.csv':
                'EC2,p3.2xlarge,ml-experiment-DELETEME TERMINATED — projection back to baseline,us-east-1,624,0.00',
            },
            // overwrite the human-readable status marker (not read as evidence)
            writeFiles: { '~/aws/status': 'OK — spend normal (runaway p3.2xlarge terminated)' },
          },
        },
      ],
      default: {
        output: [
          'usage: aws ce get-cost-and-usage',
          '       aws ec2 describe-instances',
          '       aws ec2 terminate-instances --instance-ids <id>',
          '       aws sts get-caller-identity',
        ],
      },
    },
  },

  objectives: [
    {
      id: 1,
      text: 'Look around',
      trigger: { cmd: 'ls', when: 'always' },
      successLine: 'One aws/ directory. On a cost fire, the exported report is the whole story.',
    },
    {
      id: 2,
      text: 'Find what is burning money',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'p3.2xlarge' } },
      successLine: 'There it is — a single p3.2xlarge GPU box is ~88% of the EC2 bill.',
    },
    {
      id: 3,
      text: 'Pin down the exact instance',
      trigger: { cmd: ['cat', 'grep'], when: { outputMatched: 'i-0abc123def' } },
      successLine: 'Nailed it — instance i-0abc123def, tagged ml-experiment-DELETEME, up 26 days.',
    },
    {
      id: 4,
      text: 'Terminate the runaway instance',
      trigger: { cmd: 'aws', when: { flagSet: 'billFixed' } },
      successLine: 'Terminated. Projected spend is back to baseline — crisis over.',
    },
  ],

  hints: [
    'Start with `ls`. The cost export finance is screaming about is in ~/aws.',
    'Read the report — `grep p3.2xlarge ~/aws/cost-report.csv`. One GPU box dwarfs every prod instance.',
    'Get the exact instance id: `grep DELETEME ~/aws/instances.txt` (or corroborate with `aws ec2 describe-instances`).',
    'Kill it: `aws ec2 terminate-instances --instance-ids i-0abc123def`.',
  ],
};

export default week7AwsBillShock;

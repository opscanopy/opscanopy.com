/**
 * json-parser.ts — read `terraform show -json <planfile>`.
 *
 * Unlike the text transcript, this IS a documented, versioned format
 * (`format_version` 0.1 → 1.2 across Terraform 0.12 → 1.9, and OpenTofu tracks
 * it). So it needs no reconciliation safety net; what it needs is honesty about
 * the edges:
 *
 *   - an `actions` array this tool does not model is NAMED, not guessed at;
 *   - a `format_version` with an unknown MAJOR is a warning, because a renamed
 *     field would otherwise silently produce zeros;
 *   - entries that are not objects are counted and reported rather than skipped
 *     in silence.
 *
 * Every accessor below is defensive: the document came off a clipboard, so any
 * field can be missing, null, or the wrong type.
 */
import { parseAddress } from './text-parser';
import type {
  Diagnostic,
  OutputChange,
  PlanAction,
  ReplaceOrder,
  ResourceChange,
} from './types';

/** `action_reason` enum → a sentence a human can act on. */
const ACTION_REASONS: Record<string, string> = {
  replace_because_tainted: 'the resource is marked tainted, so Terraform must replace it',
  replace_because_cannot_update:
    'an attribute that cannot be updated in place changed, so the resource must be replaced',
  replace_by_request: 'you asked for the replacement with -replace=',
  // The JSON sibling of the text verb `will be replaced due to changes in
  // replace_triggered_by`. Without this entry the bare enum was printed where
  // its siblings print a sentence; an unknown key still falls back to the enum,
  // so this is additive only.
  replace_by_triggers:
    'something in its lifecycle replace_triggered_by list changed, so Terraform must replace it',
  delete_because_no_resource_config: 'the resource block is no longer in the configuration',
  delete_because_no_module: 'the module call is no longer in the configuration',
  delete_because_wrong_repetition:
    'count/for_each changed shape, so this instance key no longer exists',
  delete_because_count_index: 'the count index is outside the new count',
  delete_because_each_key: 'the for_each key is no longer in the map',
  delete_because_no_move_target: 'the moved-to address is not in the configuration',
  read_because_config_unknown:
    'the data source configuration depends on values not known until apply',
  read_because_dependency_pending:
    'it depends on a resource that does not exist yet, so it is read during apply',
  read_because_check_nested: 'it is nested inside a check block',
};

/** Replacement paths this tool renders per resource before the list is capped. */
const MAX_REPLACE_REASONS = 20;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** `[["root_block_device", 0, "volume_type"]]` → `root_block_device[0].volume_type`. */
function formatReplacePath(path: unknown): string | null {
  if (!Array.isArray(path)) return null;
  let out = '';
  for (const step of path) {
    if (typeof step === 'string') out += out.length === 0 ? step : `.${step}`;
    else if (typeof step === 'number' && Number.isInteger(step)) out += `[${step}]`;
    else if (typeof step === 'string' || typeof step === 'number') out += `[${String(step)}]`;
    else return out.length > 0 ? out : null;
  }
  return out.length > 0 ? out : null;
}

/** True when the plan marked anything on this resource sensitive. Best-effort. */
function hasSensitive(value: unknown): boolean {
  if (value === true) return true;
  if (Array.isArray(value)) return value.some(hasSensitive);
  if (isObject(value)) return Object.values(value).some(hasSensitive);
  return false;
}

interface ActionMapping {
  action: PlanAction;
  replaceOrder: ReplaceOrder | null;
}

function mapActions(actions: unknown): ActionMapping | null {
  if (!Array.isArray(actions)) return null;
  const list = actions.filter((a): a is string => typeof a === 'string');
  const key = list.join(',');
  switch (key) {
    case 'no-op':
      return { action: 'no-op', replaceOrder: null };
    case 'create':
      return { action: 'create', replaceOrder: null };
    case 'read':
      return { action: 'read', replaceOrder: null };
    case 'update':
      return { action: 'update', replaceOrder: null };
    case 'delete':
      return { action: 'delete', replaceOrder: null };
    case 'forget':
      return { action: 'forget', replaceOrder: null };
    case 'delete,create':
      return { action: 'replace', replaceOrder: 'destroy-create' };
    case 'create,delete':
      return { action: 'replace', replaceOrder: 'create-destroy' };
    default:
      return null;
  }
}

export interface JsonParseResult {
  changes: ResourceChange[];
  drift: ResourceChange[];
  outputChanges: OutputChange[];
  formatVersion: string | null;
  version: string | null;
  changesTruncated: boolean;
  diagnostics: Diagnostic[];
  /** False when `resource_changes` exists but is unusable. */
  usable: boolean;
  /** Genuinely unchanged (`["no-op"]`) resources, excluded from `changes`. */
  unchangedResources: number;
  /** Genuinely unchanged outputs, excluded from `outputChanges`. */
  unchangedOutputs: number;
}

/** One entry read out of `resource_changes` / `resource_drift`. */
interface ReadEntry {
  change: ResourceChange;
  /**
   * True only for a GENUINE `["no-op"]` that is not also an import or a move.
   * `mapActions` maps an actions array this tool cannot model down to `no-op`
   * too, and that one must stay visible — see the comment in `readList`.
   */
  unchanged: boolean;
}

function readOne(
  entry: Record<string, unknown>,
  diagnostics: Diagnostic[],
): ReadEntry {
  const address = str(entry.address) ?? '';
  const parsed = parseAddress(address);
  const change = isObject(entry.change) ? entry.change : {};
  const mapped = mapActions(change.actions);

  if (mapped === null) {
    const printed = Array.isArray(change.actions) ? JSON.stringify(change.actions) : 'null';
    diagnostics.push({
      severity: 'warning',
      message:
        `Resource "${address}" has an actions array this tool does not model: ${printed}. ` +
        'It is counted as no-op.',
    });
  }

  let action: PlanAction = mapped?.action ?? 'no-op';
  const imported = isObject(change.importing);
  const movedFrom = str(entry.previous_address);
  if (action === 'no-op' && imported) action = 'import';
  else if (action === 'no-op' && movedFrom !== null) action = 'move';

  const reasonKey = str(entry.action_reason);
  const tainted = reasonKey === 'replace_because_tainted';

  const paths = Array.isArray(change.replace_paths) ? change.replace_paths : [];
  const replaceReasons: string[] = [];
  let replaceReasonsTruncated = false;
  for (const path of paths) {
    if (replaceReasons.length >= MAX_REPLACE_REASONS) {
      replaceReasonsTruncated = true;
      break;
    }
    const formatted = formatReplacePath(path);
    if (formatted !== null && !replaceReasons.includes(formatted)) replaceReasons.push(formatted);
  }

  const mode = entry.mode === 'data' ? 'data' : parsed.mode;
  const indexRaw = entry.index;
  const index =
    typeof indexRaw === 'string'
      ? indexRaw
      : typeof indexRaw === 'number' && Number.isFinite(indexRaw)
        ? String(indexRaw)
        : parsed.index;

  const moduleAddress = str(entry.module_address);
  const moduleChain =
    moduleAddress !== null ? parseAddress(`${moduleAddress}.x.y`).moduleChain : parsed.moduleChain;

  return {
    change: {
      address,
      moduleChain,
      mode,
      type: str(entry.type) ?? parsed.type,
      name: str(entry.name) ?? parsed.name,
      index,
      provider: str(entry.provider_name),
      action,
      replaceOrder: mapped?.replaceOrder ?? null,
      replaceReasons,
      replaceReasonsTruncated,
      actionReason: reasonKey !== null ? (ACTION_REASONS[reasonKey] ?? reasonKey) : null,
      tainted,
      imported,
      movedFrom,
      sensitive: hasSensitive(change.before_sensitive) || hasSensitive(change.after_sensitive),
      risk: null,
    },
    unchanged: mapped?.action === 'no-op' && action === 'no-op',
  };
}

/**
 * `terraform show -json` lists EVERY resource declared by the root and child
 * modules, not only the ones that change — an untouched resource is present with
 * `change.actions: ["no-op"]`. (That is why HashiCorp publishes a support
 * article about filtering a JSON plan down to "only resource changes", and why
 * the community jq idiom is `select(.change.actions != ["no-op"])`.) Counting
 * those as actions made a plan with 2 real updates announce "482 actions", and
 * made a plan that does nothing at all render 40 rows instead of the
 * "Terraform found nothing to do" verdict. They are counted and named instead.
 */
function readList(
  raw: unknown,
  maxChanges: number,
  diagnostics: Diagnostic[],
): { list: ResourceChange[]; truncated: boolean; skipped: number; unchanged: number } {
  if (!Array.isArray(raw)) return { list: [], truncated: false, skipped: 0, unchanged: 0 };
  const list: ResourceChange[] = [];
  let skipped = 0;
  let unchanged = 0;
  let truncated = false;
  for (const entry of raw) {
    if (!isObject(entry)) {
      skipped += 1;
      continue;
    }
    if (list.length >= maxChanges) {
      truncated = true;
      break;
    }
    const read = readOne(entry, diagnostics);
    // An `actions` array this tool could not model is ALSO mapped down to
    // `no-op`, and it keeps its row plus its warning: only a genuine
    // `["no-op"]` is dropped here.
    if (read.unchanged) {
      unchanged += 1;
      continue;
    }
    list.push(read.change);
  }
  return { list, truncated, skipped, unchanged };
}

function readOutputs(raw: unknown): { list: OutputChange[]; unchanged: number } {
  if (!isObject(raw)) return { list: [], unchanged: 0 };
  const out: OutputChange[] = [];
  let unchanged = 0;
  for (const [name, value] of Object.entries(raw)) {
    if (!isObject(value)) continue;
    const mapped = mapActions(value.actions);
    // Same as `resource_changes`: `output_changes` carries every root output,
    // so an unchanged one arrives as `["no-op"]` and must not be listed as an
    // output change. An unmodelled actions array still gets a row.
    if (mapped?.action === 'no-op') {
      unchanged += 1;
      continue;
    }
    const action =
      mapped?.action === 'create' || mapped?.action === 'update' || mapped?.action === 'delete'
        ? mapped.action
        : 'no-op';
    out.push({
      name,
      action,
      sensitive: value.after_sensitive === true || value.before_sensitive === true,
    });
  }
  return { list: out, unchanged };
}

/** Read an already-parsed `terraform show -json` document. */
export function parsePlanJson(doc: Record<string, unknown>, maxChanges: number): JsonParseResult {
  const diagnostics: Diagnostic[] = [];
  const formatVersion = str(doc.format_version);

  if (formatVersion !== null) {
    const major = Number(formatVersion.split('.')[0]);
    if (!Number.isInteger(major) || major > 1 || major < 0) {
      diagnostics.push({
        severity: 'warning',
        message:
          `Unknown plan JSON format_version "${formatVersion}". This tool is written against ` +
          '0.1 through 1.x, so fields may have been renamed — treat every count here as unverified.',
      });
    }
  }

  const hasResourceChanges = 'resource_changes' in doc;
  if (hasResourceChanges && !Array.isArray(doc.resource_changes)) {
    diagnostics.push({
      severity: 'error',
      message:
        'The JSON has a "resource_changes" key, but it is not an array, so no resource actions ' +
        'could be read.',
    });
    const outputsOnly = readOutputs(doc.output_changes);
    return {
      changes: [],
      drift: [],
      outputChanges: outputsOnly.list,
      formatVersion,
      version: str(doc.terraform_version),
      changesTruncated: false,
      diagnostics,
      usable: false,
      unchangedResources: 0,
      unchangedOutputs: outputsOnly.unchanged,
    };
  }

  const changesRead = readList(doc.resource_changes, maxChanges, diagnostics);
  const driftRead = readList(doc.resource_drift, maxChanges, diagnostics);
  const skipped = changesRead.skipped + driftRead.skipped;
  if (skipped > 0) {
    diagnostics.push({
      severity: 'warning',
      message: `${skipped} ${skipped === 1 ? 'entry' : 'entries'} in "resource_changes" ${
        skipped === 1 ? 'was' : 'were'
      } not objects and could not be read.`,
    });
  }

  const outputs = readOutputs(doc.output_changes);

  return {
    changes: changesRead.list,
    drift: driftRead.list,
    outputChanges: outputs.list,
    formatVersion,
    version: str(doc.terraform_version),
    changesTruncated: changesRead.truncated || driftRead.truncated,
    diagnostics,
    usable: true,
    unchangedResources: changesRead.unchanged + driftRead.unchanged,
    unchangedOutputs: outputs.unchanged,
  };
}

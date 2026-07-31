/**
 * Reading the resources side: whatever a person actually has in the clipboard.
 *
 * Accepted, all through one `js-yaml` `loadAll`:
 *   · a multi-document paste (`kubectl get pods -o yaml` between `---` markers);
 *   · a `kind: List` / `kind: PodList` wrapper, flattened through `items`;
 *   · a bare YAML list of objects;
 *   · a single manifest;
 *   · the shorthand `{name, labels}` object people write in a tester.
 *
 * Two decisions worth stating, because both could have been quietly wrong:
 *
 *   1. A WORKLOAD'S OWN LABELS ARE NOT ITS POD LABELS. A Service selects pods,
 *      so evaluating a Deployment's `metadata.labels` and calling it "the pods"
 *      would be the confidently-wrong answer this tool exists to prevent. Each
 *      `spec.template.metadata.labels` therefore becomes its OWN row, labelled
 *      `Pod template` and carrying the field path it came from, and a note says
 *      why there are two rows for one document.
 *   2. A resource's own labels are ADVISORY. Kubernetes would reject
 *      `app: "not valid!"` on admission, but the question here is "does this
 *      selector match this resource", and refusing to answer it would be
 *      unhelpful. Invalid resource labels become `labelIssues` on the verdict;
 *      only SELECTOR keys and values are hard errors.
 *
 * Nothing throws. A duplicated mapping key is a js-yaml THROW (not a warning),
 * which is why it is caught here and re-reported with its line number.
 */
import type { Diagnostic, LabelIssue } from './types';
import { loadYamlDocuments } from './selector-parse';
import {
  coerceLabelScalar,
  group,
  nonStringLabelNote,
  sentenceCase,
  validateLabelKey,
  validateLabelValue,
} from './validate';

/**
 * Resources evaluated per run. The engine is linear; the verdict array and the
 * DOM it renders into are not, and 5,000 cards is what freezes a tab.
 */
export const MAX_RESOURCES = 500;
/** A paste larger than this is a log or an archive, not a manifest set. */
export const MAX_RESOURCE_CHARS = 500_000;
/** Advisory label problems listed per resource before they are summarized. */
const MAX_LABEL_ISSUES = 10;

export interface ParsedResource {
  kind: string;
  name: string;
  namespace?: string;
  labels: Record<string, string>;
  labelsPath: string;
  labelIssues: LabelIssue[];
  /**
   * Keys the document CARRIES but whose value YAML did not read as a scalar —
   * a map, a list, or the classic unquoted date (`released: 2024-06-01`, which
   * js-yaml resolves to a `Date`). Mapped to what YAML made of them.
   *
   * They cannot go in `labels` (there is no string to compare against) and they
   * must NOT be treated as absent: claiming "no released label at all" about a
   * manifest whose `released:` line is right there — and firing the amber
   * absent-key annotation on it — is the confidently-wrong answer this tool
   * exists to prevent. `evaluateClause` reads this set and refuses to decide.
   */
  unreadableLabels: Record<string, string>;
}

export interface ResourceParse {
  resources: ParsedResource[];
  diagnostics: Diagnostic[];
  /** Candidate objects found before the cap. */
  totalResources: number;
  truncated: boolean;
}

export const POD_TEMPLATE_NOTE =
  'A workload’s own labels and its pod-template labels are different sets, and a Service or ' +
  'NetworkPolicy selects the POD labels. Each pod template found here is listed as its own ' +
  '"Pod template" row.';

function resErr(message: string, line?: number): Diagnostic {
  return { severity: 'error', message: `Resources: ${message}`, where: 'resources', line };
}
function resWarn(message: string): Diagnostic {
  return { severity: 'warning', message: `Resources: ${message}`, where: 'resources' };
}
function bareWarn(message: string): Diagnostic {
  return { severity: 'warning', message, where: 'resources' };
}
function bareNote(message: string): Diagnostic {
  return { severity: 'note', message, where: 'resources' };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typeName(value: unknown): string {
  if (Array.isArray(value)) return 'list';
  if (value === null) return 'null value';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  // `released: 2024-06-01` — js-yaml's default schema resolves an unquoted date
  // to a Date. Calling that "a map" was wrong and unrecognisable.
  if (value instanceof Date) return 'date';
  if (typeof value === 'object') return 'map';
  return 'value';
}

/** A label map plus every advisory problem in it. `null` when the field is absent. */
function readLabels(
  raw: unknown,
  path: string,
  docIndex: number,
  diagnostics: Diagnostic[],
): { labels: Record<string, string>; issues: LabelIssue[]; unreadable: Record<string, string> } {
  const labels: Record<string, string> = {};
  const issues: LabelIssue[] = [];
  const unreadable: Record<string, string> = {};
  if (raw === undefined || raw === null) return { labels, issues, unreadable };
  if (!isPlainObject(raw)) {
    diagnostics.push(
      resWarn(
        `document ${docIndex} has ${path} written as a ${typeName(raw)}, not a key/value map — it was read as having no labels.`,
      ),
    );
    return { labels, issues, unreadable };
  }
  for (const [key, value] of Object.entries(raw)) {
    const keyProblem = validateLabelKey(key);
    if (keyProblem) issues.push({ key, message: sentenceCase(keyProblem) });
    const coerced = coerceLabelScalar(value);
    if (coerced === null) {
      // The key IS in the document; only its value is unusable. Record it so no
      // clause can report it as absent.
      unreadable[key] = typeName(value);
      issues.push({
        key,
        message: `Label ${key} is a ${typeName(value)}, not a label value — Kubernetes labels are strings. Quote it to make it one.`,
      });
      continue;
    }
    if (coerced.kind !== null) {
      issues.push({ key, message: nonStringLabelNote(`Label ${key}`, coerced.text, coerced.kind) });
    }
    const valueProblem = validateLabelValue(key, coerced.text);
    if (valueProblem) issues.push({ key, message: sentenceCase(valueProblem) });
    labels[key] = coerced.text;
  }
  if (issues.length > MAX_LABEL_ISSUES) {
    const hidden = issues.length - MAX_LABEL_ISSUES;
    const kept = issues.slice(0, MAX_LABEL_ISSUES);
    kept.push({
      key: '',
      message: `…and ${group(hidden)} more label problem${hidden === 1 ? '' : 's'} on this resource.`,
    });
    return { labels, issues: kept, unreadable };
  }
  return { labels, issues, unreadable };
}

/** `spec.template` and a CronJob's `spec.jobTemplate.spec.template`. */
function podTemplatePaths(spec: Record<string, unknown>): { template: Record<string, unknown>; path: string }[] {
  const found: { template: Record<string, unknown>; path: string }[] = [];
  if (isPlainObject(spec.template)) {
    found.push({ template: spec.template, path: 'spec.template' });
  }
  if (isPlainObject(spec.jobTemplate) && isPlainObject(spec.jobTemplate.spec)) {
    const inner = (spec.jobTemplate.spec as Record<string, unknown>).template;
    if (isPlainObject(inner)) {
      found.push({ template: inner, path: 'spec.jobTemplate.spec.template' });
    }
  }
  return found;
}

/** One candidate object → its own row, plus a row per pod template it carries. */
function readObject(
  object: Record<string, unknown>,
  docIndex: number,
  diagnostics: Diagnostic[],
  sawTemplate: { value: boolean },
): ParsedResource[] {
  const kind = typeof object.kind === 'string' && object.kind.length > 0 ? object.kind : 'Object';
  const metadata = isPlainObject(object.metadata) ? object.metadata : null;

  let name = '';
  let namespace: string | undefined;
  let labelsRaw: unknown;
  let labelsPath: string;
  if (metadata !== null) {
    if (typeof metadata.name === 'string') name = metadata.name;
    if (typeof metadata.namespace === 'string' && metadata.namespace.length > 0) {
      namespace = metadata.namespace;
    }
    labelsRaw = metadata.labels;
    labelsPath = 'metadata.labels';
  } else {
    // The shorthand people type into a tester: `name:` / `labels:` at the top.
    if (typeof object.name === 'string') name = object.name;
    if (typeof object.namespace === 'string' && object.namespace.length > 0) {
      namespace = object.namespace;
    }
    labelsRaw = object.labels;
    labelsPath = 'labels';
  }

  const own = readLabels(labelsRaw, labelsPath, docIndex, diagnostics);
  const rows: ParsedResource[] = [
    {
      kind,
      name: name.length > 0 ? name : '(unnamed)',
      namespace,
      labels: own.labels,
      labelsPath,
      labelIssues: own.issues,
      unreadableLabels: own.unreadable,
    },
  ];

  const spec = isPlainObject(object.spec) ? object.spec : null;
  if (spec !== null) {
    for (const { template, path } of podTemplatePaths(spec)) {
      const templateMeta = isPlainObject(template.metadata) ? template.metadata : null;
      if (templateMeta === null) continue;
      const fieldPath = `${path}.metadata.labels`;
      const templateLabels = readLabels(templateMeta.labels, fieldPath, docIndex, diagnostics);
      if (
        Object.keys(templateLabels.labels).length === 0 &&
        templateLabels.issues.length === 0 &&
        templateMeta.labels === undefined
      ) {
        continue;
      }
      sawTemplate.value = true;
      rows.push({
        kind: 'Pod template',
        name: rows[0].name,
        namespace,
        labels: templateLabels.labels,
        labelsPath: fieldPath,
        labelIssues: templateLabels.issues,
        unreadableLabels: templateLabels.unreadable,
      });
    }
  }
  return rows;
}

export function parseResources(input: string): ResourceParse {
  const diagnostics: Diagnostic[] = [];
  const text = typeof input === 'string' ? input.replace(/^﻿/, '') : '';

  if (text.length > MAX_RESOURCE_CHARS) {
    diagnostics.push(
      resErr(
        `this paste is ${group(text.length)} characters and this tester reads up to ${group(MAX_RESOURCE_CHARS)} characters — trim it. Anything larger is a log or an archive, not a manifest set.`,
      ),
    );
    return { resources: [], diagnostics, totalResources: 0, truncated: false };
  }
  if (text.trim().length === 0) {
    return { resources: [], diagnostics, totalResources: 0, truncated: false };
  }

  const loaded = loadYamlDocuments(text, 'Resources');
  if ('error' in loaded) {
    diagnostics.push(resErr(loaded.error.message, loaded.error.line));
    return { resources: [], diagnostics, totalResources: 0, truncated: false };
  }

  /* Flatten documents → candidate objects, keeping the document index for messages. */
  const candidates: { object: Record<string, unknown>; docIndex: number }[] = [];
  let fatal = false;
  loaded.docs.forEach((doc, index) => {
    const docIndex = index + 1;
    if (doc === undefined || doc === null) return;
    if (Array.isArray(doc)) {
      doc.forEach((entry, itemIndex) => {
        if (isPlainObject(entry)) candidates.push({ object: entry, docIndex });
        else if (entry !== null && entry !== undefined) {
          diagnostics.push(
            resWarn(
              `document ${docIndex} item ${itemIndex + 1} is a ${typeName(entry)}, not a Kubernetes object — skipped.`,
            ),
          );
        }
      });
      return;
    }
    if (!isPlainObject(doc)) {
      diagnostics.push(
        resErr(
          `document ${docIndex} is a plain ${typeName(doc)}, not a Kubernetes object — paste manifests, a kind: List, or a YAML list of objects.`,
        ),
      );
      fatal = true;
      return;
    }
    const kind = typeof doc.kind === 'string' ? doc.kind : '';
    if (/List$/.test(kind)) {
      if (Array.isArray(doc.items)) {
        doc.items.forEach((entry, itemIndex) => {
          if (isPlainObject(entry)) candidates.push({ object: entry, docIndex });
          else if (entry !== null && entry !== undefined) {
            diagnostics.push(
              resWarn(
                `document ${docIndex} items[${itemIndex}] is a ${typeName(entry)}, not a Kubernetes object — skipped.`,
              ),
            );
          }
        });
      } else {
        diagnostics.push(
          bareNote(
            `Resources: document ${docIndex} is a ${kind} with no items list, so there was nothing inside it to check.`,
          ),
        );
      }
      return;
    }
    candidates.push({ object: doc, docIndex });
  });

  if (fatal) return { resources: [], diagnostics, totalResources: candidates.length, truncated: false };

  const kept = candidates.slice(0, MAX_RESOURCES);
  const truncated = candidates.length > kept.length;
  const sawTemplate = { value: false };
  const resources: ParsedResource[] = [];
  for (const candidate of kept) {
    resources.push(...readObject(candidate.object, candidate.docIndex, diagnostics, sawTemplate));
  }
  if (sawTemplate.value) diagnostics.push(bareNote(POD_TEMPLATE_NOTE));
  if (truncated) {
    diagnostics.push(
      bareWarn(
        `Only the first ${group(MAX_RESOURCES)} resources were evaluated; ${group(candidates.length)} were found. Trim the paste to check the rest.`,
      ),
    );
  }

  return { resources, diagnostics, totalResources: candidates.length, truncated };
}

/**
 * Label key and value validation — a faithful port of the two functions
 * Kubernetes actually applies to a selector, from
 * `k8s.io/apimachinery/pkg/util/validation`:
 *
 *   `IsQualifiedName`   an optional DNS-1123-subdomain prefix (≤253), a `/`,
 *                       then a name (≤63) of alphanumerics, `-`, `_` and `.`
 *                       that starts and ends alphanumeric.
 *   `IsValidLabelValue` ≤63 characters, same alphabet, must start and end
 *                       alphanumeric — and the EMPTY string is valid.
 *
 * The wordings here are ours, not apimachinery's, for one reason: every one
 * NAMES THE LIMIT IT BROKE. "must be no more than 63 characters" tells you the
 * rule; "is 64 characters; the limit is 63" tells you the rule *and* how far
 * over you are, which is the difference between a diagnostic and a scolding.
 * They are pinned byte-for-byte by `engine.test.ts` — they are the product.
 *
 * Every function returns `null` for valid, or one complete sentence. Nothing
 * here throws, and nothing here is regex-heavy enough to backtrack: each pattern
 * is linear (no nested quantifier over the same alphabet), so a 100 KB paste is
 * a 100 KB scan and not a hang.
 */

/** `IsQualifiedName`: the name part after the optional `prefix/`. */
export const MAX_KEY_NAME = 63;
/** `IsQualifiedName`: the DNS-subdomain prefix before the `/`. */
export const MAX_KEY_PREFIX = 253;
/** `IsValidLabelValue`. */
export const MAX_LABEL_VALUE = 63;

/** `qualifiedNameFmt` — alphanumeric ends, `-_.` inside. */
const KEY_NAME_RE = /^[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$/;
/** `dns1123SubdomainFmt` — lowercase labels joined by dots. */
const DNS_SUBDOMAIN_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
/** `labelValueFmt` — same alphabet as a key name, and the empty string. */
const LABEL_VALUE_RE = /^(([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?$/;

/**
 * Echo a user-supplied token inside a diagnostic without letting a 60 KB paste
 * become a 60 KB sentence. Deterministic, so the pinned strings stay pinned.
 */
export function show(value: string): string {
  return value.length <= 44 ? value : `${value.slice(0, 41)}…`;
}

/** `1234567` → `1,234,567`. Locale-independent on purpose (pinned strings). */
export function group(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** null when the key is a valid label key; otherwise one sentence naming the limit. */
export function validateLabelKey(key: string): string | null {
  if (key.length === 0) return 'a label key cannot be empty.';

  const slashes = key.split('/');
  if (slashes.length > 2) {
    return `label key "${show(key)}" has more than one "/" — a key is at most one DNS-subdomain prefix, a "/", then the name.`;
  }

  let name = key;
  if (slashes.length === 2) {
    const prefix = slashes[0];
    name = slashes[1];
    if (prefix.length === 0) {
      return `label key "${show(key)}" has an empty prefix before the "/".`;
    }
    if (prefix.length > MAX_KEY_PREFIX) {
      return `the prefix of label key "${show(key)}" is ${group(prefix.length)} characters; the limit is ${MAX_KEY_PREFIX}.`;
    }
    if (!DNS_SUBDOMAIN_RE.test(prefix)) {
      return `the prefix "${show(prefix)}" of label key "${show(key)}" is not a DNS subdomain — lowercase letters, digits, "-" and "." only, starting and ending with a letter or digit.`;
    }
    if (name.length === 0) {
      return `label key "${show(key)}" has an empty name after the "/".`;
    }
  }

  if (name.length > MAX_KEY_NAME) {
    return `label key name "${show(name)}" is ${group(name.length)} characters; the limit is ${MAX_KEY_NAME}.`;
  }
  if (!KEY_NAME_RE.test(name)) {
    return `label key name "${show(name)}" must be alphanumeric, "-", "_" or "." and must start and end with a letter or digit.`;
  }
  return null;
}

/** null when the value is a valid label value; otherwise one sentence. */
export function validateLabelValue(key: string, value: string): string | null {
  if (value.length > MAX_LABEL_VALUE) {
    return `label value "${show(value)}" for key "${show(key)}" is ${group(value.length)} characters; the limit is ${MAX_LABEL_VALUE}.`;
  }
  if (!LABEL_VALUE_RE.test(value)) {
    return `label value "${show(value)}" for key "${show(key)}" must be alphanumeric, "-", "_" or "." and must start and end with a letter or digit (an empty value is allowed).`;
  }
  return null;
}

/** `label key …` → `Label key …`. The same sentence reads as a clause or alone. */
export function sentenceCase(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/** What YAML made of a label value that was not written as a string. */
export type ScalarKind = 'number' | 'boolean' | 'null';

/**
 * A YAML scalar coerced to the string Kubernetes would have required, plus the
 * kind YAML actually read — `null` kind means it was already a string, and a
 * `null` RETURN means the value was a map or list and cannot be a label at all.
 *
 * This is the `version: 1` / `debug: true` trap: both are perfectly good YAML,
 * and neither is a valid Kubernetes label value, because the API schema is
 * `map[string]string`. Silently stringifying them would hide the exact reason
 * the manifest was rejected.
 */
export function coerceLabelScalar(value: unknown): { text: string; kind: ScalarKind | null } | null {
  if (typeof value === 'string') return { text: value, kind: null };
  if (typeof value === 'number' && Number.isFinite(value)) return { text: String(value), kind: 'number' };
  if (typeof value === 'boolean') return { text: String(value), kind: 'boolean' };
  if (value === null || value === undefined) return { text: '', kind: 'null' };
  return null;
}

/** The sentence that explains a non-string label value. `subject` names the field. */
export function nonStringLabelNote(subject: string, raw: string, kind: ScalarKind): string {
  if (kind === 'null') {
    return `${subject} was written with no value, so YAML read it as null. Kubernetes label values are strings — write "" if you mean an empty value.`;
  }
  return `${subject} was written as ${raw}, so YAML read it as a ${kind}. Kubernetes label values are strings — quote it as "${raw}".`;
}

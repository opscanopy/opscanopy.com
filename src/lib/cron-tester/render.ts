/**
 * Cron Expression Tester — the pure HTML builders for the result panel.
 *
 * Split by determinism, because only half of a cron result can be baked into
 * static HTML:
 *
 *   - `descHtml` and `fieldsHtml` are deterministic — the plain-English
 *     description and the echoed field tokens depend only on the expression.
 *     The Astro frontmatter server-renders these so a no-JS visitor (and every
 *     AI crawler, which does not execute JS) sees a real reading of the seeded
 *     expression.
 *   - `runsHtml` is code-pure but its INPUTS are not: next-run times come from
 *     `new Date()` and the visitor's timezone. Calling it at build time would
 *     freeze "in 5 minutes" into every page, so the server emits
 *     `runsSkeletonHtml()` instead and the client replaces it after boot.
 *
 * The locale prefix for chain chips is passed in: the browser derives it from
 * `window.location`, the build from `Astro.currentLocale`.
 */
import { escapeHtml } from '../escape-html';
import { buildHashValue } from '../hash-state';
import type { CronFields } from './types';

export const ALERT_SVG =
  '<svg class="cron-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const CLOCK_SVG =
  '<svg class="cron-runs__head-icon" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7.25"></circle><path d="M10 5.75V10l2.75 1.75"></path></svg>';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="cron-empty body-sm text-inverse-mute">Type a cron expression or pick an example to see a plain-English description and the next run times here.</p>';

export const FIELD_LABELS: Array<[keyof CronFields, string]> = [
  ['minute', 'Minute'],
  ['hour', 'Hour'],
  ['dayOfMonth', 'Day of month'],
  ['month', 'Month'],
  ['dayOfWeek', 'Day of week'],
];

export function errorHtml(message: string): string {
  return (
    '<div class="cron-error" role="alert">' +
    ALERT_SVG +
    '<div class="cron-error__body"><p class="cron-error__title">Could not parse this expression</p>' +
    `<p class="cron-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}

/** The plain-English reading — deterministic, so it is safe to server-render. */
export function descHtml(description: string): string {
  const text = description && description.length > 0 ? description : 'Schedule parsed.';
  return `<p class="cron-desc__text">${escapeHtml(text)}</p>`;
}

/** The five parsed fields — deterministic (they echo the user's own tokens). */
export function fieldsHtml(fields: CronFields): string {
  const cells = FIELD_LABELS.map(([key, label]) => {
    const raw = fields[key];
    const val = typeof raw === 'string' && raw.length > 0 ? raw : '—';
    return (
      '<div class="cron-field">' +
      `<span class="cron-field__label">${escapeHtml(label)}</span>` +
      `<span class="cron-field__val" data-k="field:${key}">${escapeHtml(val)}</span></div>`
    );
  }).join('');
  return `<div class="cron-fields">${cells}</div>`;
}

/** The description card, as the client composes it. */
export function descCardHtml(description: string, fields: CronFields): string {
  return '<div class="cron-desc">' + descHtml(description) + fieldsHtml(fields) + '</div>';
}

/**
 * A next-runs block that states no times. Server-rendered so the panel has its
 * full height before hydration (no layout jump) while staying honest: run
 * times are a function of "now" and of the reader's timezone, so only the
 * browser can compute them.
 */
export function runsSkeletonHtml(): string {
  return (
    '<div class="cron-runs"><div class="cron-runs__head">' +
    CLOCK_SVG +
    '<span class="cron-runs__head-text">Next runs</span></div>' +
    '<ul class="cron-runs__list"><li class="cron-run">' +
    '<span class="cron-run__time">Computed in your browser, in your timezone.</span></li></ul></div>'
  );
}

/** Cross-tool chain chips. The Timestamp chip needs a run epoch, so it is client-only. */
export function chainsHtml(expr: string, firstRunEpoch: number | undefined, localePrefix: string): string {
  const chips: string[] = [
    `<a class="cron-chip" href="${escapeHtml(`${localePrefix}/cron-to-systemd/` + buildHashValue('cron', expr))}">Convert to systemd timer</a>`,
  ];
  if (typeof firstRunEpoch === 'number') {
    chips.push(
      `<a class="cron-chip" href="${escapeHtml(`${localePrefix}/timestamp-converter/` + buildHashValue('t', String(firstRunEpoch)))}">View next run in Timestamp Converter</a>`,
    );
  }
  return `<div class="cron-chips">${chips.join('')}</div>`;
}

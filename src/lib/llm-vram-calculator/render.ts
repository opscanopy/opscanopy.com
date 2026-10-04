/**
 * LLM VRAM Calculator — pure HTML builders shared by the Astro frontmatter (SSR seed) and the
 * island's <script>, so the two can never drift. No window, no document, no clock.
 * Every value is escaped; value elements carry `data-k` for the changed-value tick.
 */
import { escapeHtml } from '../escape-html';
import type { VramResult } from './types';

/** "an 8 GiB", "an 80 GiB", "a 16 GiB" — the tiers that start with a vowel sound. */
const article = (gib: number): string => (gib === 8 || gib === 80 ? 'an' : 'a');

export const EMPTY_HTML =
  '<p class="lvc-empty body-sm text-inverse-mute">Pick a model or type a parameter count to see how much GPU memory it needs.</p>';

export const formatGiB = (n: number): string => n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2);
const gib = formatGiB;
const tokens = (n: number) => (n % 1024 === 0 ? `${n / 1024}k` : String(n));

function stat(label: string, value: string, cap?: string): string {
  return (
    '<div class="lvc-stat">' +
    `<span class="lvc-stat__k">${escapeHtml(label)}</span>` +
    `<span class="lvc-stat__v" data-k="stat:${escapeHtml(label)}">${escapeHtml(value)}</span>` +
    (cap ? `<span class="lvc-stat__cap">${escapeHtml(cap)}</span>` : '') +
    '</div>'
  );
}

export function errorHtml(message: string): string {
  return `<p class="lvc-error text-inverse-error" role="alert">${escapeHtml(message)}</p>`;
}

export function resultHtml(r: VramResult): string {
  if (!r.valid) return errorHtml(r.error ?? 'Could not estimate VRAM for this input.');

  const pct = (n: number) => ((n / r.totalGiB) * 100).toFixed(1);
  const seg = (name: string, n: number) =>
    `<div class="lvc-bar__seg lvc-bar__seg--${name}" style="width:${pct(n)}%" title="${escapeHtml(`${name} ${gib(n)} GiB`)}"></div>`;
  const bar =
    `<div class="lvc-bar" role="img" aria-label="${escapeHtml(`Weights ${gib(r.weightsGiB)} GiB, KV cache ${gib(r.kvGiB)} GiB, overhead ${gib(r.overheadGiB)} GiB`)}">` +
    seg('weights', r.weightsGiB) +
    seg('kv', r.kvGiB) +
    seg('overhead', r.overheadGiB) +
    '</div>';

  const archLabel = r.arch.estimated ? `estimated from nearest preset` : r.arch.presetName ?? 'preset';
  const stats =
    stat('Total VRAM', `${gib(r.totalGiB)} GiB`, r.minTierGiB ? `fits ${article(r.minTierGiB)} ${r.minTierGiB} GiB card` : 'exceeds a single 80 GiB card') +
    stat('Weights', `${gib(r.weightsGiB)} GiB`, `${r.params} B × ${r.bpw} bpw (${r.quantLabel})`) +
    stat('KV cache', `${gib(r.kvGiB)} GiB`, `${tokens(r.context)} ctx · ${r.arch.layers} layers · ${r.arch.kvHeads} KV heads · ${r.arch.headDim} dim · FP16`) +
    stat('Overhead', `${gib(r.overheadGiB)} GiB`, 'runtime + compute buffers, estimate') +
    stat('Architecture', archLabel);

  const tiers = r.tiers
    .map(
      (t) =>
        `<li class="lvc-tier${t.fits ? ' is-fit' : ''}">` +
        `<span class="lvc-tier__gib">${t.gib} GiB</span>` +
        `<span class="lvc-tier__v" data-k="tier:${t.gib}">${t.fits ? 'fits' : 'too small'}</span>` +
        `<span class="lvc-tier__cards">${escapeHtml(t.cards.join(', '))}</span></li>`,
    )
    .join('');

  return (
    '<div class="lvc-card">' +
    bar +
    `<div class="lvc-stats">${stats}</div>` +
    `<h3 class="lvc-group__h">GPU tiers</h3><ul class="lvc-tiers">${tiers}</ul>` +
    '</div>'
  );
}

/** One line for the role="status" summary. */
export function summaryText(r: VramResult): string {
  if (!r.valid) return r.error ?? 'Invalid input.';
  const fit = r.minTierGiB ? `fits ${article(r.minTierGiB)} ${r.minTierGiB} GiB GPU` : 'exceeds a single 80 GiB GPU';
  return `${gib(r.totalGiB)} GiB total at ${r.quantLabel}, ${tokens(r.context)} context — ${fit}.`;
}

/** "Label: value" lines for the Copy all button. */
export function buildCopyAll(r: VramResult): string {
  if (!r.valid) return r.error ?? '';
  return [
    `Total VRAM: ${gib(r.totalGiB)} GiB`,
    `Weights: ${gib(r.weightsGiB)} GiB (${r.params} B, ${r.quantLabel}, ${r.bpw} bpw)`,
    `KV cache: ${gib(r.kvGiB)} GiB (${r.context} tokens, FP16)`,
    `Overhead: ${gib(r.overheadGiB)} GiB`,
    `Minimum GPU: ${r.minTierGiB ? `${r.minTierGiB} GiB` : '> 80 GiB'}`,
  ].join('\n');
}

/**
 * Data Size & Transfer-Rate Converter — the pure HTML builders for the result panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees a real computed answer) and the island's <script> (which rebuilds
 * the same markup on every eval). One implementation, so the two can never
 * drift apart.
 *
 * Everything here is pure: no `window`, no `document`, no clock. The locale
 * prefix for cross-tool links is passed in — the browser derives it from
 * `window.location`, the build derives it from `Astro.currentLocale`. The
 * ladder rungs are passed in already filtered (`significantLadder`) so this
 * module never imports the engine and the engine keeps code-splitting away
 * from the page shell.
 */
import { escapeHtml } from '../escape-html';
import type { ConvertResult, LadderPair, SizeRow, TransferResult, ValueCell } from './types';

export const ALERT_SVG =
  '<svg class="dsz-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const COPY_ICON_SVG =
  '<svg class="dsz-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="dsz-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';

/** The empty-state paragraph, so the SSR placeholder and the client agree. */
export const EMPTY_HTML =
  '<p class="dsz-empty body-sm text-mute">Type a size — or tap an example — to see its ' +
  'exact byte count, both unit ladders and how long it takes to move.</p>';

export interface RenderOptions {
  /** '' for English, '/de' etc. for a localized page — prefixes cross-tool links. */
  localePrefix: string;
}

export function copyBtnHtml(label: string, value: string): string {
  return (
    `<button class="dsz-copy" type="button" aria-label="Copy ${escapeHtml(label)}" data-copy="${escapeHtml(value)}">` +
    COPY_ICON_SVG +
    CHECK_ICON_SVG +
    '</button>'
  );
}

/** A rendered number: the ≈ marker is display-only, never part of the copy. */
export function cellHtml(cell: ValueCell): string {
  return (
    (cell.approx ? '<span class="dsz-approx">&#8776;&#8202;</span>' : '') +
    escapeHtml(cell.display)
  );
}

export function rowHtml(
  label: string,
  cellOrText: ValueCell | string,
  options: { gloss?: string; caption?: string; hero?: boolean; copy?: string } = {},
): string {
  const isCell = typeof cellOrText !== 'string';
  const shown = isCell ? cellHtml(cellOrText) : escapeHtml(cellOrText);
  const copyValue = options.copy ?? (isCell ? cellOrText.value : cellOrText);
  const gloss = options.gloss
    ? `<span class="dsz-row__gloss">${escapeHtml(options.gloss)}</span>`
    : '';
  const caption = options.caption
    ? `<span class="dsz-row__cap">${escapeHtml(options.caption)}</span>`
    : '';
  return (
    '<div class="dsz-row">' +
    `<dt class="dsz-row__k">${escapeHtml(label)}${gloss}</dt>` +
    '<dd class="dsz-row__v-wrap">' +
    `<span class="dsz-row__v${options.hero ? ' is-hero' : ''}">${shown}${caption}</span>` +
    copyBtnHtml(label, copyValue) +
    '</dd></div>'
  );
}

export function exactBlockHtml(result: ConvertResult): string {
  const detection = result.detection;
  const bytes = result.bytes;
  const bits = result.bits;
  if (!detection || !bytes || !bits) return '';
  return (
    '<div class="dsz-block">' +
    '<div class="dsz-block__head"><span>Exact size</span>' +
    `<span class="dsz-block__meta">${escapeHtml(detection.normalized)}</span></div>` +
    '<dl class="dsz-rows">' +
    rowHtml('Bytes', bytes, { hero: true, gloss: 'the number every filesystem counts in' }) +
    rowHtml('Bits', bits, { gloss: '8 bits per byte, exactly' }) +
    '</dl></div>'
  );
}

export function transferBlockHtml(transfer: TransferResult): string {
  const { rate, ideal, realistic } = transfer;
  if (!rate || !ideal || !realistic) return '';
  return (
    '<div class="dsz-block">' +
    '<div class="dsz-block__head"><span>Transfer time</span>' +
    `<span class="dsz-block__meta">${escapeHtml(rate.caption)}</span></div>` +
    '<dl class="dsz-rows">' +
    rowHtml('At line rate', ideal.humanized, {
      hero: true,
      gloss: 'the theoretical best case',
      // "≈ 4000.5 s exactly" contradicted itself; say "exactly" only when it is.
      caption: ideal.seconds.approx
        ? `≈ ${ideal.seconds.display} s`
        : `${ideal.seconds.display} s exactly`,
      copy: ideal.humanized,
    }) +
    rowHtml(`At ${realistic.percent}% of line rate`, realistic.duration.humanized, {
      gloss: 'what real transfers land near',
      caption: `${realistic.duration.seconds.approx ? '≈ ' : ''}${realistic.duration.seconds.display} s`,
      copy: realistic.duration.humanized,
    }) +
    rowHtml('Speed in bits', rate.bitForm, { gloss: 'how links are sold' }) +
    rowHtml('Speed in bytes', rate.byteForm, { gloss: 'how transfers are measured' }) +
    '</dl></div>'
  );
}

export function ladderBlockHtml(rungs: LadderPair[]): string {
  if (rungs.length === 0) return '';
  const body = rungs
    .map((rung) => {
      const cellBox = (row: SizeRow): string =>
        '<div class="dsz-cellbox">' +
        `<span class="dsz-cellbox__u">${escapeHtml(row.unit)}</span>` +
        `<span class="dsz-cellbox__v">${cellHtml(row.cell)}</span>` +
        copyBtnHtml(`${row.cell.value} ${row.unit}`, row.copy) +
        '</div>';
      return (
        '<div class="dsz-rung">' +
        '<div class="dsz-rung__head">' +
        `<span>${escapeHtml(rung.label)}</span>` +
        `<span class="dsz-rung__gap">IEC is ${escapeHtml(rung.divergencePercent)}% bigger</span>` +
        '</div>' +
        `<div class="dsz-rung__cells">${cellBox(rung.si)}${cellBox(rung.iec)}</div>` +
        '</div>'
      );
    })
    .join('');
  return (
    '<div class="dsz-block">' +
    '<div class="dsz-block__head"><span>SI &harr; IEC ladder</span>' +
    '<span class="dsz-block__meta">1000-based vs 1024-based</span></div>' +
    '<p class="dsz-block__sub">The same size in both conventions, rung by rung. Values marked ' +
    '&#8776; are rounded to six decimals; the copy button always copies the number shown.</p>' +
    body +
    '</div>'
  );
}

export function notesBlockHtml(notes: string[]): string {
  if (notes.length === 0) return '';
  const items = notes
    .map(
      (note) =>
        '<li class="dsz-note"><span class="dsz-note__mark" aria-hidden="true">&#9679;</span>' +
        `<span>${escapeHtml(note)}</span></li>`,
    )
    .join('');
  return (
    '<div class="dsz-block">' +
    '<div class="dsz-block__head"><span>Notes</span>' +
    `<span class="dsz-block__meta">${notes.length} note${notes.length === 1 ? '' : 's'}</span></div>` +
    `<ul class="dsz-notelist">${items}</ul></div>`
  );
}

export function crossLinksHtml({ localePrefix }: RenderOptions): string {
  const chip = (href: string, text: string): string =>
    `<a class="dsz-xchip" href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
  return (
    '<div class="dsz-xchips">' +
    chip(`${localePrefix}/kubernetes-resource-calculator/`, 'Size a Kubernetes request') +
    chip(`${localePrefix}/subnet-calculator/`, 'Size a subnet') +
    chip(`${localePrefix}/chmod-calculator/`, 'Read a file mode') +
    '</div>'
  );
}

export function errorCardHtml(title: string, detail: string, isAlert: boolean, detailId: string): string {
  return (
    `<div class="dsz-error"${isAlert ? ' role="alert"' : ''}>` +
    ALERT_SVG +
    `<div><p class="dsz-error__title">${escapeHtml(title)}</p>` +
    `<p id="${detailId}" class="dsz-error__detail">${escapeHtml(detail)}</p></div></div>`
  );
}

/**
 * The whole valid-state body: exact size, transfer (when the rate parsed),
 * the significant ladder rungs, merged notes and the cross-tool chips.
 */
export function resultHtml(
  result: ConvertResult,
  transfer: TransferResult | null,
  rungs: LadderPair[],
  opts: RenderOptions,
): string {
  const notes = [...result.notes, ...(transfer?.valid ? transfer.notes : [])];
  return (
    exactBlockHtml(result) +
    (transfer?.valid ? transferBlockHtml(transfer) : '') +
    ladderBlockHtml(rungs) +
    notesBlockHtml(notes) +
    crossLinksHtml(opts)
  );
}

/** "Label: value" lines for Copy all. */
export function buildCopyAll(result: ConvertResult, transfer: TransferResult | null): string {
  const lines: string[] = [];
  if (result.detection) lines.push(`Size: ${result.detection.normalized}`);
  if (result.bytes) lines.push(`Bytes: ${result.bytes.value}`);
  if (result.bits) lines.push(`Bits: ${result.bits.value}`);
  for (const rung of result.ladder ?? []) {
    lines.push(`${rung.si.unit}: ${rung.si.cell.value}`);
    lines.push(`${rung.iec.unit}: ${rung.iec.cell.value}`);
  }
  if (transfer?.valid && transfer.rate && transfer.ideal && transfer.realistic) {
    lines.push(`Link speed: ${transfer.rate.bitForm} (${transfer.rate.byteForm})`);
    lines.push(`At line rate: ${transfer.ideal.humanized} (${transfer.ideal.seconds.value} s)`);
    lines.push(
      `At ${transfer.realistic.percent}%: ${transfer.realistic.duration.humanized} ` +
        `(${transfer.realistic.duration.seconds.value} s)`,
    );
  }
  for (const note of result.notes) lines.push(`Note: ${note}`);
  for (const note of transfer?.notes ?? []) lines.push(`Note: ${note}`);
  return lines.join('\n');
}

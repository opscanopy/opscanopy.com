/**
 * CIDR / Subnet Checker — the pure HTML builders for the result panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees a real in-range verdict) and the island's <script>. One
 * implementation, so the two can never drift apart. Everything here is pure:
 * no `window`, no `document`, no clock.
 *
 * The multi-line Copy-all payload is deliberately NOT here: newlines do not
 * round-trip through an HTML attribute, so the client sets it on the live
 * element after the first render.
 */
import { escapeHtml } from '../escape-html';
import type { CheckResult, CheckEntry, MembershipEntry, OverlapPair, AggGroup } from './types';

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="cdc-empty body-sm text-inverse-mute">Paste an IP plus the CIDRs to check it against — or any list of IPs/CIDRs — to see an in-range verdict, overlaps, and the merged minimal set here.</p>';

export const ALERT_SVG =
  '<svg class="cdc-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';
export const COPY_ICON_SVG =
  '<svg class="cdc-copy-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>';
export const CHECK_ICON_SVG =
  '<svg class="cdc-check-icon hidden" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';
export const OK_ICON_SVG =
  '<svg class="cdc-line__icon cdc-line__icon--ok" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.5 3.5L13 4.5"/></svg>';
export const BAD_ICON_SVG =
  '<svg class="cdc-line__icon cdc-line__icon--bad" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
export const VERDICT_IN_SVG =
  '<svg class="cdc-verdict__icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.25"/><path d="M5.2 8.3l2 2 3.6-4.2"/></svg>';
export const VERDICT_OUT_SVG =
  '<svg class="cdc-verdict__icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.25"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/></svg>';
export const VERDICT_NONE_SVG =
  '<svg class="cdc-verdict__icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.25" stroke-dasharray="2.4 2.2"/><path d="M6.4 6.3a1.6 1.6 0 1 1 2.3 1.7c-.45.25-.7.55-.7 1.05"/><path d="M8 11.2v.01"/></svg>';

export function familyLabel(version: 4 | 6): string {
  return version === 6 ? 'IPv6' : 'IPv4';
}

export function verdictHtml(membership: MembershipEntry[]): string {
  if (membership.length === 0) return '';
  const rows = membership
    .map((m) => {
      const family = familyLabel(m.version);
      let cls = '';
      let icon = '';
      let main = '';
      let extra = '';
      if (m.status === 'in') {
        cls = 'cdc-verdict__row--in';
        icon = VERDICT_IN_SVG;
        main = `<span class="cdc-verdict__ip">${escapeHtml(m.ip)}</span> is inside <span class="cdc-verdict__cidr">${escapeHtml(m.matches[0] ?? '')}</span>`;
        if (m.matches.length > 1) {
          extra = `also inside ${m.matches.slice(1).map((c) => escapeHtml(c)).join(', ')}`;
        }
      } else if (m.status === 'not-in') {
        cls = 'cdc-verdict__row--out';
        icon = VERDICT_OUT_SVG;
        main = `<span class="cdc-verdict__ip">${escapeHtml(m.ip)}</span> is not in any listed range`;
        extra = `checked against ${m.rangeCount} ${family} range${m.rangeCount === 1 ? '' : 's'}`;
      } else {
        cls = 'cdc-verdict__row--none';
        icon = VERDICT_NONE_SVG;
        main = `<span class="cdc-verdict__ip">${escapeHtml(m.ip)}</span> has no ${family} ranges to check against — add some below it`;
      }
      return (
        `<div class="cdc-verdict__row ${cls}">` +
        icon +
        `<div class="cdc-verdict__text"><p class="cdc-verdict__main" data-k="verdict:${escapeHtml(m.ip)}">${main}</p>` +
        (extra ? `<p class="cdc-verdict__extra">${extra}</p>` : '') +
        '</div></div>'
      );
    })
    .join('');
  return (
    '<div class="cdc-block cdc-verdict">' +
    '<div class="cdc-block__head"><span>IP in range?</span></div>' +
    '<p class="cdc-block__sub">Each bare IP in your list, checked against every CIDR range listed with it.</p>' +
    rows +
    '</div>'
  );
}

export function aggHtml(groups: AggGroup[]): string {
  return groups
    .map((g) => {
      const lines = g.cidrs
        .map(
          (c) =>
            `<div class="cdc-line">` +
            `<span>${escapeHtml(c)}</span>` +
            `<button class="cdc-copy" type="button" data-copy="${escapeHtml(c)}" aria-label="Copy ${escapeHtml(c)} to clipboard" title="Copy">` +
            COPY_ICON_SVG +
            CHECK_ICON_SVG +
            `</button>` +
            `</div>`,
        )
        .join('');
      const n = g.cidrs.length;
      return (
        '<div class="cdc-block">' +
        '<div class="cdc-block__head">' +
        `<span>Merged ranges — ${escapeHtml(g.label)}</span>` +
        `<span class="cdc-block__actions"><span class="cdc-line__meta">${n} block${n === 1 ? '' : 's'}</span>` +
        `<button class="cdc-copy cdc-copy--all" type="button" data-copy-all data-version="${g.version}" data-copy-label="Copy all" aria-label="Copy all ${escapeHtml(g.label)} blocks">` +
        COPY_ICON_SVG +
        CHECK_ICON_SVG +
        '<span class="cdc-copy-label">Copy all</span></button></span>' +
        '</div>' +
        '<p class="cdc-block__sub">The fewest CIDR blocks that cover exactly the same addresses — the minimal covering set (supernetting).</p>' +
        lines +
        '</div>'
      );
    })
    .join('');
}

export function overlapsHtml(overlaps: OverlapPair[]): string {
  const head =
    '<div class="cdc-block__head"><span>Overlaps &amp; containment</span>' +
    (overlaps.length ? `<span class="cdc-line__meta">${overlaps.length} found</span>` : '') +
    '</div>' +
    '<p class="cdc-block__sub">Entries that collide: duplicates, one block inside another, or partial overlaps.</p>';
  if (overlaps.length === 0) {
    return (
      '<div class="cdc-block">' +
      head +
      '<p class="cdc-none">No conflicts — no entry overlaps, duplicates, or contains another.</p></div>'
    );
  }
  const rows = overlaps.map((o) => `<p class="cdc-rel">${escapeHtml(o.relation)}</p>`).join('');
  return '<div class="cdc-block">' + head + rows + '</div>';
}

export function entriesHtml(entries: CheckEntry[]): string {
  const rows = entries
    .map((e) => {
      if (!e.ok) {
        return (
          '<div class="cdc-line cdc-line--bad">' +
          BAD_ICON_SVG +
          `<span>${escapeHtml(e.line)}</span>` +
          `<span class="cdc-line__meta">${escapeHtml(e.error ?? 'invalid')}</span></div>`
        );
      }
      const shown = e.display ?? e.cidr ?? e.line;
      const normNote = e.normalizedFrom
        ? ` <span class="cdc-norm-note">host bits stripped: ${escapeHtml(e.normalizedFrom)} → ${escapeHtml(e.cidr ?? '')}</span>`
        : '';
      const meta = e.role === 'ip' ? `IP · ${e.type ?? ''}` : (e.type ?? '');
      return (
        '<div class="cdc-line">' +
        OK_ICON_SVG +
        `<span>${escapeHtml(shown)}${normNote}</span>` +
        `<span class="cdc-line__meta">${escapeHtml(meta)}</span></div>`
      );
    })
    .join('');
  return (
    '<div class="cdc-block"><div class="cdc-block__head"><span>Parsed input</span>' +
    `<span class="cdc-line__meta">${entries.length} line${entries.length === 1 ? '' : 's'}</span></div>` +
    '<p class="cdc-block__sub">How each line was read. A bare IP counts as one address; host bits in a CIDR are stripped to its network.</p>' +
    rows +
    '</div>'
  );
}

export function summaryText(result: CheckResult): string {
  const { ok, invalid, overlaps, blocks } = result.stats;
  const membership = result.membership ?? [];
  let verdict = '';
  if (membership.length === 1) {
    const status = membership[0].status;
    verdict =
      status === 'in' ? 'in range' : status === 'not-in' ? 'not in range' : 'nothing to check against';
  } else if (membership.length > 1) {
    const inCount = membership.filter((m) => m.status === 'in').length;
    verdict = `${inCount}/${membership.length} in range`;
  }
  let text = verdict ? `${verdict} — ` : '';
  text += `${ok} valid`;
  if (invalid) text += ` · ${invalid} invalid`;
  if (overlaps) text += ` · ${overlaps} overlap${overlaps === 1 ? '' : 's'}`;
  text += ` · ${blocks} block${blocks === 1 ? '' : 's'}`;
  return text;
}

export function errorHtml(title: string, detail: string, entries: CheckEntry[]): string {
  return (
    '<div class="cdc-error" role="alert">' +
    ALERT_SVG +
    `<div><p class="cdc-error__title">${escapeHtml(title)}</p>` +
    `<p class="cdc-error__detail">${escapeHtml(detail)}</p></div></div>` +
    (entries.length ? entriesHtml(entries) : '')
  );
}

/** The whole result panel, in the order the client renders it. */
export function resultHtml(result: CheckResult): string {
  return (
    verdictHtml(result.membership ?? []) +
    aggHtml(result.aggregated ?? []) +
    overlapsHtml(result.overlaps ?? []) +
    entriesHtml(result.entries ?? [])
  );
}

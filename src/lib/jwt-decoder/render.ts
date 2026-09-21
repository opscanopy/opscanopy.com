/**
 * JWT Decoder — the pure HTML builders for the result panel.
 *
 * Shared by BOTH the Astro frontmatter (which server-renders the seeded
 * example so a no-JS visitor — and every AI crawler, which does not execute
 * JS — sees a real decoded token) and the island's <script>.
 *
 * `decode()` needs no WebCrypto, so it runs at build time; signature
 * VERIFICATION does (and is async and key-dependent), so the server always
 * renders the `no-key` trust state and the client upgrades it after boot.
 * Everything here is pure: no `window`, no `document`, no clock — the caller
 * passes a pinned `nowMs` into `decode` so relative claim ages cannot drift
 * between builds.
 */
import { escapeHtml } from '../escape-html';
import type { JwtResult, ClaimRow, Freshness, VerifyResult } from './types';

/**
 * The trust banner's states: the two the client owns before a verify resolves,
 * plus whatever `verify()` returns. The server can only ever render 'no-key'.
 */
export type BannerState = 'no-key' | 'pending' | VerifyResult['status'];

/** The empty-state paragraph, so the SSR placeholder and `renderEmpty` agree. */
export const EMPTY_HTML =
  '<p class="jwt-empty body-sm text-mute">Paste a JWT or pick an example to see its header, payload, claims, and signature decoded here.</p>';

export const ALERT_SVG =
  '<svg class="jwt-error__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"></path><path d="M10 8v4"></path><path d="M10 14.6v.01"></path></svg>';


export function errorHtml(title: string, message: string): string {
  return (
    '<div class="jwt-error" role="alert">' +
    ALERT_SVG +
    `<div><p class="jwt-error__title">${escapeHtml(title)}</p>` +
    `<p class="jwt-error__detail">${escapeHtml(message)}</p></div></div>`
  );
}


/** REQ-1 hero pill: exp/nbf verdict, icon + text + color in every state. */
export function freshnessPill(f: Freshness | undefined): string {
  if (!f) return '';
  const ICONS: Record<Freshness['state'], string> = {
    valid:
      '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10l4.5 4.5L16 6"/></svg>',
    expired:
      '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>',
    'not-yet':
      '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 6v4l2.5 2.5"/></svg>',
    none:
      '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="3 3" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/></svg>',
  };
  const LABELS: Record<Freshness['state'], string> = {
    valid: 'Valid',
    expired: 'Expired',
    'not-yet': 'Not yet valid',
    none: 'No time claims',
  };
  return (
    `<div class="jwt-pill jwt-pill--${f.state}" role="group" aria-label="Token time validity">` +
    ICONS[f.state] +
    `<span class="jwt-pill__label">${escapeHtml(LABELS[f.state])}</span>` +
    `<span class="jwt-pill__detail">${escapeHtml(f.detail)}</span>` +
    '</div>'
  );
}

/** Top-of-results trust banner reflecting verification state. */
export function trustBanner(state: BannerState): string {
  if (state === 'no-key') {
    return (
      '<div id="jwt-trust-banner" style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;margin-bottom:12px;border-radius:var(--radius-md);background:var(--color-warning-soft);box-shadow:inset 0 0 0 1px var(--color-warning);color:var(--color-warning-deep);font-size:13px;line-height:18px;">' +
      '<svg style="flex:0 0 auto;margin-top:1px;" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5L18.5 17H1.5z"/><path d="M10 8v4"/><path d="M10 14.5v.1"/></svg>' +
      '<span>Decoded — signature not verified. Supply a secret, public key, JWK, or JWKS to verify authenticity.</span>' +
      '</div>'
    );
  }
  if (state === 'pending') {
    return (
      '<div id="jwt-trust-banner" style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;margin-bottom:12px;border-radius:var(--radius-md);background:var(--color-canvas-soft);box-shadow:inset 0 0 0 1px var(--color-hairline-strong);color:var(--color-mute);font-size:13px;line-height:18px;">' +
      '<svg style="flex:0 0 auto;margin-top:1px;" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l2.5 2.5"/></svg>' +
      '<span>Verifying signature…</span>' +
      '</div>'
    );
  }
  if (state === 'valid') {
    return (
      '<div id="jwt-trust-banner" style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;margin-bottom:12px;border-radius:var(--radius-md);background:var(--color-brand-soft);box-shadow:inset 0 0 0 1px var(--color-brand);color:var(--color-brand-strong);font-size:13px;line-height:18px;">' +
      '<svg style="flex:0 0 auto;margin-top:1px;" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10l4.5 4.5L16 6"/></svg>' +
      '<span>Signature verified ✓</span>' +
      '</div>'
    );
  }
  if (state === 'invalid') {
    return (
      '<div id="jwt-trust-banner" style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;margin-bottom:12px;border-radius:var(--radius-md);background:var(--color-error-soft);box-shadow:inset 0 0 0 1px var(--color-error);color:var(--color-error-deep);font-size:13px;line-height:18px;">' +
      '<svg style="flex:0 0 auto;margin-top:1px;" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>' +
      '<span>Signature invalid ✗</span>' +
      '</div>'
    );
  }
  // unsupported / error
  return (
    '<div id="jwt-trust-banner" style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;margin-bottom:12px;border-radius:var(--radius-md);background:var(--color-canvas-soft);box-shadow:inset 0 0 0 1px var(--color-hairline-strong);color:var(--color-mute);font-size:13px;line-height:18px;">' +
    '<svg style="flex:0 0 auto;margin-top:1px;" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8"/><path d="M10 7v4"/><path d="M10 13.5v.1"/></svg>' +
    `<span>Signature verification ${state === 'unsupported' ? 'not supported for this algorithm / key' : 'encountered an error'}.</span>` +
    '</div>'
  );
}

/**
 * Block-copy button. No inline handler — a single delegated listener in
 * init() resolves the value (dataset.copy, else the nearest block's
 * .jwt-code text) and runs it through the shared clipboard helper with the
 * execCommand fallback + sr-only confirmation (repo copy contract).
 */
export function copyBtnHtml(): string {
  return '<button class="jwt-copy-btn" type="button" data-copy-label="Copy" aria-label="Copy">Copy</button>';
}

export function jsonBlock(title: string, json: string, meta?: string, caption?: string): string {
  const metaHtml = meta ? `<span class="jwt-block__meta">${escapeHtml(meta)}</span>` : '';
  const captionHtml = caption ? `<p class="jwt-block__caption">${escapeHtml(caption)}</p>` : '';
  return (
    '<div class="jwt-block">' +
    `<div class="jwt-block__head"><span>${escapeHtml(title)}</span><span style="display:flex;align-items:center;gap:8px;">${metaHtml}${copyBtnHtml()}</span></div>` +
    captionHtml +
    `<pre class="jwt-code">${escapeHtml(json)}</pre>` +
    '</div>'
  );
}

/**
 * REQ-8, adapted: always-visible muted captions instead of tooltips (the
 * playground contract bans tooltips — glossary is a muted caption), plus
 * an anchor link to the page's #reference section for the full legend.
 */
export function headerTermsCaption(headerJson: string | undefined): string {
  if (!headerJson) return '';
  try {
    const h = JSON.parse(headerJson) as Record<string, unknown>;
    const GLOSS: [string, string][] = [
      ['alg', 'alg = signing algorithm'],
      ['typ', 'typ = token type'],
      ['kid', 'kid = which key signed it'],
    ];
    const present = GLOSS.filter(([k]) => k in h).map(([, gloss]) => gloss);
    return present.join(' · ');
  } catch {
    return '';
  }
}

export function claimsBlock(claims: ClaimRow[]): string {
  if (claims.length === 0) {
    return (
      '<div class="jwt-block"><div class="jwt-block__head"><span>Registered claims</span></div>' +
      '<p class="jwt-none">No registered claims (iss/sub/aud/exp/nbf/iat/jti) in the payload.</p></div>'
    );
  }
  const rows = claims
    .map((c) => {
      const toneCls = c.tone === 'warn' ? ' jwt-row--warn' : c.tone === 'error' ? ' jwt-row--error' : '';
      const valueCls = 'jwt-row__value' + (c.mono ? ' jwt-row__value--mono' : '');
      const caption = c.caption
        ? `<span class="jwt-row__caption">${escapeHtml(c.caption)}</span>`
        : '';
      return (
        `<div class="jwt-row${toneCls}">` +
        `<span class="jwt-row__label">${escapeHtml(c.label)}</span>` +
        `<span class="${valueCls}">${escapeHtml(c.value)}${caption}</span>` +
        '</div>'
      );
    })
    .join('');
  return (
    '<div class="jwt-block">' +
    `<div class="jwt-block__head"><span>Registered claims</span><span class="jwt-block__meta">${claims.length} claim${claims.length === 1 ? '' : 's'}</span></div>` +
    rows +
    '</div>'
  );
}

export function signatureBlock(sig: string | undefined): string {
  const raw = sig ?? '';
  const body = raw.length
    ? `<div class="jwt-sig">${escapeHtml(raw)}</div>`
    : '<p class="jwt-none">Empty — this token carries no signature segment.</p>';
  return (
    '<div class="jwt-block"><div class="jwt-block__head"><span>Signature (base64url)</span></div>' +
    body +
    '</div>'
  );
}

export function warningsBlock(warnings: string[]): string {
  if (!warnings.length) return '';
  const rows = warnings
    .map(
      (w) =>
        '<div class="jwt-warn"><span class="jwt-warn__dot"></span>' +
        `<span>${escapeHtml(w)}</span></div>`,
    )
    .join('');
  return (
    '<div class="jwt-block"><div class="jwt-block__head"><span>Warnings</span>' +
    `<span class="jwt-block__meta">${warnings.length}</span></div>` +
    rows +
    '</div>'
  );
}

/** Verification block; `state` controls the badge while an async check resolves. */
export function verifyBlock(state: BannerState, detail: string, warning?: string): string {
  let badgeCls = 'jwt-badge--muted';
  let badgeText = 'no key';
  if (state === 'no-key') {
    badgeCls = 'jwt-badge--muted';
    badgeText = 'no key';
  } else if (state === 'pending') {
    badgeCls = 'jwt-badge--muted';
    badgeText = 'checking…';
  } else if (state === 'valid') {
    badgeCls = 'jwt-badge--valid';
    badgeText = 'valid';
  } else if (state === 'invalid') {
    badgeCls = 'jwt-badge--invalid';
    badgeText = 'invalid';
  } else if (state === 'unsupported') {
    badgeCls = 'jwt-badge--muted';
    badgeText = 'unsupported';
  } else {
    badgeCls = 'jwt-badge--muted';
    badgeText = 'error';
  }
  const warnHtml = warning
    ? `<p class="jwt-verify-warning">⚠ ${escapeHtml(warning)}</p>`
    : '';
  return (
    '<div class="jwt-block"><div class="jwt-block__head"><span>Signature verification</span></div>' +
    '<div class="jwt-verify">' +
    `<span class="jwt-badge ${badgeCls}"><span class="jwt-badge__dot"></span>${escapeHtml(badgeText)}</span>` +
    `<span class="jwt-verify__detail">${escapeHtml(detail)}</span>` +
    '</div>' +
    warnHtml +
    '</div>'
  );
}

/** The `alg · typ` line that goes in the summary slot. */
export function summaryText(result: JwtResult): string {
  const bits: string[] = [];
  if (result.alg) bits.push(result.alg);
  if (result.typ) bits.push(result.typ);
  return bits.join(' · ');
}

export function resultHtml(
  result: JwtResult,
  verifyHtml: string,
  bannerState: BannerState,
): string {
  return (
    freshnessPill(result.freshness) +
    trustBanner(bannerState) +
    jsonBlock('Header', result.header ?? '{}', result.alg, headerTermsCaption(result.header)) +
    jsonBlock('Payload', result.payload ?? '{}') +
    claimsBlock(result.claims ?? []) +
    '<div class="jwt-ref-row"><a class="jwt-chip" href="#reference">What do these claims mean? Token reference ↓</a></div>' +
    signatureBlock(result.signatureB64) +
    warningsBlock(result.warnings ?? []) +
    verifyHtml +
    '<div class="jwt-actions">' +
    '<button type="button" class="jwt-action-btn jwt-copy-btn" data-copy-all data-copy-label="Copy decoded JSON">Copy decoded JSON</button>' +
    '<button type="button" class="jwt-action-btn jwt-copy-btn" data-copy-label="Copy Bearer header" data-jwt-copy-bearer>Copy Bearer header</button>' +
    '<button type="button" class="jwt-action-btn" data-jwt-open-encoder>Edit in encoder →</button>' +
    '</div>'
  );
}

/**
 * figcapHtml — the figure-cap bar as an HTML string, for the places that
 * cannot render FigureCap.astro: the rehype plugin that heads every Markdown
 * code block (src/lib/rehype-code-header.mjs) and, later, runtime-built panels.
 *
 * It returns EXACTLY the markup FigureCap.astro renders for the same props
 * under `compressHTML: true` — the same single spaces between tags, the same
 * attribute order, the same escaping. src/lib/figcap.test.ts compiles
 * FigureCap.astro with Astro's own compiler, renders it through the container
 * API and compares the two strings byte for byte, so the component and this
 * builder cannot drift. FigureCap.astro itself is deliberately NOT rebuilt on
 * top of this function: it renders on the homepage, whose markup is frozen
 * during the 2026-09-30 H1 experiment read, and the equality test gives the
 * single-source guarantee without touching it.
 *
 * `actions` is trusted HTML (a button the caller built), inserted verbatim,
 * the way FigureCap's default slot is.
 */
import { figcapLabelParts } from './figcap-label';

export interface FigcapOptions {
  /** Text after the figure number (or the whole label when `fig` is absent). */
  label: string;
  /** Zero-padded figure number ("07"); renders as `fig. 07 — {label}`. */
  fig?: string;
  /** Dot colouring. `traffic` = red/amber/green tokens; `mute` = neutral. */
  tone?: 'mute' | 'traffic';
  /** Extra classes for the bar. */
  class?: string;
  /** Wrap the last ` · ` tail in `.figcap__sub` (see figcap-label.ts). */
  split?: boolean;
  /** Trusted HTML for the right-aligned actions slot; omitted → no slot. */
  actions?: string;
}

/** Astro's text-expression escaping (html-escaper's `escape`). */
export function escapeText(s: string): string {
  return s.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]!);
}

/** Astro's attribute-value escaping (`addAttribute`: only & and ").  */
export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export function figcapHtml({ label, fig, tone = 'mute', class: className, split = false, actions }: FigcapOptions): string {
  const text = fig ? `fig. ${fig} — ${label}` : label;
  const { head, sub } = figcapLabelParts(text, split);
  const classes = ['figcap', ...(className ?? '').split(/\s+/).filter(Boolean)];
  const cls = [...new Set(classes)].join(' ');
  const labelInner = sub ? `${escapeText(head)}<span class="figcap__sub">${escapeText(sub)}</span>` : escapeText(text);
  const slot = actions !== undefined ? `<span class="figcap__actions"> ${actions} </span>` : '';
  return (
    `<div class="${escapeAttr(cls)}" data-tone="${escapeAttr(tone)}"> ` +
    `<span class="figcap__dots" aria-hidden="true"> ` +
    `<i class="figcap__dot"></i><i class="figcap__dot"></i><i class="figcap__dot"></i> </span> ` +
    `<span class="figcap__label" title="${escapeAttr(text)}">${labelInner}</span> ` +
    `${slot} </div>`
  );
}

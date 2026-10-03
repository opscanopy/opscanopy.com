/**
 * cm-theme — the CodeMirror half of the ONE code palette (src/lib/code-palette.ts).
 *
 * Replaces `@codemirror/theme-one-dark` on the editor panes (plan "Batch C",
 * Wave 0): `plateTheme` paints the editor on the instrument plate and
 * `plateHighlight` colours tokens from the same table the Shiki theme reads,
 * so a YAML key in a blog post and a YAML key in the GitHub Actions validator
 * are the same ink. No category hue is a syntax colour (colour means category
 * on this site), and every ink is a slab-legal token value.
 *
 * Islands must `await import('../lib/playground-kit/cm-theme')` inside the
 * same boot closure as their CodeMirror languages. A static import would pull
 * `@codemirror/view` into the page shell and change the modulepreload / CSP
 * counts the postbuild pins.
 *
 * The background is the CSS token (`var(--color-inverse)`), not the literal:
 * the slab is "one ink set, two plate values" (#1b1915 light / #0a0908 dark)
 * and the editor must sit on whichever plate the theme block selects. The
 * focus ring is NOT set here: CodeMirror injects an unlayered
 * `.cm-focused { outline: 1px dotted #212121 }` at runtime, and only the
 * `!important` rule in global.css (`.editor-pane__host .cm-editor.cm-focused`)
 * beats it — pinned in contrast.test.ts.
 *
 * The specs are exported beside the built extensions so the node-environment
 * tests can assert the palette without a DOM.
 */
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
// A dependency of @codemirror/language (always installed, one copy): the tag
// objects HighlightStyle.define keys on. one-dark imports it the same way.
import { tags as t } from '@lezer/highlight';
import { CODE_PALETTE as P } from '../code-palette';

/** `EditorView.theme` spec: the plate, slab inks, no outline (global.css owns focus). */
export const plateThemeSpec = {
  '&': {
    color: P.fg,
    backgroundColor: 'var(--color-inverse)',
  },
  '.cm-content': {
    caretColor: P.brand,
    fontFamily: 'var(--font-mono)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: P.brand },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: '#8fc97a33' },
  '.cm-activeLine': { backgroundColor: '#ffffff0a' },
  '.cm-gutters': {
    backgroundColor: 'var(--color-inverse)',
    color: P.mute,
    border: 'none',
    borderRight: '1px solid var(--color-inverse-hairline)',
  },
  '.cm-activeLineGutter': { backgroundColor: '#ffffff0a', color: P.fg },
  '.cm-lineNumbers .cm-gutterElement': { fontFamily: 'var(--font-mono)' },
  '.cm-matchingBracket, .cm-nonmatchingBracket': {
    backgroundColor: '#ffffff14',
    outline: '1px solid var(--color-inverse-hairline)',
  },
  '.cm-searchMatch': { backgroundColor: '#e0a45833', outline: `1px solid ${P.amber}` },
  '.cm-tooltip': {
    backgroundColor: 'var(--color-inverse)',
    color: P.fg,
    border: '1px solid var(--color-inverse-hairline)',
  },
  '.cm-panels': { backgroundColor: 'var(--color-inverse)', color: P.fg },
} as const;

export const plateTheme = EditorView.theme(plateThemeSpec, { dark: true });

/**
 * Token → ink. Keywords / storage amber, strings leaf, numbers and language
 * constants violet, functions / tags / property names plain fg, comments and
 * punctuation mute (comments italic) — the same mapping as the Shiki theme.
 */
export const plateHighlightSpecs = [
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier], color: P.amber },
  { tag: [t.string, t.special(t.string), t.regexp, t.escape, t.character], color: P.brand },
  { tag: [t.number, t.integer, t.float, t.bool, t.null, t.atom, t.constant(t.name), t.standard(t.name)], color: P.violet },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.tagName, t.propertyName, t.definition(t.propertyName), t.attributeName, t.typeName, t.className, t.labelName],
    color: P.key,
  },
  { tag: [t.variableName, t.name, t.content, t.meta], color: P.fg },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: P.mute, fontStyle: 'italic' },
  { tag: [t.punctuation, t.separator, t.bracket, t.squareBracket, t.brace, t.paren, t.operator, t.derefOperator], color: P.mute },
  { tag: t.invalid, color: 'var(--color-inverse-error)' },
  { tag: t.strong, fontWeight: '600' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.link, color: P.brand, textDecoration: 'underline' },
  { tag: t.heading, color: P.fg, fontWeight: '600' },
];

export const plateHighlight = syntaxHighlighting(HighlightStyle.define(plateHighlightSpecs));

/** Both halves, in the order an `extensions: [...]` array wants them. */
export const plate = [plateTheme, plateHighlight];

/**
 * The sizing theme every island used to hand-write: the editor stops growing
 * at `maxHeightPx` and scrolls inside (CodeMirror needs the `.cm-scroller`
 * overflow for `maxHeight` on `&` to take effect). `minHeightPx` holds a
 * pane open before the document fills it. Font size is NOT set here — the
 * global `.editor-pane__host .cm-editor { font-size: 13px }` owns it (and the
 * coarse-pointer 16px override must keep beating it), as do the thin slab
 * scrollbar and the `[data-invalid]` rail. Spec exported for the node tests.
 */
export function plateSizingSpec(maxHeightPx: number, minHeightPx?: number) {
  if (!Number.isFinite(maxHeightPx) || maxHeightPx <= 0) throw new RangeError(`plateSizing: maxHeightPx must be a positive number, got ${maxHeightPx}`);
  if (minHeightPx !== undefined && (!Number.isFinite(minHeightPx) || minHeightPx < 0 || minHeightPx > maxHeightPx)) {
    throw new RangeError(`plateSizing: minHeightPx must be 0..maxHeightPx, got ${minHeightPx}`);
  }
  const scroller: Record<string, string> = { overflow: 'auto' };
  if (minHeightPx !== undefined) scroller.minHeight = `${minHeightPx}px`;
  return { '&': { maxHeight: `${maxHeightPx}px` }, '.cm-scroller': scroller };
}

export function plateSizing(maxHeightPx: number, minHeightPx?: number) {
  return EditorView.theme(plateSizingSpec(maxHeightPx, minHeightPx));
}

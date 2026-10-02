// src/lib/code-palette.ts — the ONE code palette, read by the Shiki theme
// (src/lib/shiki-theme.mjs) and the CodeMirror theme (src/lib/playground-kit/cm-theme.ts).
// Values are existing slab-legal tokens; no category hue is a syntax colour.
export const CODE_PALETTE = {
  bg: '#1b1915',          // light --color-inverse (Shiki needs a literal; CSS re-points it to the token)
  fg: '#f4f1ea',          // --color-inverse-fg
  mute: '#b8b2a4',        // --color-inverse-mute: comments (italic) and punctuation
  brand: '#8fc97a',       // --color-inverse-brand: strings
  amber: '#e0a458',       // --color-inverse-accent: keywords / storage
  violet: '#c9bfe0',      // dark --color-violet-deep: numbers and language constants
  key: '#f4f1ea',         // functions, tags, YAML keys: plain fg, never a category hue
} as const;
export type CodePalette = typeof CODE_PALETTE;

/**
 * opscanopyPlate — the Shiki theme for every Markdown code block (blog posts,
 * guides, Mission 90 days), built from the ONE code palette in
 * src/lib/code-palette.ts (the CodeMirror theme reads the same table, so a
 * fence and an editor never disagree on what a keyword looks like).
 *
 * Roles, all existing slab-legal inks (contrast.test.ts asserts every one is
 * >= 4.5:1 on BOTH plate values, #1b1915 light / #0a0908 dark):
 *   keyword / storage       amber   (--color-inverse-accent)
 *   string                  leaf    (--color-inverse-brand)
 *   number / language const violet  (dark --color-violet-deep)
 *   function / tag / key    fg      (--color-inverse-fg) — never a category hue,
 *                                    because on this site colour means category
 *   comment                 mute    (--color-inverse-mute), italic
 *   punctuation / operator  mute
 *
 * `bg` is a literal because Shiki writes it as an inline style on the <pre>;
 * global.css (`.code-fig pre`) re-points the background to var(--color-inverse)
 * so the dark theme gets its own plate value. Wired in astro.config.mjs
 * (`markdown.shikiConfig.theme`).
 */
import { CODE_PALETTE as P } from './code-palette.ts';

/** @type {import('shiki').ThemeRegistration} */
export const opscanopyPlate = {
  name: 'opscanopy-plate',
  type: 'dark',
  fg: P.fg,
  bg: P.bg,
  colors: {
    'editor.background': P.bg,
    'editor.foreground': P.fg,
  },
  settings: [
    { settings: { foreground: P.fg, background: P.bg } },
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
      settings: { foreground: P.mute, fontStyle: 'italic' },
    },
    {
      scope: [
        'punctuation',
        'meta.brace',
        'keyword.operator',
        'punctuation.definition.tag',
        'punctuation.separator',
        'punctuation.terminator',
      ],
      settings: { foreground: P.mute },
    },
    {
      scope: [
        'string',
        'string.quoted',
        'string.unquoted.plain',
        'string.template',
        'string.regexp',
        'punctuation.definition.string',
        'markup.inline.raw',
      ],
      settings: { foreground: P.brand },
    },
    {
      scope: [
        'keyword',
        'keyword.control',
        'keyword.other',
        'storage',
        'storage.type',
        'storage.modifier',
        'support.function.builtin.shell',
        'entity.name.function.call.shell',
        'variable.language',
      ],
      settings: { foreground: P.amber },
    },
    {
      scope: [
        'constant.numeric',
        'constant.language',
        'constant.character',
        'constant.other',
        'support.constant',
        'keyword.other.unit',
      ],
      settings: { foreground: P.violet },
    },
    {
      scope: [
        'entity.name.function',
        'support.function',
        'entity.name.tag',
        'entity.name.type',
        'entity.name.class',
        'entity.other.attribute-name',
        'support.type.property-name',
        'meta.object-literal.key',
        'variable',
        'variable.other',
        'variable.parameter',
        'support.type',
        'support.class',
      ],
      settings: { foreground: P.key },
    },
    { scope: ['markup.bold'], settings: { fontStyle: 'bold' } },
    { scope: ['markup.italic'], settings: { fontStyle: 'italic' } },
    { scope: ['markup.heading', 'markup.heading entity.name'], settings: { foreground: P.amber } },
    { scope: ['markup.inserted', 'punctuation.definition.inserted'], settings: { foreground: P.brand } },
    { scope: ['markup.deleted', 'punctuation.definition.deleted'], settings: { foreground: P.amber } },
    { scope: ['invalid', 'invalid.illegal'], settings: { foreground: P.fg } },
  ],
};

export default opscanopyPlate;

/**
 * Fence languages the posts use that Shiki has no grammar for. Unaliased, Shiki
 * warns, renders them as plaintext and stamps `data-language="plaintext"`, so
 * the figure cap would read `text` over a PromQL query. Aliased to plaintext,
 * the tokens are byte-identical (still unhighlighted) and the <pre> keeps the
 * name the author wrote, which is what the cap prints.
 */
export const PLAIN_LANG_ALIASES = {
  promql: 'plaintext',
  logql: 'plaintext',
  cron: 'plaintext',
  sshconfig: 'plaintext',
  gitignore: 'plaintext',
};

/** `markdown.shikiConfig` (astro.config.mjs) — also what the tests render with. */
export const shikiConfig = {
  theme: opscanopyPlate,
  wrap: false,
  langAlias: PLAIN_LANG_ALIASES,
};

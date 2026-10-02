/**
 * FigureCap label split — the pure half of FigureCap.astro's opt-in `split`.
 *
 * With `split` on, the LAST ` · ` tail of a label (`fig. 10 — subnet-calculator
 * · networking` → ` · networking`) becomes its own `.figcap__sub` span, which
 * global.css hides under 480px so the figure number and slug keep one line.
 * Off (the default), the label is one text node, byte-identical to the markup
 * FigureCap rendered before the split existed — the homepage (HeroDemo,
 * PrivacyProof) relies on that and never opts in.
 *
 * `head + sub` always equals the input, so the label's textContent and its
 * `title` never change either way.
 */
export const FIGCAP_SEP = ' · ';

export function figcapLabelParts(
  text: string,
  split = false,
): { head: string; sub: string } {
  if (!split) return { head: text, sub: '' };
  const cut = text.lastIndexOf(FIGCAP_SEP);
  if (cut <= 0) return { head: text, sub: '' };
  return { head: text.slice(0, cut), sub: text.slice(cut) };
}

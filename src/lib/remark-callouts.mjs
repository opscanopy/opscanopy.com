/**
 * remark-callouts — tags blockquotes that begin with a bold label (e.g.
 * `> **Warning:** …`, `> **Tip:** …`) with a `data-callout` type so global.css
 * can render warnings, tips and asides distinctly instead of one flat bar.
 *
 * Zero-dependency: walks the mdast tree directly (no unist-util-visit). Only
 * recognised labels are tagged; any other blockquote keeps the default style.
 */

// English labels first, then the de / es / fr / pt-br equivalents the
// localized blog posts use (same styles in every locale).
const TYPES = [
  { type: 'warning', labels: ['warning', 'gotcha', 'caution', 'danger', 'careful', 'avoid', 'pitfall',
    'achtung', 'vorsicht', 'fallstrick', 'cuidado', 'atención', 'ojo', 'attention', 'piège', 'mise en garde', 'atenção', 'armadilha'] },
  { type: 'real-error', labels: ['real error', 'error i hit'] },
  { type: 'tip', labels: ['tip', 'pro tip', 'protip', 'best practice', 'tipp', 'consejo', 'astuce', 'conseil', 'dica'] },
  { type: 'aside', labels: ['real world', 'real-world', 'example', 'interview', 'interview tip', 'in practice', 'analogy', 'aside',
    'in der praxis', 'beispiel', 'en la práctica', 'ejemplo', 'en pratique', 'exemple', 'na prática', 'exemplo'] },
  { type: 'note', labels: ['note', 'important', 'key', 'remember', 'key takeaway', 'tl;dr', 'tldr', 'summary',
    'hinweis', 'wichtig', 'merke', 'zusammenfassung', 'nota', 'importante', 'resumen', 'clave',
    'remarque', 'à retenir', 'en résumé', 'résumé', 'resumo'] },
];

function labelToType(label) {
  // NFC so a decomposed "é"/"ã" matches; trim() also drops the (narrow) no-break
  // space French typography puts before the colon ("Attention :").
  const norm = label.normalize('NFC').trim().toLowerCase().replace(/:\s*$/, '').trim();
  for (const { type, labels } of TYPES) if (labels.includes(norm)) return type;
  return null;
}

function nodeText(node) {
  if (!node) return '';
  if (typeof node.value === 'string') return node.value;
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('');
  return '';
}

function tagBlockquote(bq) {
  const firstPara = bq.children?.find((c) => c.type === 'paragraph');
  const lead = firstPara?.children?.[0];
  if (!lead || lead.type !== 'strong') return;
  const type = labelToType(nodeText(lead));
  if (!type) return;
  bq.data = bq.data || {};
  bq.data.hProperties = { ...(bq.data.hProperties || {}), 'data-callout': type };
}

function walk(node) {
  if (!node || !Array.isArray(node.children)) return;
  for (const child of node.children) {
    if (child.type === 'blockquote') tagBlockquote(child);
    walk(child);
  }
}

export default function remarkCallouts() {
  return (tree) => walk(tree);
}

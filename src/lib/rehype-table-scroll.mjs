/**
 * rehype-table-scroll — wraps every markdown-body <table> in
 * <div class="table-scroll" tabindex="0" role="region" aria-label="…">, so a
 * wide table scrolls inside the column instead of widening the page. At 390px
 * the guides reached a 413–644px layout width (a Fix column of unbreakable
 * inline <code>). The table keeps its real table semantics — `display: block`
 * on the <table> itself would drop the role in some screen readers — and the
 * wrapper is focusable so keyboard users can scroll it (axe
 * scrollable-region-focusable). Styled by `.rich-text .table-scroll` in
 * global.css. The label is the table's <caption> when it has one.
 */

/** @param {any} node @returns {string} */
function text(node) {
  if (node.type === 'text') return node.value;
  return (node.children ?? []).map(text).join('');
}

/** @param {any} table */
function label(table) {
  const caption = (table.children ?? []).find((c) => c.type === 'element' && c.tagName === 'caption');
  const t = caption ? text(caption).trim() : '';
  return t || 'Table';
}

/** @param {any} node */
function isScroller(node) {
  const cls = node?.properties?.className;
  return node?.type === 'element' && Array.isArray(cls) && cls.includes('table-scroll');
}

/** @param {any} parent */
function walk(parent) {
  const kids = parent.children;
  if (!kids) return;
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i];
    if (node.type !== 'element') continue;
    if (node.tagName === 'table' && !isScroller(parent)) {
      kids[i] = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['table-scroll'], tabIndex: 0, role: 'region', ariaLabel: label(node) },
        children: [node],
      };
      continue;
    }
    walk(node);
  }
}

export default function rehypeTableScroll() {
  return (tree) => walk(tree);
}

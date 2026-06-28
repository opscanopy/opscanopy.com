/**
 * rehype-chapters — reframes a long guide as digestible "chapters" without
 * splitting it. For each H2 section it injects:
 *   - a meta line under the H2: "Section X of Y · ~N min"
 *   - a prev/next pager at the section's end (native #anchor links)
 *
 * Pure structural injection (no content-visibility), so in-page anchor links
 * still land precisely. Content before the first H2 (the intro) is left alone.
 */
import GithubSlugger from 'github-slugger';

function getText(node) {
  if (node.type === 'text') return node.value;
  if (node.children) return node.children.map(getText).join('');
  return '';
}

function wordCount(text) {
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
}

function el(tagName, properties, children) {
  return { type: 'element', tagName, properties, children: children ?? [] };
}
function text(value) {
  return { type: 'text', value };
}

function metaLine(index, total, minutes) {
  return el('p', { className: ['chapter-meta'] }, [
    text(`Section ${index + 1} of ${total} · ~${minutes} min`),
  ]);
}

function pager(index, total, sections) {
  const prev = index > 0 && sections[index - 1].id ? sections[index - 1] : null;
  const next = index < total - 1 && sections[index + 1].id ? sections[index + 1] : null;
  const arrow = (value) => el('span', { className: ['chapter-arrow'], 'aria-hidden': 'true' }, [text(value)]);
  const links = [];
  if (prev) {
    links.push(
      el('a', { className: ['chapter-link', 'chapter-prev'], href: `#${prev.id}` }, [
        el('span', { className: ['chapter-dir'] }, [arrow('← '), text('Previous')]),
        el('span', { className: ['chapter-title'] }, [text(prev.title)]),
      ]),
    );
  }
  if (next) {
    links.push(
      el('a', { className: ['chapter-link', 'chapter-next'], href: `#${next.id}` }, [
        el('span', { className: ['chapter-dir'] }, [text('Next'), arrow(' →')]),
        el('span', { className: ['chapter-title'] }, [text(next.title)]),
      ]),
    );
  }
  if (!links.length) return null;
  // Plain div, NOT <nav>: an inline mid-article pager is not a page-level landmark,
  // and one landmark per section would flood the screen-reader rotor (39-67 per guide).
  return el('div', { className: ['chapter-pager'] }, links);
}

export default function rehypeChapters() {
  return (tree) => {
    // Astro assigns heading ids AFTER user rehype plugins, so they aren't present
    // yet. Assign them here with the same library (github-slugger) over every
    // heading in document order, so our pager hrefs match Astro's final ids and
    // the TOC. If a heading already has an id we keep it.
    const slugger = new GithubSlugger();
    const assignIds = (node) => {
      if (node.type === 'element' && /^h[1-6]$/.test(node.tagName)) {
        node.properties = node.properties || {};
        if (!node.properties.id) node.properties.id = slugger.slug(getText(node));
      }
      if (node.children) for (const c of node.children) assignIds(c);
    };
    assignIds(tree);

    const children = tree.children;

    // Pass 1: split top-level nodes into sections at each H2.
    const leading = [];
    const sections = [];
    let current = null;
    for (const node of children) {
      if (node.type === 'element' && node.tagName === 'h2') {
        current = { h2: node, content: [], id: node.properties?.id ?? '', title: getText(node) };
        sections.push(current);
      } else if (current) {
        current.content.push(node);
      } else {
        leading.push(node);
      }
    }

    if (!sections.length) return; // nothing to chapter-ize

    const total = sections.length;

    // Pass 2: rebuild with injected meta + pager. Skip sections whose H2 has no
    // id (can't link to it) for the pager, but still number them.
    const out = [...leading];
    sections.forEach((s, i) => {
      const minutes = Math.max(1, Math.round(wordCount(getText(s.h2) + ' ' + s.content.map(getText).join(' ')) / 200));
      out.push(s.h2);
      out.push(metaLine(i, total, minutes));
      out.push(...s.content);
      const p = pager(i, total, sections);
      if (p && s.id) out.push(p);
    });

    tree.children = out;
  };
}

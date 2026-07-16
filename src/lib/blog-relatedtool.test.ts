/**
 * Blog relatedTool regression guardrail.
 *
 * Every English blog post (src/content/blog/en/*.md) MUST declare a
 * `relatedTool.href` in its YAML frontmatter that maps to a known tool slug
 * from the registry (src/data/tools.ts) — or to one of the few first-party
 * section hubs (e.g. /mission-90/) a post may promote instead of a tool.
 * This test locks that contract in so the blog→conversion CTA can never
 * silently go missing or point at a dead destination.
 *
 * Parsing: a simple line-based scan between the leading '---' fences.  No
 * extra dependencies — only Node built-ins and vitest.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tools } from '../data/tools';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * This file lives at src/lib/blog-relatedtool.test.ts.
 * The blog posts live at src/content/blog/en/*.md — two directories up from
 * src/lib/, then into content/blog/en/.
 */
const BLOG_EN_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../content/blog/en',
);

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

/**
 * Extract the value of `relatedTool.href` from a blog post's YAML frontmatter.
 *
 * The frontmatter block is delimited by leading and trailing `---` lines.
 * The `relatedTool` key is a YAML mapping object:
 *
 *   relatedTool:
 *     name: "Some Tool"
 *     href: "/some-slug"
 *
 * We locate the `href:` line that follows a `relatedTool:` line and strip any
 * surrounding quotes.  Returns null if the key is absent or the block is not
 * found.
 */
function parseRelatedToolHref(src: string): string | null {
  const lines = src.split('\n');

  // Find the opening fence.
  let fenceStart = -1;
  let fenceEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimEnd() === '---') {
      if (fenceStart === -1) {
        fenceStart = i;
      } else {
        fenceEnd = i;
        break;
      }
    }
  }

  if (fenceStart === -1 || fenceEnd === -1) return null;

  const fm = lines.slice(fenceStart + 1, fenceEnd);

  // Find the `relatedTool:` line then scan for the `href:` key inside its
  // indented block.
  let inRelatedTool = false;
  for (const line of fm) {
    // Top-level `relatedTool:` key (no leading spaces before the key name).
    if (/^relatedTool\s*:/.test(line)) {
      inRelatedTool = true;
      continue;
    }

    if (inRelatedTool) {
      // Any non-indented line ends the relatedTool block.
      if (line.length > 0 && !/^\s/.test(line)) {
        inRelatedTool = false;
        break;
      }

      const hrefMatch = /^\s+href\s*:\s*["']?([^"'\s]+)["']?\s*$/.exec(line);
      if (hrefMatch) {
        return hrefMatch[1];
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Derive valid slug set from the tool registry
// ---------------------------------------------------------------------------

/** Set of valid slugs — every entry in tools.ts regardless of status. */
const validSlugs = new Set(tools.map((t) => t.slug));

/**
 * First-party section hubs a post may use as its conversion CTA instead of a
 * tool (kept deliberately tiny — add entries only for real flagship sections).
 */
const validSectionHrefs = new Set(['/mission-90/']);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('blog/en relatedTool integrity', () => {
  const files = readdirSync(BLOG_EN_DIR).filter((f) => f.endsWith('.md'));

  it('finds at least 1 English blog post', () => {
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  for (const file of files) {
    const filePath = join(BLOG_EN_DIR, file);

    it(`${file}: relatedTool.href is present, non-empty, and maps to a valid tool slug`, () => {
      const src = readFileSync(filePath, 'utf-8');
      const href = parseRelatedToolHref(src);

      expect(
        href,
        `${file}: relatedTool.href is missing or empty in frontmatter`,
      ).toBeTruthy();

      // href is expected to be "/<slug>" — strip the leading slash. Section
      // hubs (e.g. /mission-90/) are matched against the allowlist verbatim.
      const slug = (href as string).replace(/^\//, '');

      expect(
        validSlugs.has(slug) || validSectionHrefs.has(href as string),
        `${file}: relatedTool.href "${href}" matches neither a slug in src/data/tools.ts ` +
          `nor a section hub in validSectionHrefs. ` +
          `Valid slugs: ${[...validSlugs].sort().join(', ')}`,
      ).toBe(true);
    });
  }
});

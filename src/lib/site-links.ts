/**
 * Outbound links the site chrome renders (the footer's Follow row and its
 * open-source line). Component-only: import this from components, never from
 * a page file.
 *
 * Why not in src/data/site.ts: scripts/lastmod-core.mjs dates sitemap URLs by
 * the src/data/* files their page imports, so editing site.ts bumps ~90
 * <lastmod>s (false freshness + IndexNow resubmits). This module only READS the
 * brand constants there, so the JSON-LD `sameAs` set stays byte-identical and
 * no page's lastmod moves.
 */
import { site } from '../data/site';

/** The source repository (the org profile is site.github). */
export const repoUrl = 'https://github.com/opscanopy/opscanopy.com';

export interface SocialLink {
  id: 'github' | 'bluesky' | 'devto' | 'x';
  /** Platform name — the visible text; the component adds the sr-only "OpsCanopy on " prefix. */
  label: string;
  href: string;
  /** Rendered in the footer's Follow row. */
  footer: boolean;
}

/**
 * Own profiles, in FOOTER display order. All four were verified live on
 * 2026-09-27; flip `footer` to false (never delete the entry) if one lapses.
 */
export const socialLinks: SocialLink[] = [
  { id: 'github', label: 'GitHub', href: site.github, footer: true },
  { id: 'bluesky', label: 'Bluesky', href: site.bluesky, footer: true },
  { id: 'devto', label: 'dev.to', href: site.devto, footer: true },
  { id: 'x', label: 'X', href: `https://x.com/${site.twitter.replace(/^@/, '')}`, footer: true },
];

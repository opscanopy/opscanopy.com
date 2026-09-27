/**
 * Footer data contract — the footer is the ONLY inbound link for /changelog/,
 * /contact/, /privacy/ and /terms/ in every locale, and the main one for the
 * Learn guides, /about/ and /security/. These tests pin what getFooter(lang)
 * resolves to so a label or structure edit cannot silently drop a protected
 * target, prefix an English-only route into a 404 (/de/rss.xml, /de/tests/),
 * or change a frozen anchor text.
 *
 * Structure lives once in ./site/en.ts; locales supply footerLabels only.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFooter, footerCells, getSiteContent, type FooterGroup, type FooterGroupId } from './site';
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from './config';
import { localizeNavHref, isEnglishOnlyKey, useTranslations } from './utils';
import deSite from './site/de';
import esSite from './site/es';
import frSite from './site/fr';
import ptBrSite from './site/pt-br';
import enSite from './site/en';
import { getTool } from '../data/tools';
import { site } from '../data/site';
import { repoUrl, socialLinks } from '../lib/site-links';

const NON_EN = LOCALES.filter((l) => l !== DEFAULT_LOCALE);

/** Protected targets (English keys) — every locale's footer must keep them. */
const FROZEN_KEYS = [
  '/changelog/',
  '/contact/',
  '/privacy/',
  '/terms/',
  '/about/',
  '/security/',
  '/learn/',
  '/mission-90/',
  '/learn/roadmaps/devops/',
  '/learn/guides/linux-for-devops/',
  '/learn/guides/docker-for-devops/',
  '/tools/',
  '/blog/',
];

const FEATURED_TOOLS = [
  'subnet-calculator',
  'jwt-decoder',
  'docker-run-to-compose',
  'github-actions-validator',
  'loki-alert-rule-tester',
];

const allLinks = (lang: Locale) => getFooter(lang).flatMap((g) => g.links);
const allHrefs = (lang: Locale) => allLinks(lang).map((l) => l.href);

/** The resolved link for an English page key in a locale's footer. */
const linkFor = (lang: Locale, key: string) => {
  const want = localizeNavHref(key, lang);
  return allLinks(lang).find((l) => l.href === want);
};

const groupFor = (lang: Locale, id: FooterGroupId): FooterGroup | undefined =>
  getFooter(lang).find((g) => g.id === id);

/** The header nav label for a page key, trailing-slash-insensitive. */
const navLabel = (lang: Locale, key: string): string | undefined => {
  const norm = (p: string) => (p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p);
  return getSiteContent(lang).nav.find((n) => norm(n.href) === norm(key))?.label;
};

// --- route-file existence (catches locale-prefixed links to English-only routes)
const PAGES = fileURLToPath(new URL('../pages/', import.meta.url));

function routeExists(href: string): boolean {
  const path = href.split(/[?#]/)[0];
  const segs = path.split('/').filter(Boolean);
  if (segs.length === 0) return existsSync(join(PAGES, 'index.astro'));
  const variants: string[][] = [segs];
  if (isLocale(segs[0]) && segs[0] !== DEFAULT_LOCALE) variants.push(['[lang]', ...segs.slice(1)]);
  return variants.some((v) => {
    const dir = join(PAGES, ...v.slice(0, -1));
    const leaf = v[v.length - 1];
    const direct = [`${leaf}.astro`, `${leaf}.ts`, join(leaf, 'index.astro')];
    if (direct.some((f) => existsSync(join(dir, f)))) return true;
    // A nested content page served by a dynamic route in its parent directory
    // (learn/roadmaps/[slug].astro, learn/guides/[...slug].astro).
    return v.length > 1 && existsSync(dir) && readdirSync(dir).some((f) => /^\[.+\]\.astro$/.test(f));
  });
}

describe('routeExists() self-test (a check that cannot fail proves nothing)', () => {
  it('finds real routes', () => {
    expect(routeExists('/about/')).toBe(true);
    expect(routeExists('/de/about/')).toBe(true);
    expect(routeExists('/de/blog/')).toBe(true);
    expect(routeExists('/rss.xml')).toBe(true);
    expect(routeExists('/learn/roadmaps/devops/')).toBe(true);
  });

  it('rejects locale-prefixed English-only routes', () => {
    expect(routeExists('/de/rss.xml')).toBe(false);
    expect(routeExists('/de/tests/')).toBe(false);
    expect(routeExists('/de/learn/')).toBe(false);
    expect(routeExists('/fr/learn/roadmaps/devops/')).toBe(false);
    expect(routeExists('/es/changelog/')).toBe(false);
  });
});

describe('getFooter() — protected targets', () => {
  it.each(LOCALES)('(a) %s keeps every protected target and the 5 featured tools', (lang) => {
    const got = new Set(allHrefs(lang));
    const keys = [...FROZEN_KEYS, ...FEATURED_TOOLS.map((s) => `/${s}`)];
    for (const key of keys) {
      expect(got.has(localizeNavHref(key, lang)), `${lang}: ${key}`).toBe(true);
    }
  });

  it.each(LOCALES)('%s adds Practice tests and the RSS feed', (lang) => {
    const got = new Set(allHrefs(lang));
    expect(got.has('/tests/')).toBe(true);
    expect(got.has('/rss.xml')).toBe(true);
  });

  it.each(LOCALES)('%s drops only the sanctioned links (/#why, Source on GitHub)', (lang) => {
    for (const link of allLinks(lang)) {
      expect(link.href).not.toMatch(/#why/);
      expect(link.href).not.toMatch(/^https?:\/\//);
      expect(link.href).not.toMatch(/sitemap/);
      expect(link.external).toBe(false);
    }
  });

  it.each(LOCALES)('%s: every internal link resolves to a real route file', (lang) => {
    for (const href of allHrefs(lang)) {
      expect(routeExists(href), `${lang}: ${href}`).toBe(true);
    }
  });

  it.each(LOCALES)('(g) %s has no duplicate hrefs', (lang) => {
    const hrefs = allHrefs(lang);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it.each(LOCALES)('(h) %s links /rss.xml unprefixed, never /<lang>/rss.xml', (lang) => {
    const hrefs = allHrefs(lang);
    expect(hrefs).toContain('/rss.xml');
    expect(hrefs.some((h) => h.endsWith('rss.xml') && h !== '/rss.xml')).toBe(false);
  });
});

describe('getFooter() — structure', () => {
  it('English has the five groups in IA order, Legal stacked under Company', () => {
    const groups = getFooter('en');
    expect(groups.map((g) => g.id)).toEqual(['tools', 'learn', 'resources', 'company', 'legal']);
    expect(groups.map((g) => g.stack === true)).toEqual([false, false, false, false, true]);
  });

  it.each(NON_EN)('(b) %s has identical group ids/order and href order to English', (lang) => {
    const en = getFooter('en');
    const loc = getFooter(lang);
    expect(loc.map((g) => g.id)).toEqual(en.map((g) => g.id));
    expect(loc.map((g) => g.stack === true)).toEqual(en.map((g) => g.stack === true));
    expect(loc.map((g) => g.links.map((l) => l.href))).toEqual(
      en.map((g) => g.links.map((l) => localizeNavHref(l.href, lang))),
    );
  });

  it.each(LOCALES)('(c) %s footerCells() packs the groups into exactly 4 cells', (lang) => {
    const cells = footerCells(getFooter(lang));
    expect(cells).toHaveLength(4);
    expect(cells.map((c) => c.map((g) => g.id))).toEqual([
      ['tools'],
      ['learn'],
      ['resources'],
      ['company', 'legal'],
    ]);
  });

  it('footerCells() joins a stack group to the previous cell, and starts a cell when there is none', () => {
    const g = (id: FooterGroupId, stack?: boolean): FooterGroup => ({ id, title: id, stack, links: [] });
    expect(footerCells([g('tools'), g('learn', true), g('legal')]).map((c) => c.map((x) => x.id))).toEqual([
      ['tools', 'learn'],
      ['legal'],
    ]);
    expect(footerCells([g('legal', true), g('tools')]).map((c) => c.map((x) => x.id))).toEqual([
      ['legal'],
      ['tools'],
    ]);
    expect(footerCells([])).toEqual([]);
  });
});

describe('getFooter() — labels', () => {
  /** Frozen anchor + title strings, exactly as they ship today. */
  const FROZEN: Record<Locale, { links: Record<string, string>; titles: Partial<Record<FooterGroupId, string>> }> = {
    en: {
      links: {
        '/tools': 'All tools',
        '/loki-alert-rule-tester': 'Loki Alert Rule Tester',
        '/learn': 'All guides',
        '/mission-90/': '90 Days DevOps',
        '/tests': 'Practice tests',
        '/blog': 'Blog',
        '/rss.xml': 'RSS feed',
        '/about': 'About',
        '/contact': 'Contact',
        '/security': 'Security',
        '/privacy': 'Privacy',
        '/terms': 'Terms',
      },
      titles: { tools: 'Tools', learn: 'Learn', resources: 'Resources', company: 'Company', legal: 'Legal' },
    },
    de: {
      links: {
        '/about': 'Über uns',
        '/contact': 'Kontakt',
        '/security': 'Sicherheit',
        '/privacy': 'Datenschutz',
        '/terms': 'Nutzungsbedingungen',
        '/tools': 'Alle Tools',
      },
      titles: { tools: 'Tools', resources: 'Ressourcen', company: 'Unternehmen', legal: 'Rechtliches' },
    },
    es: {
      links: {
        '/about': 'Acerca de',
        '/contact': 'Contacto',
        '/security': 'Seguridad',
        '/privacy': 'Privacidad',
        '/terms': 'Términos',
        '/tools': 'Todas las herramientas',
      },
      titles: { tools: 'Herramientas', resources: 'Recursos', company: 'Empresa', legal: 'Legal' },
    },
    fr: {
      links: {
        '/about': 'À propos',
        '/contact': 'Contact',
        '/security': 'Sécurité',
        '/privacy': 'Confidentialité',
        '/terms': 'Conditions d’utilisation',
        '/tools': 'Tous les outils',
      },
      titles: { tools: 'Outils', resources: 'Ressources', company: 'Entreprise', legal: 'Mentions légales' },
    },
    'pt-br': {
      links: {
        '/about': 'Sobre',
        '/contact': 'Contato',
        '/security': 'Segurança',
        '/privacy': 'Privacidade',
        '/terms': 'Termos',
        '/tools': 'Todas as ferramentas',
      },
      titles: { tools: 'Ferramentas', resources: 'Recursos', company: 'Empresa', legal: 'Legal' },
    },
  };

  /** English-only targets that keep their English anchor in every locale. */
  const ENGLISH_ANCHORS: Record<string, string> = {
    // /learn keeps its footer anchor: the header's "Learn" is a different word.
    '/learn': 'All guides',
    '/learn/roadmaps/devops': 'DevOps roadmap',
    '/learn/guides/linux-for-devops': 'Linux for DevOps',
    '/learn/guides/docker-for-devops': 'Docker for DevOps',
    '/changelog': 'Changelog',
    '/rss.xml': 'RSS feed',
  };

  it.each(LOCALES)('(d) %s frozen anchor labels and group titles are exact', (lang) => {
    for (const [key, label] of Object.entries(FROZEN[lang].links)) {
      expect(linkFor(lang, key)?.label, `${lang}: ${key}`).toBe(label);
    }
    for (const [id, title] of Object.entries(FROZEN[lang].titles)) {
      expect(groupFor(lang, id as FooterGroupId)?.title, `${lang}: ${id}`).toBe(title);
    }
    for (const [key, label] of Object.entries(ENGLISH_ANCHORS)) {
      expect(linkFor(lang, key)?.label, `${lang}: ${key}`).toBe(label);
    }
  });

  it.each(LOCALES)('%s labels carry no soft hyphen or zero-width characters (frozen anchors)', (lang) => {
    for (const link of allLinks(lang)) {
      expect(link.label, `${lang}: ${link.href}`).not.toMatch(/[­​-‍⁠﻿]/);
      expect(link.label.trim()).toBe(link.label);
      expect(link.label.length).toBeGreaterThan(0);
    }
  });

  it.each(NON_EN)('%s: a target whose footer label is the nav word uses the header nav label', (lang) => {
    for (const key of ['/mission-90/', '/tests', '/blog']) {
      const nav = navLabel(lang, key);
      expect(nav, `${lang} nav: ${key}`).toBeDefined();
      expect(linkFor(lang, key)?.label, `${lang}: ${key}`).toBe(nav);
    }
    expect(linkFor(lang, '/tests')?.label).toBe(navLabel(lang, '/tests'));
    // A different nav word never replaces the footer anchor.
    expect(linkFor(lang, '/learn')?.label).toBe('All guides');
    expect(linkFor(lang, '/learn')?.lang).toBe('en');
  });

  it('de Practice tests reads "Übungstests" (header nav label)', () => {
    expect(linkFor('de', '/tests')?.label).toBe('Übungstests');
  });

  it.each(LOCALES)('%s brand tool links: English tool name, translate=no, lang=en off English pages', (lang) => {
    const brand = allLinks(lang).filter((l) => l.translate === 'no');
    expect(brand.map((l) => l.href)).toEqual(FEATURED_TOOLS.map((s) => localizeNavHref(`/${s}`, lang)));
    for (const [i, link] of brand.entries()) {
      const tool = getTool(FEATURED_TOOLS[i]);
      expect(tool?.status).toBe('live');
      const english = linkFor('en', `/${FEATURED_TOOLS[i]}`)?.label;
      expect(link.label).toBe(english);
      // The anchor is the tool's H1 name, or a prefix of its registry name
      // ("JWT Decoder" of "JWT Decoder & Encoder").
      const official = tool?.h1Name ?? tool?.name ?? '';
      expect(official === link.label || (tool?.name ?? '').startsWith(link.label), link.label).toBe(true);
      expect(link.lang).toBe(lang === DEFAULT_LOCALE ? undefined : 'en');
    }
  });

  it('the Loki link uses the tool H1 name from the registry', () => {
    expect(linkFor('en', '/loki-alert-rule-tester')?.label).toBe(getTool('loki-alert-rule-tester')?.h1Name);
  });

  it.each(NON_EN)('(e) %s: English-only targets unprefixed with lang=en; the rest prefixed', (lang) => {
    const en = allLinks('en');
    const loc = allLinks(lang);
    expect(loc).toHaveLength(en.length);
    for (const [i, link] of loc.entries()) {
      const enHref = en[i].href;
      if (isEnglishOnlyKey(enHref)) {
        expect(link.href, `${lang}: ${enHref}`).toBe(enHref);
        expect(link.href.startsWith(`/${lang}/`)).toBe(false);
        // lang="en" marks English text. The one English-only target whose
        // label IS translated (Practice tests → the header's "Übungstests")
        // must not claim to be English — that would be a WCAG 3.1.2 failure.
        const translated = link.label !== en[i].label && link.label !== navLabel(DEFAULT_LOCALE, enHref);
        expect(link.lang, `${lang}: ${enHref} "${link.label}"`).toBe(translated ? undefined : 'en');
      } else {
        expect(link.href.startsWith(`/${lang}/`), `${lang}: ${link.href}`).toBe(true);
        expect(link.lang, `${lang}: ${link.href}`).toBe(link.translate === 'no' ? 'en' : undefined);
      }
    }
  });

  it.each(NON_EN)('(e) %s: only /tests carries a translated label among English-only targets', (lang) => {
    const unmarked = allLinks(lang).filter((l) => isEnglishOnlyKey(l.href) && l.lang !== 'en');
    expect(unmarked.map((l) => l.href)).toEqual(['/tests/']);
  });

  it('English pages never set lang on a link (the page is already English)', () => {
    for (const link of allLinks('en')) expect(link.lang).toBeUndefined();
  });

  it.each(LOCALES)('(f) %s label lengths: English/brand ≤ 26 chars, localized ≤ 40', (lang) => {
    for (const link of allLinks(lang)) {
      const english = lang === DEFAULT_LOCALE || link.lang === 'en' || link.translate === 'no';
      expect(link.label.length, `${lang}: "${link.label}"`).toBeLessThanOrEqual(english ? 26 : 40);
    }
  });

  it.each(LOCALES)('%s internal links carry no rel/target', (lang) => {
    for (const link of allLinks(lang)) {
      expect(link.rel).toBeUndefined();
      expect(link.target).toBeUndefined();
    }
  });

  it('Learn: title "Learn" everywhere; lang=en + "In English" caption off English pages', () => {
    const en = groupFor('en', 'learn');
    expect(en?.title).toBe('Learn');
    expect(en?.titleLang).toBeUndefined();
    expect(en?.caption).toBeUndefined();
    for (const lang of NON_EN) {
      const g = groupFor(lang, 'learn');
      expect(g?.title, lang).toBe('Learn');
      expect(g?.titleLang, lang).toBe('en');
      expect(g?.caption, lang).toBe(useTranslations(lang)('footer.inEnglish'));
      expect(g?.caption, lang).not.toBe('In English');
    }
  });

  it.each(LOCALES)('%s: every group other than Learn has a localized title and no caption', (lang) => {
    for (const g of getFooter(lang)) {
      if (g.id === 'learn') continue;
      expect(g.titleLang, `${lang}: ${g.id}`).toBeUndefined();
      expect(g.caption, `${lang}: ${g.id}`).toBeUndefined();
      expect(g.title.length).toBeGreaterThan(0);
    }
  });
});

describe('locale site files supply labels only', () => {
  const LOCALE_FILES = { de: deSite, es: esSite, fr: frSite, 'pt-br': ptBrSite } as const;
  const enHrefs = new Set(enSite.footer.flatMap((g) => g.links.map((l) => l.href)));
  const enIds = new Set(enSite.footer.map((g) => g.id));

  it.each(Object.entries(LOCALE_FILES))('%s has no footer structure of its own', (_lang, file) => {
    expect('footer' in file).toBe(false);
    expect(file.footerLabels).toBeDefined();
  });

  it.each(Object.entries(LOCALE_FILES))('%s footerLabels keys all exist in the English structure', (lang, file) => {
    for (const key of Object.keys(file.footerLabels?.links ?? {})) {
      expect(enHrefs.has(key as never), `${lang}: ${key}`).toBe(true);
    }
    for (const id of Object.keys(file.footerLabels?.titles ?? {})) {
      expect(enIds.has(id as never), `${lang}: ${id}`).toBe(true);
    }
  });
});

describe('site-links', () => {
  it('points the repo link at the source repository', () => {
    expect(repoUrl).toBe('https://github.com/opscanopy/opscanopy.com');
  });

  it('lists the four verified profiles in footer display order', () => {
    expect(socialLinks.map((s) => s.id)).toEqual(['github', 'bluesky', 'devto', 'x']);
    expect(socialLinks.map((s) => s.label)).toEqual(['GitHub', 'Bluesky', 'dev.to', 'X']);
    expect(socialLinks.map((s) => s.href)).toEqual([
      site.github,
      site.bluesky,
      site.devto,
      'https://x.com/opscanopy',
    ]);
    for (const s of socialLinks) {
      expect(s.footer).toBe(true);
      expect(s.href).toMatch(/^https:\/\//);
    }
  });
});

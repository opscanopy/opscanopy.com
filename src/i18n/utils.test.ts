/**
 * Pins localizeKey/localizeNavHref's trailing-slash + locale-prefix contract.
 * astro.config.mjs uses the default build.format ("directory"), so every
 * built route is served at a trailing slash EXCEPT file-extension routes
 * (rss.xml, feed.xml) and in-page anchors — regressing either rule here would
 * ship a link that 404s or 308-hops on the static host. See withTrailingSlash's
 * doc comment in utils.ts for the rules this test locks in.
 */
import { describe, it, expect } from 'vitest';
import {
  localizeKey,
  localizeNavHref,
  isEnglishOnlyKey,
  isCurrentKey,
  shouldShowLangSwitcher,
  ENGLISH_ONLY_FILES,
  LOCALES,
  useTranslations,
} from './utils';

describe('localizeKey()', () => {
  it('adds a trailing slash to a bare English key', () => {
    expect(localizeKey('/tools', 'en')).toBe('/tools/');
  });

  it('prefixes and slashes a bare key for a non-English locale', () => {
    expect(localizeKey('/tools', 'de')).toBe('/de/tools/');
  });

  it('keeps the English root as just "/"', () => {
    expect(localizeKey('/', 'en')).toBe('/');
  });

  it('slashes the localized root as "/de/", never bare "/de"', () => {
    expect(localizeKey('/', 'de')).toBe('/de/');
  });

  it('does not double a trailing slash already present', () => {
    expect(localizeKey('/tools/', 'en')).toBe('/tools/');
    expect(localizeKey('/tools/', 'de')).toBe('/de/tools/');
  });

  it('accepts a key without a leading slash', () => {
    expect(localizeKey('tools', 'en')).toBe('/tools/');
  });

  it.each(['/rss.xml', '/mission-90/feed.xml'])(
    'never adds a trailing slash to a file-extension key: %s',
    (fileKey) => {
      expect(localizeKey(fileKey, 'en')).toBe(fileKey);
    },
  );

  it('locale-prefixes a file-extension key without adding a trailing slash', () => {
    expect(localizeKey('/rss.xml', 'de')).toBe('/de/rss.xml');
  });

  it('never adds a trailing slash to an in-page anchor', () => {
    expect(localizeKey('/#why', 'en')).toBe('/#why');
  });

  it('locale-prefixes an in-page anchor without adding a trailing slash', () => {
    expect(localizeKey('/#why', 'de')).toBe('/de/#why');
  });

  it('slashes the path BEFORE a fragment or query, never after it', () => {
    expect(localizeKey('/cidr-checker#ip=10.0.0.1', 'en')).toBe('/cidr-checker/#ip=10.0.0.1');
    expect(localizeKey('/cidr-checker#ip=10.0.0.1', 'de')).toBe('/de/cidr-checker/#ip=10.0.0.1');
    expect(localizeKey('/search?q=cron', 'fr')).toBe('/fr/search/?q=cron');
    expect(localizeKey('/tools/#section', 'en')).toBe('/tools/#section');
    expect(localizeKey('/rss.xml#top', 'en')).toBe('/rss.xml#top');
  });
});

describe('localizeNavHref()', () => {
  it('leaves English-only sections unprefixed for every locale, still slashed', () => {
    for (const locale of ['en', 'de', 'es', 'fr', 'pt-br'] as const) {
      expect(localizeNavHref('/learn', locale)).toBe('/learn/');
      expect(localizeNavHref('/mission-90', locale)).toBe('/mission-90/');
    }
  });

  it('localizes /search like any other page — it has a real page per locale, unlike /learn or /mission-90', () => {
    expect(localizeNavHref('/search', 'en')).toBe('/search/');
    expect(localizeNavHref('/search', 'de')).toBe('/de/search/');
    expect(localizeNavHref('/search', 'fr')).toBe('/fr/search/');
  });

  it('leaves nested paths under an English-only section unprefixed', () => {
    expect(localizeNavHref('/mission-90/day-1', 'de')).toBe('/mission-90/day-1/');
    expect(localizeNavHref('/learn/networking', 'fr')).toBe('/learn/networking/');
  });

  it('does not add a trailing slash to a file route under an English-only section', () => {
    expect(localizeNavHref('/mission-90/feed.xml', 'de')).toBe('/mission-90/feed.xml');
  });

  it('only matches an English-only section at a path boundary, not by prefix', () => {
    // A hypothetical "/learn-more" key must NOT be swept into the unprefixed
    // English-only treatment just because it starts with the same characters
    // as "/learn" — it should localize normally, like any other section.
    expect(localizeNavHref('/learn-more', 'de')).toBe('/de/learn-more/');
  });

  it('localizes a normal (non-English-only) section like localizeKey', () => {
    expect(localizeNavHref('/tools', 'de')).toBe('/de/tools/');
    expect(localizeNavHref('/tools', 'en')).toBe('/tools/');
  });
});

describe('localizeNavHref() — English-only files', () => {
  it.each(LOCALES)('leaves /rss.xml unprefixed and unslashed for %s (the feed is English-only)', (locale) => {
    expect(localizeNavHref('/rss.xml', locale)).toBe('/rss.xml');
  });

  it('still leaves other English-only sections unprefixed', () => {
    expect(localizeNavHref('/tests', 'de')).toBe('/tests/');
    expect(localizeNavHref('/changelog', 'pt-br')).toBe('/changelog/');
  });

  it('still prefixes a file route that is not English-only', () => {
    // localizeNavHref only special-cases the listed files, not every file key.
    expect(localizeNavHref('/blog/feed.xml', 'de')).toBe('/de/blog/feed.xml');
  });
});

describe('isEnglishOnlyKey()', () => {
  it('lists /rss.xml as the only English-only file', () => {
    expect([...ENGLISH_ONLY_FILES]).toEqual(['/rss.xml']);
  });

  it.each([
    ['/learn', true],
    ['/learn/', true],
    ['/learn/guides/linux-for-devops', true],
    ['/mission-90', true],
    ['/mission-90/', true],
    ['/mission-90/feed.xml', true],
    ['/changelog', true],
    ['/changelog/', true],
    ['/tests', true],
    ['/tests/aws/dop-c02-set-1/', true],
    ['/rss.xml', true],
    ['learn', true],
    ['/learn-more', false],
    ['/testsuite', false],
    ['/tools', false],
    ['/blog', false],
    ['/search', false],
    ['/', false],
    ['/rss.xml/', false],
    ['/blog/rss.xml', false],
    ['/de/learn', false],
  ] as const)('%s → %s', (key, expected) => {
    expect(isEnglishOnlyKey(key)).toBe(expected);
  });
});

describe('isCurrentKey()', () => {
  it.each([
    ['/tools', '/tools/', true],
    ['/tools', '/tools', true],
    ['/tools/', '/tools', true],
    ['/tools', '/de/tools/', true],
    ['/blog', '/es/blog/', true],
    ['/subnet-calculator', '/pt-br/subnet-calculator/', true],
    ['/mission-90/', '/mission-90/', true],
    ['/learn', '/learn/', true],
    ['/', '/', true],
    ['/', '/de/', true],
    ['/', '/de', true],
    ['/tools', '/tools/subnet/', false],
    ['/tools', '/', false],
    ['/', '/tools/', false],
    ['/about', '/de/contact/', false],
    ['/learn', '/learn/guides/linux-for-devops/', false],
    ['https://github.com/opscanopy', '/', false],
  ] as const)('isCurrentKey(%s, %s) → %s', (key, pathname, expected) => {
    expect(isCurrentKey(key, pathname)).toBe(expected);
  });
});

describe('shouldShowLangSwitcher()', () => {
  it.each([
    [undefined, undefined, true],
    [false, undefined, true],
    [true, undefined, false],
    [true, ['en', 'de'], false],
    [false, ['en', 'de'], true],
    [undefined, [...LOCALES], true],
    [false, ['en'], false],
    [false, [], false],
  ] as const)('noAlternates=%s available=%j → %s', (noAlternates, available, expected) => {
    expect(shouldShowLangSwitcher(noAlternates, available ? [...available] : undefined)).toBe(expected);
  });
});

describe('theme toggle names contain their visible label (WCAG 2.5.3 label in name)', () => {
  // The mobile toggle shows t('theme.dark') / t('theme.light') as text and
  // carries t('a11y.themeToDark') / t('a11y.themeToLight') as its aria-label
  // (Header.astro); speech-input users say the visible words to activate it.
  it.each(LOCALES)('%s', (locale) => {
    const t = useTranslations(locale);
    expect(t('a11y.themeToDark').toLocaleLowerCase(locale)).toContain(t('theme.dark').toLocaleLowerCase(locale));
    expect(t('a11y.themeToLight').toLocaleLowerCase(locale)).toContain(t('theme.light').toLocaleLowerCase(locale));
  });
});

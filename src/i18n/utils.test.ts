/**
 * Pins localizeKey/localizeNavHref's trailing-slash + locale-prefix contract.
 * astro.config.mjs uses the default build.format ("directory"), so every
 * built route is served at a trailing slash EXCEPT file-extension routes
 * (rss.xml, feed.xml) and in-page anchors — regressing either rule here would
 * ship a link that 404s or 308-hops on the static host. See withTrailingSlash's
 * doc comment in utils.ts for the rules this test locks in.
 */
import { describe, it, expect } from 'vitest';
import { localizeKey, localizeNavHref } from './utils';

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
});

describe('localizeNavHref()', () => {
  it('leaves English-only sections unprefixed for every locale, still slashed', () => {
    for (const locale of ['en', 'de', 'es', 'fr', 'pt-br'] as const) {
      expect(localizeNavHref('/learn', locale)).toBe('/learn/');
      expect(localizeNavHref('/mission-90', locale)).toBe('/mission-90/');
      expect(localizeNavHref('/search', locale)).toBe('/search/');
    }
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

/**
 * J8 — Locale boot.
 *
 * The localized pages under `src/pages/{de,es,fr,pt-br}/` import the SAME
 * playground component as the English page, and playground UI strings are
 * English in every locale by design (CLAUDE.md, "Localized pages"). So the
 * German page must render the ENGLISH hint line verbatim. Two failure modes this
 * catches:
 *
 *   - a locale page that forgot to import the playground (page renders, tool
 *     does not) — caught by asserting the seeded result;
 *   - someone "helpfully" translating the hint line in one locale, which
 *     silently breaks the contract's single pinned string — caught by asserting
 *     `HINT_LINE` byte-for-byte (the dash is U+2014, copied out of
 *     CidrCheckerPlayground.astro).
 *
 * `getByText` normalizes whitespace, which is what we want: the source wraps the
 * sentence across lines inside its `<p>`, so the DOM text carries newlines and
 * indentation that are not part of the string.
 */
import { expect, test } from '@playwright/test';
import { HINT_LINE, SEL, openTool, resultsOf } from './_shared';
import { TOOL_FIXTURES } from './tools.fixtures';

const LOCALE = 'de';

test.describe('J8 locale boot', () => {
  for (const fixture of TOOL_FIXTURES) {
    test(`${fixture.slug}: /${LOCALE}/ boots the tool with the English hint line`, async ({
      page,
    }) => {
      await openTool(page, fixture, { locale: LOCALE });

      await expect(page.locator('html')).toHaveAttribute('lang', LOCALE);

      // The island really booted and the engine really ran — for `cm-wasm` this
      // also proves the hashed WASM asset resolves from a locale-prefixed path.
      await expect(resultsOf(page, fixture)).toContainText(fixture.seededResultString);

      const hint = page.locator(SEL.playground).getByText(HINT_LINE);
      await expect(
        hint.first(),
        'the hint line stays English in every locale, byte-for-byte',
      ).toBeVisible();

      // Deep-link fragments must keep working under a locale prefix.
      if (fixture.hashKey !== null) {
        const chips = page.locator(SEL.chips);
        await chips.nth(1).click();
        await expect
          .poll(() => page.evaluate(() => window.location.hash))
          .toContain(fixture.hashKey);
        expect(page.url()).toContain(`/${LOCALE}/${fixture.slug}/`);
      }
    });
  }
});

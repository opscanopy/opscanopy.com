/**
 * J1 — First visit → copy → analytics, with consent BOTH ways.
 *
 * The point of this journey is to pin the GA4 Consent Mode v2 model the site
 * actually implements (Layout.astro), because it looks like a bug at first
 * glance and someone will eventually "fix" it:
 *
 *   - `gtag('consent','default', {analytics_storage:'denied', …})` is pushed on
 *     EVERY visit, before `config`, so gtag.js never sets `_ga` cookies for a
 *     non-consented visitor.
 *   - `gtag('consent','update', {analytics_storage:'granted'})` is pushed ONLY
 *     when `localStorage['oc-analytics-consent'] === 'granted'`.
 *   - `result_copied` and `tool_engaged` fire REGARDLESS of consent. Under
 *     Consent Mode v2 a denied visitor still sends cookieless pings — the
 *     consent signal governs storage, not whether events exist. So the denied
 *     run asserting a `result_copied` push is CORRECT, not a leak: no cookie is
 *     written, no identifier is stored, and dropping the event would silently
 *     under-report the whole site. Anyone "fixing" this must change
 *     Layout.astro's model first, not this assertion.
 *
 * googletagmanager.com is route-blocked, so the suite needs no network: the
 * inline shim defines `gtag`/`dataLayer` on its own.
 */
import { expect, test } from '@playwright/test';
import {
  SEL,
  consentPayloads,
  gaEventNames,
  openTool,
  readDataLayer,
  resultsOf,
  seedConsent,
  type ConsentState,
} from './_shared';
import { TOOL_FIXTURES } from './tools.fixtures';

const CONSENT_RUNS: ConsentState[] = ['granted', 'absent'];

test.describe('J1 first visit → copy → analytics', () => {
  for (const fixture of TOOL_FIXTURES) {
    for (const consent of CONSENT_RUNS) {
      test(`${fixture.slug}: seeded result copies and reports (consent: ${consent})`, async ({
        page,
        context,
      }) => {
        await seedConsent(context, consent);
        await openTool(page, fixture);

        // 1. First visit renders a real result with no interaction at all — the
        //    boot seed (first example) evaluates without writing the hash.
        const results = resultsOf(page, fixture);
        await expect(results).toContainText(fixture.seededResultString);
        await expect(page.locator(SEL.summaryStatus).first()).not.toBeEmpty();

        // 2. Copy a single row, then Copy all. Both live inside #playground, so
        //    both must reach Layout.astro's capture-phase click listener.
        const copyRow = page.locator(SEL.copyRow).first();
        await expect(copyRow).toBeVisible();
        await copyRow.click();
        await expect(page.locator(SEL.copyStatus).first()).toContainText(/copied/i);

        const copyAll = page.locator(SEL.copyAll).first();
        await expect(copyAll).toBeVisible();
        await copyAll.click();
        await expect(page.locator(SEL.copyStatus).first()).toContainText(/copied/i);

        // 3. Consent model.
        const dataLayer = await readDataLayer(page);
        const defaults = consentPayloads(dataLayer, 'default');
        const updates = consentPayloads(dataLayer, 'update');

        expect(defaults.length, 'consent default must be pushed on every visit').toBeGreaterThan(0);
        expect(defaults[0]).toMatchObject({
          analytics_storage: 'denied',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied',
        });

        const granted = updates.filter((p) => p.analytics_storage === 'granted');
        if (consent === 'granted') {
          expect(granted.length, 'opted-in visitor must get a consent update').toBeGreaterThan(0);
        } else {
          expect(granted, 'no consent stored ⇒ analytics_storage must stay denied').toHaveLength(0);
        }

        // 4. The deliberate part: events fire either way (cookieless ping).
        const events = gaEventNames(dataLayer);
        expect(events, 'first interaction in #playground must report engagement').toContain(
          'tool_engaged',
        );
        expect(
          events,
          'Consent Mode v2: result_copied fires cookieless even when denied — see this file’s header',
        ).toContain('result_copied');
      });
    }
  }
});

/**
 * Two tools quote engine constants in their FAQ prose (rule counts, input caps,
 * the pinned Grafana version). When the FAQs lived in each page's frontmatter
 * those numbers were interpolated at build time; the registry freezes the
 * rendered strings instead, so this test is what keeps them honest: if a rule
 * is added or a cap changes, the prose must be updated in all five locales.
 *
 * Numbers are language-independent, so every locale is checked for the bare
 * figures; the English text is additionally checked for the exact en-US
 * formatted forms the page used to produce.
 */
import { describe, it, expect } from 'vitest';
import { LOCALES } from '../i18n/config';
import { toolFaqs } from './tool-faqs';
import { MAX_FINDINGS_PER_RULE, MAX_FINDINGS_TOTAL, MAX_INPUT_CHARS as SYSTEMD_MAX_INPUT } from '../lib/systemd-lint/engine';
import { CHECK_IDS } from '../lib/systemd-lint/rules';
import { ALL_DIRECTIVE_NAMES } from '../lib/systemd-lint/directives';
import {
  MAX_DIAGNOSTICS_PER_RULE,
  MAX_DIAGNOSTICS_TOTAL,
  MAX_INPUT_CHARS as GRAFANA_MAX_INPUT,
} from '../lib/grafana-dashboard-validator/engine';
import { RULE_SEVERITY } from '../lib/grafana-dashboard-validator/rules';
import { GRAFANA_RULES_VERSION, KNOWN_SCHEMA_VERSION, RULE_IDS } from '../lib/grafana-dashboard-validator/types';

const joined = (slug: string, lang: (typeof LOCALES)[number]) => toolFaqs(slug, lang).map((f) => f.a).join('\n');

describe('systemd-unit-validator FAQ numbers match the engine', () => {
  const en = joined('systemd-unit-validator', 'en');
  it('quotes the check count, directive count and caps (en, formatted)', () => {
    expect(en).toContain(`${CHECK_IDS.length} checks over a real parse`);
    expect(en).toContain(`${ALL_DIRECTIVE_NAMES.length} names`);
    expect(en).toContain(`Up to ${SYSTEMD_MAX_INPUT.toLocaleString('en-US')} characters`);
    expect(en).toContain(`${MAX_FINDINGS_PER_RULE} per check`);
    expect(en).toContain(`${MAX_FINDINGS_TOTAL} in total`);
  });
  for (const lang of LOCALES) {
    it(`${lang}: carries the same bare figures`, () => {
      const text = joined('systemd-unit-validator', lang);
      for (const n of [CHECK_IDS.length, ALL_DIRECTIVE_NAMES.length, MAX_FINDINGS_PER_RULE, MAX_FINDINGS_TOTAL]) {
        expect(text, `${n} missing in ${lang}`).toContain(String(n));
      }
    });
  }
});

describe('grafana-dashboard-validator FAQ numbers match the engine', () => {
  const en = joined('grafana-dashboard-validator', 'en');
  const errors = RULE_IDS.filter((id) => RULE_SEVERITY[id] === 'error').length;
  const warnings = RULE_IDS.filter((id) => RULE_SEVERITY[id] === 'warning').length;
  const notes = RULE_IDS.filter((id) => RULE_SEVERITY[id] === 'info').length;
  it('quotes the rule counts, the pinned version and caps (en, formatted)', () => {
    expect(en).toContain(`${RULE_IDS.length} rules over a real parse`);
    expect(en).toContain(`${errors} errors, ${warnings} warnings and ${notes} notes`);
    expect(en).toContain(`pinned to ${GRAFANA_RULES_VERSION}`);
    expect(en).toContain(`higher than ${KNOWN_SCHEMA_VERSION}`);
    expect(en).toContain(`Up to ${GRAFANA_MAX_INPUT.toLocaleString('en-US')} characters`);
    expect(en).toContain(`${MAX_DIAGNOSTICS_PER_RULE} per rule and ${MAX_DIAGNOSTICS_TOTAL} in total`);
  });
  for (const lang of LOCALES) {
    it(`${lang}: carries the same bare figures and version`, () => {
      const text = joined('grafana-dashboard-validator', lang);
      for (const n of [RULE_IDS.length, errors, warnings, notes, KNOWN_SCHEMA_VERSION, MAX_DIAGNOSTICS_PER_RULE, MAX_DIAGNOSTICS_TOTAL]) {
        expect(text, `${n} missing in ${lang}`).toContain(String(n));
      }
      expect(text).toContain(GRAFANA_RULES_VERSION);
    });
  }
});

import { describe, it } from 'vitest';
import { split } from './subnet-splitter/engine';
import { check } from './cidr-checker/engine';
import { calculate } from './subnet-calculator/engine';

const log = (...a: unknown[]) => console.log(...a);

describe('audit probe 2', () => {
  it('splitter silent-null holes', () => {
    // Bare parent (defaults /32) — playground regex /\/(\d+)$/ does not match, so no guard fires.
    log('bare parent, newPrefix 24:', JSON.stringify(split('10.0.0.0', '', 24)));
    // newPrefix beyond the family width — playground guard only compares to parent prefix.
    log('parent /24, newPrefix 33:', JSON.stringify(split('10.0.0.0/24', '', 33)));
    log('parent /24, newPrefix 26 (control):', JSON.stringify(split('10.0.0.0/24', '', 26).split?.subnets?.length));
    // NaN newPrefix (empty-ish / junk in the number box)
    log('parent /24, newPrefix NaN:', JSON.stringify(split('10.0.0.0/24', '', Number('x'))));
  });

  it('splitter cap', () => {
    const r = split('10.0.0.0/16', '', 26);
    log('/16 -> /26 total:', r.split?.total, 'truncated:', r.split?.truncated, 'shown:', r.split?.subnets.length);
    const r2 = split('10.0.0.0/16', '', 24);
    log('/16 -> /24 total:', r2.split?.total, 'truncated:', r2.split?.truncated, 'shown:', r2.split?.subnets.length);
  });

  it('cidr checker with a bogus v6 that ip-core accepts', () => {
    const r = check(['10.0.0.0/8', '1.2.3.4::/32', '1.2.3.4::5'].join('\n'));
    log(JSON.stringify(r.entries));
    log('agg:', JSON.stringify(r.aggregated));
  });

  it('subnet calculator with the bogus v6', () => {
    const r = calculate('1.2.3.4::/64');
    log(JSON.stringify({ valid: r.valid, title: r.title, summary: r.summary, error: r.error, note: r.note }));
  });
});

import { describe, it, expect } from 'vitest';
import { check } from './engine';
import { examples } from './examples';

describe('cidr-checker check()', () => {
  describe('aggregation — minimal covering set', () => {
    it('collapses four adjacent /24s into one /22', () => {
      const r = check('192.168.0.0/24\n192.168.1.0/24\n192.168.2.0/24\n192.168.3.0/24');
      expect(r.valid).toBe(true);
      expect(r.aggregated).toHaveLength(1);
      expect(r.aggregated[0].version).toBe(4);
      expect(r.aggregated[0].label).toBe('IPv4');
      expect(r.aggregated[0].cidrs).toEqual(['192.168.0.0/22']);
      expect(r.stats.blocks).toBe(1);
    });

    it('keeps contiguous but unalignable blocks as two CIDRs', () => {
      const r = check('10.0.1.0/24\n10.0.2.0/24');
      expect(r.aggregated[0].cidrs).toEqual(['10.0.1.0/24', '10.0.2.0/24']);
      expect(r.stats.blocks).toBe(2);
    });

    it('merges two adjacent bare IPs (/32s) into a /31', () => {
      const r = check('10.0.0.0\n10.0.0.1');
      expect(r.aggregated[0].cidrs).toEqual(['10.0.0.0/31']);
      expect(r.stats.blocks).toBe(1);
    });

    it('aggregates mixed families separately', () => {
      const r = check('10.1.0.0/24\n10.1.1.0/24\n2001:db8::/33\n2001:db8:8000::/33');
      expect(r.aggregated).toHaveLength(2);
      const v4 = r.aggregated.find((g) => g.version === 4);
      const v6 = r.aggregated.find((g) => g.version === 6);
      expect(v4?.cidrs).toEqual(['10.1.0.0/23']);
      expect(v6?.cidrs).toEqual(['2001:db8::/32']);
      expect(r.stats.blocks).toBe(2);
    });
  });

  describe('overlaps & containment between ranges', () => {
    it('labels equal range pairs', () => {
      const r = check('10.0.5.0/24\n10.0.5.0/24');
      expect(r.overlaps).toHaveLength(1);
      expect(r.overlaps[0].kind).toBe('equal');
      expect(r.overlaps[0].relation).toBe('10.0.5.0/24 is the same block as 10.0.5.0/24');
    });

    it('labels contains / within by input order', () => {
      const contains = check('10.0.0.0/16\n10.0.5.0/24');
      expect(contains.overlaps[0].kind).toBe('contains');
      expect(contains.overlaps[0].relation).toBe('10.0.0.0/16 contains 10.0.5.0/24');

      const within = check('10.0.5.0/24\n10.0.0.0/16');
      expect(within.overlaps[0].kind).toBe('within');
      expect(within.overlaps[0].relation).toBe('10.0.5.0/24 is inside 10.0.0.0/16');
    });

    it('reports nothing for disjoint blocks', () => {
      const r = check('10.0.0.0/24\n192.168.0.0/24');
      expect(r.overlaps).toEqual([]);
      expect(r.stats.overlaps).toBe(0);
    });

    it('never pairs a v4 block with a v6 block', () => {
      const r = check('10.0.0.0/8\n2001:db8::/32');
      expect(r.overlaps).toEqual([]);
    });

    it('counts overlaps and blocks in stats', () => {
      const r = check('10.0.0.0/16\n10.0.5.0/24\n10.0.5.0/24\n172.16.0.0/12');
      // 3 colliding pairs among the 10.x entries: contains ×2 and one equal.
      expect(r.stats.overlaps).toBe(3);
      expect(r.overlaps).toHaveLength(3);
      // 10.0.0.0/16 absorbs both /24s; 172.16.0.0/12 stays separate.
      expect(r.stats.blocks).toBe(2);
      expect(r.stats.ok).toBe(4);
      expect(r.stats.invalid).toBe(0);
    });
  });

  describe('membership — bare IP checked against listed ranges', () => {
    it('reports IN with containing CIDRs most-specific first', () => {
      const r = check('10.0.0.5\n10.0.0.0/24\n10.0.0.0/16');
      expect(r.membership).toHaveLength(1);
      const m = r.membership[0];
      expect(m.ip).toBe('10.0.0.5');
      expect(m.version).toBe(4);
      expect(m.status).toBe('in');
      expect(m.matches).toEqual(['10.0.0.0/24', '10.0.0.0/16']);
      expect(m.rangeCount).toBe(2);
    });

    it('reports NOT-IN with the checked range count', () => {
      const r = check('192.168.9.1\n10.0.0.0/24\n10.0.0.0/16');
      const m = r.membership[0];
      expect(m.status).toBe('not-in');
      expect(m.matches).toEqual([]);
      expect(m.rangeCount).toBe(2);
    });

    it('matches an explicit /32 of the same address (equal relation)', () => {
      const r = check('10.0.0.5\n10.0.0.5/32');
      const m = r.membership[0];
      expect(m.status).toBe('in');
      expect(m.matches).toEqual(['10.0.0.5/32']);
    });

    it('handles IPv6 membership', () => {
      const r = check('2001:db8::1\n2001:db8::/32');
      const m = r.membership[0];
      expect(m.version).toBe(6);
      expect(m.status).toBe('in');
      expect(m.matches).toEqual(['2001:db8::/32']);
    });

    it('reports NO-RANGES when only the other family has ranges', () => {
      const r = check('2001:db8::1\n10.0.0.0/24');
      const m = r.membership[0];
      expect(m.status).toBe('no-ranges');
      expect(m.rangeCount).toBe(0);
      expect(m.matches).toEqual([]);
    });

    it('keeps ip × range pairs out of the overlaps list', () => {
      const r = check('10.0.0.5\n10.0.0.0/24');
      expect(r.overlaps).toEqual([]);
      expect(r.membership[0].status).toBe('in');
    });

    it('flags a duplicate bare IP as listed twice', () => {
      const r = check('10.0.0.5\n10.0.0.5');
      expect(r.overlaps).toHaveLength(1);
      expect(r.overlaps[0].kind).toBe('equal');
      expect(r.overlaps[0].relation).toBe('10.0.0.5 is listed twice');
    });

    it('gives an explicit 10.0.0.5/32 range entry no membership verdict', () => {
      const r = check('10.0.0.5/32\n10.0.0.0/24');
      expect(r.membership).toEqual([]);
      expect(r.entries[0].role).toBe('range');
    });
  });

  describe('normalisation', () => {
    it('strips host bits from a CIDR, records the original, and keeps it a range', () => {
      const r = check('10.0.0.5/24');
      const e = r.entries[0];
      expect(e.ok).toBe(true);
      expect(e.cidr).toBe('10.0.0.0/24');
      expect(e.normalizedFrom).toBe('10.0.0.5/24');
      expect(e.role).toBe('range');
      expect(e.display).toBe('10.0.0.0/24');
      expect(r.membership).toEqual([]);
    });

    it('keeps a bare IP /32-suffixed in cidr but bare in display', () => {
      const r = check('10.0.0.5');
      const e = r.entries[0];
      expect(e.role).toBe('ip');
      expect(e.cidr).toBe('10.0.0.5/32');
      expect(e.display).toBe('10.0.0.5');
      expect(e.normalizedFrom).toBeUndefined();
    });
  });

  describe('per-line diagnostics', () => {
    const vectors: [string, string][] = [
      ['10.0.0.256', 'Octet 256 is greater than 255.'],
      ['10.0.0.0/33', 'Prefix /33 is too long for an IPv4 address — the maximum is /32.'],
      ['2001:db8::/200', 'Prefix /200 is too long — the maximum for IPv6 is /128.'],
      ['10.0.0.0/ab', 'The prefix after "/" must be a number, e.g. /24.'],
      ['/24', 'Missing the address before "/24".'],
      ['fe80::1%eth0/64', "Remove the %zone — zone IDs don't apply to range checks."],
      ['1:2:3', 'Expected 8 colon-separated groups (or use "::") but found 3.'],
      ['1::2::3', 'An IPv6 address can contain "::" at most once.'],
      ['10.0.0.', 'Remove the trailing dot — an IPv4 address is 4 octets like 192.168.1.10.'],
      ['10..0.1', 'Empty octet — two dots in a row?'],
      ['hello', 'Not an IP address or CIDR — expected e.g. 10.0.0.5 or 10.0.0.0/24.'],
    ];
    for (const [line, message] of vectors) {
      it(`diagnoses "${line}"`, () => {
        const r = check(line);
        expect(r.valid).toBe(false);
        expect(r.entries[0].ok).toBe(false);
        expect(r.entries[0].error).toBe(message);
      });
    }

    it('uses the all-invalid error when nothing parses', () => {
      const r = check('hello\nworld');
      expect(r.valid).toBe(false);
      expect(r.error).toBe('None of the lines parsed as an IP or CIDR — details on each line below.');
      expect(r.stats).toEqual({ ok: 0, invalid: 2, overlaps: 0, blocks: 0 });
    });

    it('still validates the good lines when some are bad', () => {
      const r = check('10.0.0.0/24\nnonsense');
      expect(r.valid).toBe(true);
      expect(r.stats.ok).toBe(1);
      expect(r.stats.invalid).toBe(1);
      expect(r.entries[1].error).toBe(
        'Not an IP address or CIDR — expected e.g. 10.0.0.5 or 10.0.0.0/24.',
      );
    });
  });

  describe('empty input and comments', () => {
    it('rejects empty input with the how-to message', () => {
      const r = check('');
      expect(r.valid).toBe(false);
      expect(r.error).toBe('Enter one IP or CIDR per line, e.g. 10.0.0.0/24.');
      expect(r.entries).toEqual([]);
      expect(r.membership).toEqual([]);
    });

    it('treats comments-only input as empty', () => {
      const r = check('# just a comment\n\n   \n# another one');
      expect(r.valid).toBe(false);
      expect(r.entries).toEqual([]);
    });

    it('skips blank and # comment lines between entries', () => {
      const r = check('10.0.0.0/24\n\n# a comment\n10.0.1.0/24');
      expect(r.stats.ok).toBe(2);
      expect(r.entries).toHaveLength(2);
    });
  });

  describe('bundled examples', () => {
    it('ships the membership example first and it lands an IN verdict', () => {
      expect(examples[0].id).toBe('membership');
      const r = check(examples[0].input);
      expect(r.membership).toHaveLength(1);
      expect(r.membership[0].status).toBe('in');
      expect(r.membership[0].matches).toEqual(['10.0.0.0/24']);
    });

    for (const ex of examples) {
      it(`parses "${ex.label}" with no invalid lines`, () => {
        const r = check(ex.input);
        expect(r.valid).toBe(true);
        expect(r.stats.invalid).toBe(0);
      });
    }
  });

  // Every expectation in this block was captured from the O(n²) pairwise
  // implementation the sweep replaced, so the reported pairs — and their order —
  // stay byte-identical for the small lists people actually read.
  describe('overlap sweep — parity with the pairwise output it replaced', () => {
    const byId = (id: string): string => examples.find((e) => e.id === id)!.input;

    const pinned: [string, string[][], { ok: number; invalid: number; overlaps: number; blocks: number }][] = [
      ['membership', [['10.0.0.0/24', '172.16.0.0/12']], { ok: 3, invalid: 0, overlaps: 0, blocks: 2 }],
      ['aggregate', [['192.168.0.0/22']], { ok: 4, invalid: 0, overlaps: 0, blocks: 1 }],
      ['overlap', [['10.0.0.0/16', '172.16.0.0/12']], { ok: 4, invalid: 0, overlaps: 3, blocks: 2 }],
      ['mixed', [['10.1.0.0/23'], ['2001:db8::/32']], { ok: 4, invalid: 0, overlaps: 0, blocks: 2 }],
    ];
    for (const [id, cidrGroups, stats] of pinned) {
      it(`keeps example "${id}" producing its documented aggregate and stats`, () => {
        const r = check(byId(id));
        expect(r.aggregated.map((g) => g.cidrs)).toEqual(cidrGroups);
        expect(r.stats).toEqual(stats);
      });
    }

    it('keeps the overlap example’s three pairs in input order', () => {
      expect(check(byId('overlap')).overlaps).toEqual([
        { kind: 'contains', relation: '10.0.0.0/16 contains 10.0.5.0/24' },
        { kind: 'contains', relation: '10.0.0.0/16 contains 10.0.5.0/24' },
        { kind: 'equal', relation: '10.0.5.0/24 is the same block as 10.0.5.0/24' },
      ]);
    });

    it('finds containment the entry’s sorted predecessor cannot see', () => {
      // Sorted by start the list is /16, 10.0.1.0/24, 10.0.9.0/24 — the last
      // block is disjoint from the one before it, so a sweep that only compared
      // neighbours would miss that the /16 contains it.
      const r = check('10.0.0.0/16\n10.0.1.0/24\n10.0.9.0/24');
      expect(r.overlaps).toEqual([
        { kind: 'contains', relation: '10.0.0.0/16 contains 10.0.1.0/24' },
        { kind: 'contains', relation: '10.0.0.0/16 contains 10.0.9.0/24' },
      ]);
    });

    it('reports all three pairs of a nested triple', () => {
      const r = check('10.0.0.0/8\n10.0.0.0/16\n10.0.0.0/24');
      expect(r.overlaps).toEqual([
        { kind: 'contains', relation: '10.0.0.0/8 contains 10.0.0.0/16' },
        { kind: 'contains', relation: '10.0.0.0/8 contains 10.0.0.0/24' },
        { kind: 'contains', relation: '10.0.0.0/16 contains 10.0.0.0/24' },
      ]);
    });

    it('reports all three pairs of a bare IP listed three times', () => {
      const r = check('10.0.0.5\n10.0.0.5\n10.0.0.5');
      expect(r.overlaps).toEqual([
        { kind: 'equal', relation: '10.0.0.5 is listed twice' },
        { kind: 'equal', relation: '10.0.0.5 is listed twice' },
        { kind: 'equal', relation: '10.0.0.5 is listed twice' },
      ]);
    });

    it('orders ip-pairs and range-pairs together by input position', () => {
      // Pair (line 1, line 4) precedes pair (line 2, line 3) — the old nested
      // loop walked i ascending, then j, across both roles.
      const r = check('10.0.0.5\n10.0.0.0/24\n10.0.0.0/16\n10.0.0.5');
      expect(r.overlaps).toEqual([
        { kind: 'equal', relation: '10.0.0.5 is listed twice' },
        { kind: 'within', relation: '10.0.0.0/24 is inside 10.0.0.0/16' },
      ]);
    });
  });

  describe('large pastes stay interactive', () => {
    /** n disjoint /24s, `stride` apart, as a paste-shaped multi-line list. */
    function manyBlocks(n: number, stride: number): string {
      const out: string[] = [];
      for (let i = 0; i < n; i++) {
        const v = i * stride;
        out.push(`10.${Math.floor(v / 256) % 256}.${v % 256}.0/24`);
      }
      return out.join('\n');
    }

    it('checks 4,000 disjoint /24s in well under a second', () => {
      const input = manyBlocks(4000, 2);
      const t0 = performance.now();
      const r = check(input);
      const elapsed = performance.now() - t0;
      expect(r.stats.ok).toBe(4000);
      expect(r.overlaps).toEqual([]);
      expect(r.stats.blocks).toBe(4000);
      expect(elapsed).toBeLessThan(1000);
    }, 180000);

    it('stays fast when one supernet collides with all 4,000', () => {
      const input = `10.0.0.0/8\n${manyBlocks(4000, 2)}`;
      const t0 = performance.now();
      const r = check(input);
      const elapsed = performance.now() - t0;
      expect(r.stats.overlaps).toBe(4000);
      expect(r.overlaps[0]).toEqual({
        kind: 'contains',
        relation: '10.0.0.0/8 contains 10.0.0.0/24',
      });
      expect(r.stats.blocks).toBe(1);
      expect(elapsed).toBeLessThan(1000);
    }, 180000);

    it('caps the pair list out loud instead of silently skipping work', () => {
      // 400 identical blocks are 79,800 colliding pairs — more than any human
      // reads, and enough objects to hurt. The cap has to announce itself.
      const r = check(Array.from({ length: 400 }, () => '10.0.5.0/24').join('\n'));
      expect(r.overlaps[0].kind).toBe('truncated');
      expect(r.overlaps[0].relation).toContain('5,000');
      expect(r.overlaps).toHaveLength(5001);
      expect(r.stats.overlaps).toBe(5000);
      // Everything that is not the pair list still covers all 400 lines.
      expect(r.stats.ok).toBe(400);
      expect(r.aggregated[0].cidrs).toEqual(['10.0.5.0/24']);
    }, 180000);
  });

  describe('probe addresses stay out of the merged set', () => {
    it('never merges an out-of-range probe into the aggregate', () => {
      const r = check('8.8.8.8\n10.0.0.0/8\n192.168.0.0/16');
      expect(r.membership[0].status).toBe('not-in');
      expect(r.aggregated).toHaveLength(1);
      expect(r.aggregated[0].cidrs).toEqual(['10.0.0.0/8', '192.168.0.0/16']);
      expect(r.stats.blocks).toBe(2);
      // Still a valid, listed entry — only the aggregate ignores it.
      expect(r.stats.ok).toBe(3);
      expect(r.entries[0].role).toBe('ip');
    });

    it('does the same for an IPv6 probe', () => {
      const r = check('2001:4860::8888\n2001:db8::/32');
      expect(r.membership[0].status).toBe('not-in');
      expect(r.aggregated.find((g) => g.version === 6)?.cidrs).toEqual(['2001:db8::/32']);
      expect(r.stats.blocks).toBe(1);
    });

    it('still aggregates an all-IPs list — there is nothing to probe against', () => {
      const r = check('8.8.8.8\n1.1.1.1\n8.8.4.4');
      expect(r.membership.every((m) => m.status === 'no-ranges')).toBe(true);
      expect(r.aggregated[0].cidrs).toEqual(['1.1.1.1/32', '8.8.4.4/32', '8.8.8.8/32']);
      expect(r.stats.blocks).toBe(3);
    });

    it('decides per family — a v4 IP with only v6 ranges is not a probe', () => {
      const r = check('8.8.8.8\n2001:db8::/32');
      expect(r.membership[0].status).toBe('no-ranges');
      expect(r.aggregated.map((g) => g.cidrs)).toEqual([['8.8.8.8/32'], ['2001:db8::/32']]);
      expect(r.stats.blocks).toBe(2);
    });

    it('leaves the aggregate unchanged for an in-range probe', () => {
      const r = check(examples[0].input);
      expect(r.membership[0].status).toBe('in');
      expect(r.aggregated[0].cidrs).toEqual(['10.0.0.0/24', '172.16.0.0/12']);
    });
  });
});

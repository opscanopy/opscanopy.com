/**
 * Data Size & Transfer-Rate Converter — engine tests.
 *
 * The first describe block is the plan's pinned edge-case list, one `it` per
 * case, in the plan's order. Those assertions are deliberately exact-string:
 * the whole point of the tool is that `5 YiB` prints all 25 digits and that the
 * diagnostics name the actual problem, so a rounded float or a reworded
 * sentence must fail here rather than ship.
 *
 * The blocks after it cover the grammar surface, the never-throws contract
 * (garbage / empty / absurdly large input) and the `#q=` state codec.
 */
import { describe, expect, it } from 'vitest';
import { convert, transferTime, encodeState, parseState, significantLadder } from './engine';
import { examples } from './examples';
import { base64UrlDecode } from '../codec';

/** The SI byte row for `exponent` from a convert() result. */
function siRow(input: string, exponent: number) {
  const rung = convert(input).ladder?.find((p) => p.exponent === exponent);
  if (!rung) throw new Error(`no ladder rung ${exponent} for ${input}`);
  return rung.si;
}
/** The IEC byte row for `exponent` from a convert() result. */
function iecRow(input: string, exponent: number) {
  const rung = convert(input).ladder?.find((p) => p.exponent === exponent);
  if (!rung) throw new Error(`no ladder rung ${exponent} for ${input}`);
  return rung.iec;
}

describe('data-size — the pinned edge cases', () => {
  it('1. KiB / KB / kB are 1024 / 1000 / 1000 bytes', () => {
    expect(convert('1 KiB').bytes?.value).toBe('1024');
    expect(convert('1 KB').bytes?.value).toBe('1000');
    expect(convert('1 kB').bytes?.value).toBe('1000');
    // …and the detection tells the user which convention it landed in.
    expect(convert('1 KiB').detection?.caption).toBe('1 KiB — IEC, 1024-based, exact');
    expect(convert('1 KB').detection?.family).toBe('si');
  });

  it('2. `Kb` is 125 bytes and earns a "did you mean KB?" NOTE, never an error', () => {
    const r = convert('1 Kb');
    expect(r.valid).toBe(true);
    expect(r.error).toBeUndefined();
    expect(r.bytes?.value).toBe('125');
    expect(r.bits?.value).toBe('1000');
    expect(r.notes).toContain(
      'Kb is kilobits (1000 bits = 125 bytes). Did you mean KB — kilobytes? Lowercase b is bits, uppercase B is bytes.',
    );
  });

  it('3. a bare `K` is 1000 bytes and carries the Kubernetes lowercase-k note', () => {
    const r = convert('1 K');
    expect(r.valid).toBe(true);
    expect(r.bytes?.value).toBe('1000');
    expect(r.notes).toContain(
      'A bare K means 1000 bytes — the SI kilo prefix with no B. Kubernetes writes 1000-based quantities with a lowercase k (never K) and 1024-based ones as Ki.',
    );
    // The k8s spelling of the 1024-based unit parses too — that is the PVC case.
    expect(convert('500Gi').bytes?.value).toBe('536870912000');
  });

  it('4. fractional bytes are accepted and never floored (0.3 KiB = 307.2 bytes)', () => {
    const r = convert('0.3 KiB');
    expect(r.valid).toBe(true);
    expect(r.bytes?.value).toBe('307.2');
    expect(r.bytes?.approx).toBe(false);
    expect(r.bits?.value).toBe('2457.6');
    expect(r.detection?.wholeBytes).toBe(false);
    expect(r.detection?.caption).toBe('0.3 KiB — IEC, 1024-based, fractional bytes');
    expect(r.notes).toContain(
      '0.3 KiB is 307.2 bytes — not a whole number of bytes. Nothing on disk is a fraction of a byte; the exact value is kept here so the conversion stays reversible.',
    );
  });

  it('5. bits/bytes rows are exact integers; ladder cells cap at 6 fraction digits and flag ≈', () => {
    const r = convert('1.5 GiB');
    expect(r.bytes).toEqual({ value: '1610612736', display: '1 610 612 736', approx: false });
    expect(r.bits).toEqual({ value: '12884901888', display: '12 884 901 888', approx: false });
    expect(r.summary).toBe('1.5 GiB = 1 610 612 736 bytes');
    expect(r.detection?.caption).toBe('1.5 GiB — IEC, 1024-based, exact');
    // The IEC rung is exact; the SI rung needs 9 fraction digits, so it rounds.
    expect(iecRow('1.5 GiB', 3).cell).toEqual({ value: '1.5', display: '1.5', approx: false });
    expect(siRow('1.5 GiB', 3).cell).toEqual({
      value: '1.610613',
      display: '1.610613',
      approx: true,
    });
    expect(siRow('1.5 GiB', 3).copy).toBe('1.610613 GB');
    // And nothing in the ladder ever prints more than six fraction digits.
    for (const rung of r.ladder ?? []) {
      for (const row of [rung.si, rung.iec]) {
        const frac = row.cell.value.split('.')[1] ?? '';
        expect(frac.length).toBeLessThanOrEqual(6);
      }
    }
  });

  it('6. `5 YiB` prints all 25 digits — no float leak anywhere', () => {
    const r = convert('5 YiB');
    expect(r.bytes?.value).toBe('6044629098073145873530880');
    expect(r.bytes?.approx).toBe(false);
    expect(r.bits?.value).toBe('48357032784585166988247040');
    expect(iecRow('5 YiB', 8).cell.value).toBe('5');
    expect(siRow('5 YiB', 8).cell.value).toBe('6.044629');
    expect(siRow('5 YiB', 8).cell.approx).toBe(true);
  });

  it('7. a negative size is a specific error, not a silent absolute value', () => {
    const r = convert('-5 GB');
    expect(r.valid).toBe(false);
    expect(r.error).toBe('A size cannot be negative — drop the minus sign.');
    expect(r.bytes).toBeUndefined();
  });

  it('8. zero is a valid size', () => {
    const r = convert('0 GB');
    expect(r.valid).toBe(true);
    expect(r.bytes?.value).toBe('0');
    expect(r.bits?.value).toBe('0');
    expect(r.summary).toBe('0 GB = 0 bytes');
  });

  it('9. a zero transfer rate is an error — it never finishes', () => {
    const r = transferTime('1 GB', '0 Mbps');
    expect(r.valid).toBe(false);
    expect(r.errorField).toBe('rate');
    expect(r.error).toBe('A transfer rate of zero never finishes — enter a rate above zero.');
  });

  it('10. `1,234 kB` reads the comma as a thousands separator, with a note', () => {
    const r = convert('1,234 kB');
    expect(r.valid).toBe(true);
    expect(r.bytes?.value).toBe('1234000');
    expect(r.detection?.normalized).toBe('1234 kB');
    expect(r.notes).toContain(
      'Read "1,234" as 1234 — the comma groups thousands. Write 1.234 if you meant a decimal fraction.',
    );
  });

  it('11. `1,5 GiB` reads the comma as a decimal separator, with a note', () => {
    const r = convert('1,5 GiB');
    expect(r.valid).toBe(true);
    expect(r.bytes?.value).toBe('1610612736');
    expect(r.detection?.normalized).toBe('1.5 GiB');
    expect(r.notes).toContain(
      'Read "1,5" as 1.5 — the comma is a decimal separator, not a thousands separator.',
    );
  });

  it('12. `1.5e3 MB` shifts the mantissa exactly', () => {
    const r = convert('1.5e3 MB');
    expect(r.valid).toBe(true);
    expect(r.bytes?.value).toBe('1500000000');
    expect(r.detection?.normalized).toBe('1500 MB');
    // negative exponents stay exact too
    expect(convert('1.5e-3 MB').bytes?.value).toBe('1500');
  });

  it('13. `1 Kib` is 128 bytes (kibibits, not kibibytes)', () => {
    const r = convert('1 Kib');
    expect(r.bytes?.value).toBe('128');
    expect(r.bits?.value).toBe('1024');
    expect(r.detection?.measures).toBe('bits');
  });

  it('14. 1 Gbps is exactly 125 MB/s', () => {
    const r = transferTime('1 GB', '1 Gbps');
    expect(r.valid).toBe(true);
    expect(r.rate?.bitsPerSecond).toEqual({
      value: '1000000000',
      display: '1 000 000 000',
      approx: false,
    });
    expect(r.rate?.bytesPerSecond.value).toBe('125000000');
    expect(r.rate?.bitForm).toBe('1 Gbps');
    expect(r.rate?.byteForm).toBe('125 MB/s');
    expect(r.rate?.caption).toBe('1 Gbps = 125 MB/s (1000-based)');
  });

  it('15. 500 GB over 1 Gbps is exactly 4000 s = 1 h 6 min 40 s', () => {
    const r = transferTime('500 GB', '1 Gbps');
    expect(r.valid).toBe(true);
    expect(r.ideal?.seconds).toEqual({ value: '4000', display: '4000', approx: false });
    expect(r.ideal?.humanized).toBe('1 h 6 min 40 s');
    expect(r.summary).toBe('500 GB at 1 Gbps takes 1 h 6 min 40 s');
  });

  it('16. the line-rate note and the 90%-efficiency row are always present', () => {
    const r = transferTime('500 GB', '1 Gbps');
    expect(r.realistic?.percent).toBe(90);
    expect(r.realistic?.duration.seconds).toEqual({
      value: '4444.444444',
      display: '4444.444444',
      approx: true,
    });
    expect(r.realistic?.duration.humanized).toBe('1 h 14 min 4 s');
    expect(r.notes).toContain(
      'This is the line-rate best case. Protocol overhead (TCP/IP headers, TLS, filesystem) typically costs 5–15%, so the 90% row is the number to quote.',
    );
    // …also on a completely different pair, so "always" means always.
    const other = transferTime('1 MiB', '10 Mbps');
    expect(other.realistic?.percent).toBe(90);
    expect(other.notes.length).toBeGreaterThan(0);
  });

  it('17. an unknown unit returns a suggestion list, not a shrug', () => {
    const r = convert('1 gigglebyte');
    expect(r.valid).toBe(false);
    expect(r.error).toBe('Unknown unit "gigglebyte". Did you mean GB, Gb, GiB or Gib?');
    expect(r.suggestions).toEqual(['GB', 'Gb', 'GiB', 'Gib']);
    // a first letter with no prefix match still gets the base units
    expect(convert('1 quux').error).toBe('Unknown unit "quux". Did you mean B, b, kB or KiB?');
  });

  it('18. `1 TB` is detected as SI and told to write TiB for the other one', () => {
    const r = convert('1 TB');
    expect(r.valid).toBe(true);
    expect(r.detection?.family).toBe('si');
    expect(r.detection?.base).toBe(1000);
    expect(r.detection?.caption).toBe('1 TB — SI, 1000-based, exact');
    expect(r.bytes?.value).toBe('1000000000000');
    expect(r.notes).toContain(
      '1 TB is 1000-based (SI) — 1 000 000 000 000 bytes. Write 1 TiB for the 1024-based value: 1 099 511 627 776 bytes, 9.95% more.',
    );
  });
});

describe('data-size — the SI ↔ IEC ladder', () => {
  it('pairs all eight rungs, kilo/kibi → yotta/yobi', () => {
    const ladder = convert('1 GiB').ladder ?? [];
    expect(ladder).toHaveLength(8);
    expect(ladder.map((p) => p.si.unit)).toEqual(['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']);
    expect(ladder.map((p) => p.iec.unit)).toEqual([
      'KiB',
      'MiB',
      'GiB',
      'TiB',
      'PiB',
      'EiB',
      'ZiB',
      'YiB',
    ]);
  });

  it('carries the divergence percentage that grows 2.4% → 20.9%', () => {
    const ladder = convert('1 GiB').ladder ?? [];
    expect(ladder[0].divergencePercent).toBe('2.40');
    expect(ladder[7].divergencePercent).toBe('20.89');
  });

  it('renders exact ladder values when they terminate inside six digits', () => {
    // 1 GB in MB is exactly 1000; in MiB it is 953.674316 (rounded).
    expect(siRow('1 GB', 2).cell).toEqual({ value: '1000', display: '1000', approx: false });
    expect(iecRow('1 GB', 2).cell.value).toBe('953.674316');
    expect(iecRow('1 GB', 2).cell.approx).toBe(true);
    // The classic "931 GB drive": 1 TB shown in GiB.
    expect(iecRow('1 TB', 3).cell.value).toBe('931.322575');
  });

  it('significantLadder() drops the rungs that would render as ≈ 0', () => {
    const rungs = significantLadder(convert('1.5 GiB').ladder ?? []);
    expect(rungs.map((r) => r.si.unit)).toEqual(['kB', 'MB', 'GB', 'TB']);
    // A tiny size still gets a ladder — the floor is three rungs.
    expect(significantLadder(convert('8 bits').ladder ?? []).map((r) => r.si.unit)).toEqual([
      'kB',
      'MB',
      'GB',
    ]);
    // A huge one keeps every rung.
    expect(significantLadder(convert('5 YiB').ladder ?? [])).toHaveLength(8);
  });

  it('groups only above four integer digits, so 1024 stays 1024', () => {
    expect(convert('1 KiB').bytes?.display).toBe('1024');
    expect(convert('12 KiB').bytes?.display).toBe('12 288');
    expect(convert('1 MiB').bytes?.display).toBe('1 048 576');
  });
});

describe('data-size — grammar', () => {
  it('accepts word forms case-insensitively', () => {
    expect(convert('2 gibibytes').bytes?.value).toBe('2147483648');
    expect(convert('2 GIBIBYTE').bytes?.value).toBe('2147483648');
    expect(convert('2 megabytes').bytes?.value).toBe('2000000');
    expect(convert('2 Mbit').bytes?.value).toBe('250000');
    expect(convert('8 bits').bytes?.value).toBe('1');
    expect(convert('8 bytes').bits?.value).toBe('64');
  });

  it('reads a bare number as bytes, and says so', () => {
    const r = convert('4096');
    expect(r.bytes?.value).toBe('4096');
    expect(r.detection?.unit).toBe('B');
    expect(r.notes).toContain(
      'No unit given — read as plain bytes. Add a unit like KB, KiB, Mb or GB to convert something else.',
    );
  });

  it('accepts a plural symbol and mixed spacing', () => {
    expect(convert('5GBs').bytes?.value).toBe('5000000000');
    expect(convert('  5   GB  ').bytes?.value).toBe('5000000000');
    expect(convert('5gb').detection?.measures).toBe('bits');
  });

  // Regression: two or more commas can only be thousands grouping. This used to be read as
  // "the comma is the decimal point", which then failed as "two decimal points" — so the most
  // common real-world paste (a spreadsheet/Explorer byte count) was rejected, while the
  // equivalent dot-grouped form was accepted.
  it('reads multi-group comma thousands separators, like the dot form', () => {
    expect(convert('12,345,678 B').bytes?.value).toBe('12345678');
    expect(convert('12.345.678 B').bytes?.value).toBe('12345678');
    expect(convert('1,234,567 kB').bytes?.value).toBe('1234567000');
  });

  it('still tells a lone decimal comma apart from a lone grouping comma', () => {
    expect(convert('1,5 GB').bytes?.value).toBe('1500000000'); // decimal comma
    expect(convert('1,234 B').bytes?.value).toBe('1234'); // 3-digit tail = grouping
    expect(convert('1,2345 GB').bytes?.value).toBe('1234500000'); // 4-digit tail = decimal
    expect(convert('1,23,456 GB').valid).toBe(false); // 2-digit group is not grouping
  });

  it('accepts underscore and space thousands separators without a note', () => {
    expect(convert('1_500_000 B').bytes?.value).toBe('1500000');
    const spaced = convert('1 500 000 B');
    expect(spaced.bytes?.value).toBe('1500000');
    expect(spaced.notes.some((n) => n.startsWith('Read "'))).toBe(false);
  });

  it('rejects a rate in the size field with a specific sentence', () => {
    expect(convert('1 Gbps').error).toBe(
      'A per-second rate is not a size — enter 500 GB, not 500 GB/s.',
    );
    expect(convert('125 MB/s').valid).toBe(false);
  });

  it('rejects malformed numbers by quoting them back', () => {
    expect(convert('1.2.3 GB').error).toBe('Could not read "1.2.3" as a number.');
    expect(convert('1,23,456 GB').error).toBe('Could not read "1,23,456" as a number.');
    expect(convert('GB').error).toBe('Start with a number, like 1.5 GiB or 500 GB.');
    expect(convert('').error).toBe('Enter a size like 1.5 GiB, 500 GB or 128 Mb.');
    expect(convert('   ').error).toBe('Enter a size like 1.5 GiB, 500 GB or 128 Mb.');
  });

  it('refuses absurd magnitudes instead of formatting a million digits', () => {
    expect(convert('1e4096 GB').error).toBe(
      'That number is too big to convert — keep it under 1e300.',
    );
    expect(convert(`${'9'.repeat(320)} B`).error).toBe(
      'That number is too big to convert — keep it under 1e300.',
    );
    expect(convert(`1.${'1'.repeat(200)} GB`).error).toBe(
      'That number has too many decimal places — 100 is the limit.',
    );
    expect(convert('1'.repeat(500)).error).toBe(
      'That input is too long to be a single size — 400 characters is the limit.',
    );
  });
});

describe('data-size — transfer time', () => {
  it('reads a rate written without /s and says so', () => {
    const r = transferTime('1 GB', '100 Mb');
    expect(r.valid).toBe(true);
    expect(r.notes).toContain('Read 100 Mb as 100 Mb/s — a link speed is per second.');
    expect(r.ideal?.seconds.value).toBe('80');
  });

  it('accepts byte-per-second rates and shows both forms', () => {
    const r = transferTime('1 GiB', '50 MB/s');
    expect(r.rate?.byteForm).toBe('50 MB/s');
    expect(r.rate?.bitForm).toBe('400 Mbps');
    expect(r.ideal?.seconds.value).toBe('21.474836');
    expect(r.ideal?.seconds.approx).toBe(true);
    expect(r.ideal?.humanized).toBe('21.5 s');
  });

  // Regression: rateForms() built its strings from cell().value and dropped cell().approx, so a
  // rounded link speed was printed as though it were exact — in the header caption, the
  // role=status summary and the copy payload alike. On a ground-truth tool that is the one
  // mistake we cannot make.
  it('marks a rounded rate as approximate instead of printing it as exact', () => {
    const exact = transferTime('1 GB', '1 Gbps');
    expect(exact.rate?.bitForm).toBe('1 Gbps');
    expect(exact.rate?.byteForm).toBe('125 MB/s');

    const rounded = transferTime('1 GB', '1.00000001 Gbps');
    expect(rounded.rate?.bitForm.startsWith('≈ ')).toBe(true);
    expect(rounded.rate?.caption.includes('≈')).toBe(true);
  });

  it('humanises the whole range', () => {
    expect(transferTime('0 GB', '1 Gbps').ideal?.humanized).toBe('0 s');
    expect(transferTime('1 MB', '1 Gbps').ideal?.humanized).toBe('8 ms');
    expect(transferTime('1 kB', '1 Gbps').ideal?.humanized).toBe('< 1 ms');
    expect(transferTime('1 TB', '1 Gbps').ideal?.humanized).toBe('2 h 13 min 20 s');
    expect(transferTime('1 PB', '1 Gbps').ideal?.humanized).toBe('92 d 14 h 13 min 20 s');
  });

  it('surfaces the size diagnostic when the size is the broken half', () => {
    const r = transferTime('-1 GB', '1 Gbps');
    expect(r.valid).toBe(false);
    expect(r.errorField).toBe('size');
    expect(r.error).toBe('A size cannot be negative — drop the minus sign.');
  });

  it('surfaces the rate diagnostic when the rate is the broken half', () => {
    const r = transferTime('1 GB', '1 wat');
    expect(r.valid).toBe(false);
    expect(r.errorField).toBe('rate');
    expect(r.error).toBe('Unknown unit "wat". Did you mean B, b, kB or KiB?');
  });

  it('asks for a rate when the rate is blank', () => {
    const r = transferTime('1 GB', '   ');
    expect(r.valid).toBe(false);
    expect(r.errorField).toBe('rate');
    expect(r.error).toBe('Enter a link speed like 1 Gbps, 100 Mbps or 50 MB/s.');
  });

  it('does not fire the size field bits-vs-bytes note for a bit RATE', () => {
    // "Mbps" is exactly how link speeds are written — nagging about MB would be wrong.
    const r = transferTime('1 GB', '100 Mbps');
    expect(r.notes.some((n) => n.includes('Did you mean MB'))).toBe(false);
  });
});

describe('data-size — never throws', () => {
  const hostile = [
    '',
    '   ',
    ' ',
    '-',
    '.',
    ',',
    'e',
    '1e',
    '1e+',
    '1,',
    '1.',
    '0x10 GB',
    'NaN GB',
    'Infinity',
    '1 GB GB',
    '1/0 GB',
    '<script>alert(1)</script>',
    '1 GB <img src=x onerror=alert(1)>',
    '٥ GB',
    '1 ＧＢ',
    '1\tGiB',
    '1\nGiB',
    '1e-999999 GB',
    '1e999999 GB',
    '-'.repeat(500),
    '9'.repeat(5000),
    '1 '.repeat(2000),
    'B'.repeat(300),
    '1.5.5.5.5 GiB',
    '½ GiB',
    '1 GiB‮',
  ];

  it('convert() survives every hostile input', () => {
    for (const input of hostile) {
      expect(() => convert(input), input).not.toThrow();
      const r = convert(input);
      expect(Array.isArray(r.notes), input).toBe(true);
      if (!r.valid) expect(typeof r.error, input).toBe('string');
    }
  });

  it('transferTime() survives every hostile pair', () => {
    for (const input of hostile) {
      expect(() => transferTime(input, input), input).not.toThrow();
      expect(() => transferTime('1 GB', input), input).not.toThrow();
      expect(() => transferTime(input, '1 Gbps'), input).not.toThrow();
    }
  });

  it('never emits a NaN, Infinity or exponent-notation string', () => {
    for (const input of ['1.5 GiB', '5 YiB', '0.3 KiB', '9.1e5 kB', '0 B', '1 Kib']) {
      const r = convert(input);
      const strings = [
        r.bits?.value,
        r.bytes?.value,
        r.summary,
        ...(r.ladder ?? []).flatMap((p) => [p.si.cell.value, p.iec.cell.value]),
      ].filter((s): s is string => typeof s === 'string');
      for (const s of strings) {
        expect(s, `${input} → ${s}`).not.toMatch(/NaN|Infinity|e[+-]/i);
      }
    }
  });
});

describe('data-size — #q= state codec', () => {
  it('encodeState() writes a base64url JSON payload under the q key', () => {
    const hash = encodeState({ size: '500 GB', rate: '1 Gbps' });
    expect(hash.startsWith('#q=')).toBe(true);
    expect(JSON.parse(base64UrlDecode(hash.slice('#q='.length)))).toEqual({
      size: '500 GB',
      rate: '1 Gbps',
    });
  });

  it('round-trips through parseState(), including a size-only state', () => {
    expect(parseState(encodeState({ size: '1.5 GiB', rate: '' }))).toEqual({
      size: '1.5 GiB',
      rate: '',
    });
    expect(parseState(encodeState({ size: '1 TB' }))).toEqual({ size: '1 TB' });
  });

  it('degrades a hand-edited fragment into a plain size instead of ignoring it', () => {
    // A junk or truncated fragment must still reach the engine, so the user
    // gets a diagnostic rather than a silently-ignored link.
    expect(parseState('#q=1%20gigglebyte')).toEqual({ size: '1 gigglebyte' });
    expect(parseState('#q=' + encodeURIComponent('1.5 GiB'))).toEqual({ size: '1.5 GiB' });
  });

  it('returns null for anything that carries no q payload', () => {
    expect(parseState('')).toBeNull();
    expect(parseState('#')).toBeNull();
    expect(parseState('#q=')).toBeNull();
    expect(parseState('#s=abc')).toBeNull();
    expect(parseState('#ip=10.0.0.1')).toBeNull();
  });

  it('drops non-string and over-long fields rather than trusting them', () => {
    const bad = '#q=' + Buffer.from(JSON.stringify({ size: 42, rate: [] })).toString('base64url');
    expect(parseState(bad)).toBeNull();
    const long = encodeState({ size: 'x'.repeat(500) });
    expect(parseState(long)).toBeNull();
  });

  it('never throws on a hostile fragment', () => {
    for (const f of ['#q=%%%', '#q=////', '#q=' + 'A'.repeat(5000), '#q=null', '#q=W10=']) {
      expect(() => parseState(f), f).not.toThrow();
    }
  });
});

describe('data-size — examples', () => {
  it('ships five chips, all of which evaluate cleanly', () => {
    expect(examples).toHaveLength(5);
    for (const ex of examples) {
      expect(ex.label.length, ex.id).toBeGreaterThan(0);
      const r = convert(ex.size);
      expect(r.valid, `${ex.id}: ${ex.size}`).toBe(true);
      if (ex.rate) {
        expect(transferTime(ex.size, ex.rate).valid, `${ex.id}: ${ex.rate}`).toBe(true);
      }
    }
  });

  it('seeds the first chip with the pinned 1.5 GiB result', () => {
    expect(examples[0].size).toBe('1.5 GiB');
    expect(convert(examples[0].size).bytes?.display).toBe('1 610 612 736');
  });

  it('fills both bands from exactly one chip', () => {
    expect(examples.filter((e) => e.rate.length > 0)).toHaveLength(1);
  });
});

/**
 * der.ts — the DER reader, pinned at the byte level.
 *
 * DER is a canonical encoding: for every value there is exactly one legal byte
 * sequence. That is the whole reason a hand-rolled reader can be exact rather
 * than merely permissive — there are no alternatives to choose between. So the
 * rules pinned here are mostly REFUSALS: BER-only constructs (indefinite length)
 * and anything that runs past the buffer must come back `null`, never a
 * best-effort guess and never an exception.
 *
 * Every function in der.ts returns `null` on malformed input. The final
 * describe block fuzzes that promise.
 */
import { describe, expect, it } from 'vitest';
import {
  bytesEqual,
  decodeBitString,
  decodeIntegerBig,
  decodeOid,
  decodeString,
  decodeTime,
  hexColon,
  readChildren,
  readNode,
  TAG,
} from './der';

/** Terse byte-array literal. */
const b = (...n: number[]) => new Uint8Array(n);

describe('readNode — tag and length forms', () => {
  it('reads a short-form length', () => {
    // SEQUENCE, length 3, content 01 02 03
    const node = readNode(b(0x30, 0x03, 0x01, 0x02, 0x03));
    expect(node).not.toBeNull();
    expect(node!.tagNumber).toBe(TAG.SEQUENCE);
    expect(node!.constructed).toBe(true);
    expect(node!.tagClass).toBe(0);
    expect(node!.contentStart).toBe(2);
    expect(node!.end).toBe(5);
    expect(Array.from(node!.content)).toEqual([1, 2, 3]);
    expect(node!.full.length).toBe(5);
  });

  it('reads a two-byte long-form length (0x82)', () => {
    // OCTET STRING, length 0x0140 = 320 bytes.
    const buf = new Uint8Array(4 + 320);
    buf[0] = 0x04;
    buf[1] = 0x82;
    buf[2] = 0x01;
    buf[3] = 0x40;
    const node = readNode(buf);
    expect(node).not.toBeNull();
    expect(node!.content.length).toBe(320);
    expect(node!.contentStart).toBe(4);
    expect(node!.end).toBe(324);
  });

  it('reads a one-byte long-form length (0x81)', () => {
    const buf = new Uint8Array(3 + 200);
    buf[0] = 0x04;
    buf[1] = 0x81;
    buf[2] = 0xc8;
    const node = readNode(buf);
    expect(node!.content.length).toBe(200);
  });

  it('refuses an indefinite length — that is BER, not DER', () => {
    // 0x80 length octet = "content follows until an end-of-contents marker".
    expect(readNode(b(0x30, 0x80, 0x01, 0x01, 0xff, 0x00, 0x00))).toBeNull();
  });

  it('refuses the reserved 0xFF length octet', () => {
    expect(readNode(b(0x30, 0xff, 0x01))).toBeNull();
  });

  it('refuses a length that runs past the end of the buffer (truncation)', () => {
    expect(readNode(b(0x30, 0x0a, 0x01, 0x02))).toBeNull();
    expect(readNode(b(0x04, 0x82, 0xff, 0xff, 0x01))).toBeNull();
  });

  it('refuses a length field that is itself truncated', () => {
    expect(readNode(b(0x30, 0x82, 0x01))).toBeNull();
    expect(readNode(b(0x30))).toBeNull();
    expect(readNode(new Uint8Array(0))).toBeNull();
  });

  it('refuses a length wider than 4 octets — no certificate is 2^40 bytes', () => {
    expect(readNode(b(0x04, 0x85, 0x01, 0x00, 0x00, 0x00, 0x00))).toBeNull();
  });

  it('reads the high-tag-number form (tag >= 31, multi-byte)', () => {
    // Identifier 0xBF = context class (10), constructed (0x20), tag bits 0x1F =
    // the "tag number follows in base-128" escape. 0x1F then encodes 31.
    const node = readNode(b(0xbf, 0x1f, 0x00));
    expect(node).not.toBeNull();
    expect(node!.tagClass).toBe(2);
    expect(node!.constructed).toBe(true);
    expect(node!.tagNumber).toBe(31);
    expect(node!.content.length).toBe(0);
    expect(node!.contentStart).toBe(3);
  });

  it('reads a context-specific tag in the low form ([0] EXPLICIT)', () => {
    const node = readNode(b(0xa0, 0x03, 0x02, 0x01, 0x02));
    expect(node!.tagClass).toBe(2);
    expect(node!.tagNumber).toBe(0);
    expect(node!.constructed).toBe(true);
  });

  it('reads at a non-zero offset', () => {
    const node = readNode(b(0xff, 0xff, 0x02, 0x01, 0x07), 2);
    expect(node!.tagNumber).toBe(TAG.INTEGER);
    expect(Array.from(node!.content)).toEqual([7]);
  });
});

describe('readChildren', () => {
  it('walks the children of a constructed node', () => {
    // SEQUENCE { INTEGER 1, INTEGER 2, BOOLEAN TRUE }
    const node = readNode(b(0x30, 0x09, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02, 0x01, 0x01, 0xff));
    const kids = readChildren(node!);
    expect(kids).not.toBeNull();
    expect(kids!.length).toBe(3);
    expect(kids!.map((k) => k.tagNumber)).toEqual([TAG.INTEGER, TAG.INTEGER, TAG.BOOLEAN]);
    expect(Array.from(kids![1].content)).toEqual([2]);
  });

  it('returns null when a child is malformed rather than a partial list', () => {
    // SEQUENCE claims 4 bytes; the inner INTEGER claims 8.
    const node = readNode(b(0x30, 0x04, 0x02, 0x08, 0x01, 0x02));
    expect(node).not.toBeNull();
    expect(readChildren(node!)).toBeNull();
  });

  it('returns an empty list for an empty constructed node', () => {
    const node = readNode(b(0x30, 0x00));
    expect(readChildren(node!)).toEqual([]);
  });

  it('refuses a primitive node', () => {
    const node = readNode(b(0x02, 0x01, 0x05));
    expect(readChildren(node!)).toBeNull();
  });
});

describe('decodeOid', () => {
  it('decodes the three first-arc cases from one leading octet', () => {
    // 0x2A = 42 = 40*1 + 2 → 1.2 ; 0x06 = 6 → 0.6 ; 0x51 = 81 = 80 + 1 → 2.1
    expect(decodeOid(b(0x2a, 0x86, 0x48))).toBe('1.2.840');
    expect(decodeOid(b(0x06, 0x01))).toBe('0.6.1');
    expect(decodeOid(b(0x51))).toBe('2.1');
  });

  it('decodes commonName (2.5.4.3)', () => {
    expect(decodeOid(b(0x55, 0x04, 0x03))).toBe('2.5.4.3');
  });

  it('decodes sha256WithRSAEncryption (1.2.840.113549.1.1.11)', () => {
    expect(decodeOid(b(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b))).toBe(
      '1.2.840.113549.1.1.11',
    );
  });

  it('decodes ecdsa-with-SHA384 (1.2.840.10045.4.3.3)', () => {
    expect(decodeOid(b(0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x03))).toBe(
      '1.2.840.10045.4.3.3',
    );
  });

  it('decodes an arc too large for a double without losing precision', () => {
    // 2.999.9007199254740993 — 2^53 + 1, one past Number.MAX_SAFE_INTEGER, so a
    // Number-based decoder silently rounds the last arc down to …992.
    // 0x88 0x37 = 1079 = 40*2 + 999 (the 2.999 prefix);
    // 0x90 80 80 80 80 80 80 01 = 16 * 128^7 + 1 = 2^53 + 1.
    const arc = b(0x90, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01);
    expect(decodeOid(new Uint8Array([0x88, 0x37, ...arc]))).toBe('2.999.9007199254740993');
  });

  it('refuses an empty OID and an unterminated final arc', () => {
    expect(decodeOid(b())).toBeNull();
    expect(decodeOid(b(0x2a, 0x86))).toBeNull();
  });

  it('caps the content length instead of grinding through a crafted arc', () => {
    // Bug: the BigInt accumulator is O(n) per octet, so decoding was O(n²) with no
    // bound at all — a hand-built 533 KB OID in a signatureAlgorithm froze the main
    // thread for ~3 minutes and then returned "not a certificate". Every other
    // limit in this engine is capped; this one was not.
    const huge = new Uint8Array(200_000).fill(0x80);
    huge[huge.length - 1] = 0x01;
    const started = Date.now();
    expect(decodeOid(huge)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1_000);
    // The longest arc a real certificate carries is nowhere near the cap.
    const long = new Uint8Array(129).fill(0x80);
    long[long.length - 1] = 0x01;
    expect(decodeOid(long)).toBeNull();
    const atCap = new Uint8Array(128).fill(0x80);
    atCap[atCap.length - 1] = 0x01;
    expect(decodeOid(atCap)).not.toBeNull();
  });
});

describe('decodeIntegerBig', () => {
  it('decodes a positive integer', () => {
    expect(decodeIntegerBig(b(0x01, 0x00))).toBe(256n);
  });

  it('decodes a negative integer from its two’s-complement bytes', () => {
    // 0xFF = -1, 0xFF 0x01 = -255, 0x80 = -128.
    expect(decodeIntegerBig(b(0xff))).toBe(-1n);
    expect(decodeIntegerBig(b(0xff, 0x01))).toBe(-255n);
    expect(decodeIntegerBig(b(0x80))).toBe(-128n);
  });

  it('decodes a 20-byte serial exactly (no float rounding)', () => {
    const bytes = b(
      0x00, 0x8a, 0x7d, 0x3e, 0x13, 0xd6, 0x2f, 0x30, 0xef, 0x23, 0x86, 0xbd, 0x29, 0x07, 0x6b,
      0x34, 0xf8,
    );
    expect(decodeIntegerBig(bytes)).toBe(0x8a7d3e13d62f30ef2386bd29076b34f8n);
  });

  it('refuses an empty integer', () => {
    expect(decodeIntegerBig(new Uint8Array(0))).toBeNull();
  });
});

describe('decodeBitString', () => {
  it('reports the unused-bit count and the raw bytes', () => {
    // 5 unused bits, one content byte 0xA0 → keyUsage-style bit field.
    const out = decodeBitString(b(0x05, 0xa0));
    expect(out).not.toBeNull();
    expect(out!.unusedBits).toBe(5);
    expect(Array.from(out!.bytes)).toEqual([0xa0]);
    expect(out!.bitLength).toBe(3);
  });

  it('handles a zero-unused-bits body (a wrapped SPKI / signature)', () => {
    const out = decodeBitString(b(0x00, 0xde, 0xad, 0xbe, 0xef));
    expect(out!.unusedBits).toBe(0);
    expect(Array.from(out!.bytes)).toEqual([0xde, 0xad, 0xbe, 0xef]);
    expect(out!.bitLength).toBe(32);
  });

  it('accepts the empty bit string (single 0x00 octet)', () => {
    const out = decodeBitString(b(0x00));
    expect(out!.bytes.length).toBe(0);
    expect(out!.bitLength).toBe(0);
  });

  it('refuses an empty body and an unused-bit count above 7', () => {
    expect(decodeBitString(new Uint8Array(0))).toBeNull();
    expect(decodeBitString(b(0x08, 0xff))).toBeNull();
  });
});

describe('decodeTime — the UTCTime 49/50 pivot', () => {
  const utc = (s: string) => {
    const bytes = new Uint8Array([0x17, s.length, ...[...s].map((c) => c.charCodeAt(0))]);
    return decodeTime(readNode(bytes)!);
  };
  const gen = (s: string) => {
    const bytes = new Uint8Array([0x18, s.length, ...[...s].map((c) => c.charCodeAt(0))]);
    return decodeTime(readNode(bytes)!);
  };

  it('reads YY = 49 as 2049 and YY = 50 as 1950 (RFC 5280 §4.1.2.5.1)', () => {
    const y49 = utc('490101000000Z');
    const y50 = utc('500101000000Z');
    expect(y49!.date.toISOString()).toBe('2049-01-01T00:00:00.000Z');
    expect(y50!.date.toISOString()).toBe('1950-01-01T00:00:00.000Z');
    expect(y49!.kind).toBe('utc');
  });

  it('reads ISRG Root X1’s own notBefore (150604110438Z)', () => {
    expect(utc('150604110438Z')!.date.toISOString()).toBe('2015-06-04T11:04:38.000Z');
  });

  it('accepts a UTCTime without seconds', () => {
    expect(utc('2601011200Z')!.date.toISOString()).toBe('2026-01-01T12:00:00.000Z');
  });

  it('reads a GeneralizedTime with a four-digit year', () => {
    const g = gen('20530601000000Z');
    expect(g!.date.toISOString()).toBe('2053-06-01T00:00:00.000Z');
    expect(g!.kind).toBe('generalized');
  });

  it('reads a GeneralizedTime with fractional seconds', () => {
    expect(gen('20530601000000.5Z')!.date.toISOString()).toBe('2053-06-01T00:00:00.500Z');
  });

  it('refuses a malformed or impossible time', () => {
    expect(utc('nonsense')).toBeNull();
    expect(utc('261301000000Z')).toBeNull(); // month 13
    expect(utc('260132000000Z')).toBeNull(); // day 32
    expect(gen('2053')).toBeNull();
  });
});

describe('decodeString', () => {
  const node = (tag: number, s: number[]) => readNode(new Uint8Array([tag, s.length, ...s]))!;

  it('decodes a PrintableString as ASCII', () => {
    expect(decodeString(node(TAG.PRINTABLE_STRING, [0x55, 0x53]))).toBe('US');
  });

  it('decodes a UTF8String, multi-byte characters included', () => {
    const bytes = Array.from(new TextEncoder().encode('Grüße 🌍'));
    expect(decodeString(node(TAG.UTF8_STRING, bytes))).toBe('Grüße 🌍');
  });

  it('decodes a BMPString as UTF-16BE', () => {
    expect(decodeString(node(TAG.BMP_STRING, [0x00, 0x41, 0x00, 0xe9]))).toBe('Aé');
  });

  it('decodes a UniversalString as UTF-32BE', () => {
    expect(decodeString(node(TAG.UNIVERSAL_STRING, [0x00, 0x00, 0x00, 0x41]))).toBe('A');
  });

  it('returns null for a tag that is not a string type', () => {
    expect(decodeString(node(TAG.INTEGER, [0x01]))).toBeNull();
  });
});

describe('helpers', () => {
  it('formats bytes as upper-case colon-separated hex', () => {
    expect(hexColon(b(0x00, 0x0a, 0xff))).toBe('00:0A:FF');
    expect(hexColon(new Uint8Array(0))).toBe('');
  });

  it('compares byte arrays', () => {
    expect(bytesEqual(b(1, 2, 3), b(1, 2, 3))).toBe(true);
    expect(bytesEqual(b(1, 2, 3), b(1, 2))).toBe(false);
    expect(bytesEqual(b(1, 2, 3), b(1, 2, 4))).toBe(false);
  });
});

describe('never throws', () => {
  it('survives every single-byte buffer', () => {
    for (let i = 0; i < 256; i += 1) {
      expect(() => readNode(b(i))).not.toThrow();
    }
  });

  it('survives structured garbage', () => {
    const cases: Uint8Array[] = [
      new Uint8Array(0),
      b(0x30),
      b(0x30, 0x80),
      b(0xff, 0xff, 0xff, 0xff),
      new Uint8Array(4096).fill(0x30),
      new Uint8Array(4096).fill(0xff),
    ];
    for (const c of cases) {
      expect(() => {
        const n = readNode(c);
        if (n) readChildren(n);
      }).not.toThrow();
    }
  });

  it('survives a deeply nested SEQUENCE without recursing forever', () => {
    // 2000 nested one-byte-content SEQUENCEs would blow a naive recursive walk.
    let inner = b(0x05, 0x00);
    for (let i = 0; i < 2000; i += 1) {
      inner = new Uint8Array([0x30, inner.length, ...inner]);
      if (inner.length > 120) break;
    }
    expect(() => {
      let node = readNode(inner);
      let guard = 0;
      while (node && node.constructed && guard < 5000) {
        const kids = readChildren(node);
        if (!kids || kids.length === 0) break;
        node = kids[0];
        guard += 1;
      }
    }).not.toThrow();
  });
});

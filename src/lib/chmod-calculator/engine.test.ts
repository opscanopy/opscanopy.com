/**
 * chmod Calculator engine tests — assert the LOCKED canonical octal + command
 * forms, the special-bit symbolic mapping (s/S, t/T), lossless symbolic↔octal
 * round-trips across all 512 values, and calm handling of invalid input.
 */
import { describe, it, expect } from 'vitest';
import { parseOctal, parseSymbolic, fromState } from './engine';

describe('parseOctal — canonical forms', () => {
  it('755 → rwxr-xr-x, -rwxr-xr-x, octal 755, chmod 755 file', () => {
    const r = parseOctal('755');
    expect(r.valid).toBe(true);
    expect(r.symbolic).toBe('rwxr-xr-x');
    expect(r.lsStyle).toBe('-rwxr-xr-x');
    expect(r.octal).toBe('755');
    expect(r.command).toBe('chmod 755 file');
  });

  it('644 → rw-r--r--, octal 644', () => {
    const r = parseOctal('644');
    expect(r.valid).toBe(true);
    expect(r.symbolic).toBe('rw-r--r--');
    expect(r.octal).toBe('644');
    expect(r.command).toBe('chmod 644 file');
  });

  it('700 → rwx------, octal 700', () => {
    const r = parseOctal('700');
    expect(r.symbolic).toBe('rwx------');
    expect(r.octal).toBe('700');
  });

  it('setuid 4755 → rwsr-xr-x, octal 4755', () => {
    const r = parseOctal('4755');
    expect(r.symbolic).toBe('rwsr-xr-x');
    expect(r.octal).toBe('4755');
    expect(r.command).toBe('chmod 4755 file');
  });

  it('setgid 2755 → rwxr-sr-x, octal 2755', () => {
    const r = parseOctal('2755');
    expect(r.symbolic).toBe('rwxr-sr-x');
    expect(r.octal).toBe('2755');
  });

  it('sticky 1777 → rwxrwxrwt, octal 1777', () => {
    const r = parseOctal('1777');
    expect(r.symbolic).toBe('rwxrwxrwt');
    expect(r.octal).toBe('1777');
  });
});

describe('parseOctal — UPPERCASE special bits (execute off)', () => {
  it('4644 → rwSr--r-- (setuid, no user exec)', () => {
    const r = parseOctal('4644');
    expect(r.symbolic).toBe('rwSr--r--');
    expect(r.octal).toBe('4644');
  });

  it('2644 → rw-r-Sr-- (setgid S)', () => {
    const r = parseOctal('2644');
    expect(r.symbolic).toBe('rw-r-Sr--');
    expect(r.octal).toBe('2644');
  });

  it('1666 → rw-rw-rwT (sticky T)', () => {
    const r = parseOctal('1666');
    expect(r.symbolic).toBe('rw-rw-rwT');
    expect(r.octal).toBe('1666');
  });
});

describe('parseSymbolic', () => {
  it('accepts the 9-char form', () => {
    const r = parseSymbolic('rwxr-xr-x');
    expect(r.valid).toBe(true);
    expect(r.octal).toBe('755');
  });

  it('strips a leading ls -l type char (10-char form)', () => {
    const r = parseSymbolic('-rwxr-xr-x');
    expect(r.valid).toBe(true);
    expect(r.octal).toBe('755');
    const dir = parseSymbolic('drwxr-xr-x');
    expect(dir.valid).toBe(true);
    expect(dir.octal).toBe('755');
  });

  it('reads s/S and t/T back to special bits', () => {
    expect(parseSymbolic('rwsr-xr-x').octal).toBe('4755');
    expect(parseSymbolic('rwSr--r--').octal).toBe('4644');
    expect(parseSymbolic('rwxr-sr-x').octal).toBe('2755');
    expect(parseSymbolic('rw-r-Sr--').octal).toBe('2644');
    expect(parseSymbolic('rwxrwxrwt').octal).toBe('1777');
    expect(parseSymbolic('rw-rw-rwT').octal).toBe('1666');
  });
});

describe('round-trip: symbolic ↔ octal is lossless for all 512 values', () => {
  it('parseSymbolic(parseOctal(o).symbolic).octal === parseOctal(o).octal', () => {
    for (let o = 0o000; o <= 0o777; o++) {
      const oct = o.toString(8).padStart(3, '0');
      const fwd = parseOctal(oct);
      expect(fwd.valid).toBe(true);
      const back = parseSymbolic(fwd.symbolic!);
      expect(back.octal).toBe(fwd.octal);
    }
  });

  it('round-trips 4-digit values (special bits) too', () => {
    for (let o = 0; o <= 0o7777; o++) {
      const oct = o.toString(8).padStart(4, '0');
      const fwd = parseOctal(oct);
      expect(fwd.valid).toBe(true);
      const back = parseSymbolic(fwd.symbolic!);
      expect(back.octal).toBe(fwd.octal);
    }
  });
});

describe('fromState mirrors the other entry points', () => {
  it('produces the same result as parseOctal for the same bits', () => {
    const viaOctal = parseOctal('4755');
    const viaState = fromState(viaOctal.state!);
    expect(viaState.octal).toBe(viaOctal.octal);
    expect(viaState.symbolic).toBe(viaOctal.symbolic);
    expect(viaState.lsStyle).toBe(viaOctal.lsStyle);
    expect(viaState.command).toBe(viaOctal.command);
  });
});

describe('invalid input never throws', () => {
  it('returns { valid:false } for bad values', () => {
    for (const bad of ['8', 'rwx', '', 'rwxr-xr', '99999', 'zzzzzzzzz']) {
      const asOctal = parseOctal(bad);
      const asSym = parseSymbolic(bad);
      expect(asOctal.valid).toBe(false);
      expect(asSym.valid).toBe(false);
    }
  });

  it('rejects a digit above 7', () => {
    expect(parseOctal('758').valid).toBe(false);
  });
});

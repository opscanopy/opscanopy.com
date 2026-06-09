import { describe, it, expect } from 'vitest';
import { calculate } from './engine';
import { examples } from './examples';
import type { K8sResult } from './types';

/**
 * Kubernetes Resource Calculator — engine tests. Vectors are anchored to the
 * documented contract: CPU normalises to millicores ("500m" → 500m / 0.5 cores,
 * "2" → 2000m / 2 cores) and memory normalises to bytes with binary suffixes at
 * 1024^n (256Mi = 268435456, 1Gi = 1073741824) and decimal suffixes at 1000^n
 * (1G = 1000000000). Totals multiply per-pod values across the replica count,
 * a limit below its request raises a non-fatal warning, blank fields are
 * skipped, and any unparseable field returns { valid:false } without throwing.
 */

/** Look up a single rendered row by its exact label. */
function row(result: K8sResult, label: string): string {
  const found = result.rows.find((r) => r.label === label);
  if (!found) throw new Error(`no row labelled "${label}"`);
  return found.value;
}

/** True when a row with the given label exists. */
function has(result: K8sResult, label: string): boolean {
  return result.rows.some((r) => r.label === label);
}

describe('k8s-resources calculate()', () => {
  describe('CPU parsing (millicores)', () => {
    it('reads "500m" as 500 millicores (0.5 cores)', () => {
      const r = calculate({ cpuRequest: '500m' });
      expect(r.valid).toBe(true);
      expect(row(r, 'CPU request (per pod)')).toBe('500m (0.5 cores)');
    });

    it('reads a bare "2" as 2000 millicores (2 cores)', () => {
      const r = calculate({ cpuRequest: '2' });
      expect(r.valid).toBe(true);
      expect(row(r, 'CPU request (per pod)')).toBe('2000m (2 cores)');
    });

    it('singularizes exactly one core', () => {
      const r = calculate({ cpuRequest: '1' });
      expect(r.valid).toBe(true);
      // 1000m === 1 core (singular, not "cores").
      expect(row(r, 'CPU request (per pod)')).toBe('1000m (1 core)');
    });

    it('parses a CPU limit independently of the request', () => {
      const r = calculate({ cpuLimit: '250m' });
      expect(r.valid).toBe(true);
      expect(row(r, 'CPU limit (per pod)')).toBe('250m (0.25 cores)');
    });
  });

  describe('memory parsing (bytes)', () => {
    it('256Mi === 268435456 bytes (binary, 1024^2)', () => {
      const r = calculate({ memRequest: '256Mi' });
      expect(r.valid).toBe(true);
      expect(row(r, 'Memory request (per pod)')).toContain('268435456 bytes');
    });

    it('1Gi === 1073741824 bytes (binary, 1024^3)', () => {
      const r = calculate({ memRequest: '1Gi' });
      expect(r.valid).toBe(true);
      expect(row(r, 'Memory request (per pod)')).toContain('1073741824 bytes');
    });

    it('1G === 1000000000 bytes (decimal, 1000^3)', () => {
      const r = calculate({ memRequest: '1G' });
      expect(r.valid).toBe(true);
      expect(row(r, 'Memory request (per pod)')).toContain('1000000000 bytes');
    });

    it('a plain integer is a byte count', () => {
      const r = calculate({ memRequest: '268435456' });
      expect(r.valid).toBe(true);
      expect(row(r, 'Memory request (per pod)')).toContain('268435456 bytes');
    });
  });

  describe('totals across replicas', () => {
    it('multiplies CPU and memory per-pod values by the replica count (×3)', () => {
      const r = calculate({ cpuRequest: '500m', memRequest: '256Mi', replicas: '3' });
      expect(r.valid).toBe(true);
      expect(row(r, 'Replicas')).toBe('3');
      // 500m × 3 = 1500m = 1.5 cores.
      expect(row(r, 'Total CPU request')).toBe('1.5 cores (1500m)');
      // 268435456 × 3 = 805306368 bytes.
      expect(row(r, 'Total memory request')).toContain('805306368 bytes');
    });

    it('defaults to a single replica when the count is blank (total === per-pod)', () => {
      const r = calculate({ cpuRequest: '2', memRequest: '1Gi' });
      expect(r.valid).toBe(true);
      expect(row(r, 'Replicas')).toBe('1');
      expect(row(r, 'Total CPU request')).toBe('2 cores (2000m)');
      expect(row(r, 'Total memory request')).toContain('1073741824 bytes');
    });

    it('totals the limit rows across replicas too', () => {
      const r = calculate({ cpuLimit: '1', memLimit: '512Mi', replicas: '3' });
      expect(r.valid).toBe(true);
      expect(row(r, 'Total CPU limit')).toBe('3 cores (3000m)');
      // 512Mi = 536870912 bytes × 3 = 1610612736 bytes.
      expect(row(r, 'Total memory limit')).toContain('1610612736 bytes');
    });
  });

  describe('limit-below-request warning', () => {
    it('warns when the CPU limit is below the CPU request', () => {
      const r = calculate({ cpuRequest: '1', cpuLimit: '500m' });
      expect(r.valid).toBe(true);
      expect(r.warnings.some((w) => /CPU limit is below the CPU request/i.test(w))).toBe(true);
    });

    it('warns when the memory limit is below the memory request', () => {
      const r = calculate({ memRequest: '1Gi', memLimit: '512Mi' });
      expect(r.valid).toBe(true);
      expect(r.warnings.some((w) => /Memory limit is below the memory request/i.test(w))).toBe(true);
    });

    it('does not fire the warning when the limit meets or exceeds the request', () => {
      const r = calculate({ cpuRequest: '500m', cpuLimit: '1', memRequest: '256Mi', memLimit: '512Mi' });
      expect(r.valid).toBe(true);
      expect(r.warnings.some((w) => /below the (CPU|memory) request/i.test(w))).toBe(false);
    });
  });

  describe('blank fields are skipped', () => {
    it('omits rows for fields that are not supplied', () => {
      const r = calculate({ cpuRequest: '500m' });
      expect(r.valid).toBe(true);
      expect(has(r, 'CPU request (per pod)')).toBe(true);
      expect(has(r, 'CPU limit (per pod)')).toBe(false);
      expect(has(r, 'Memory request (per pod)')).toBe(false);
      expect(has(r, 'Memory limit (per pod)')).toBe(false);
    });

    it('treats empty-string and whitespace-only fields as absent', () => {
      const r = calculate({ cpuRequest: '500m', cpuLimit: '', memRequest: '   ' });
      expect(r.valid).toBe(true);
      expect(has(r, 'CPU limit (per pod)')).toBe(false);
      expect(has(r, 'Memory request (per pod)')).toBe(false);
    });
  });

  describe('the documented examples', () => {
    it('every bundled example produces a valid result with rows', () => {
      for (const ex of examples) {
        const r = calculate(ex.input);
        expect(r.valid, `${ex.label} should be valid`).toBe(true);
        expect(r.error).toBeUndefined();
        expect(r.rows.length).toBeGreaterThan(0);
      }
    });

    it('the misconfigured example surfaces a limit-below-request warning', () => {
      const ex = examples.find((e) => e.id === 'limit-below-request');
      expect(ex).toBeDefined();
      const r = calculate(ex!.input);
      expect(r.valid).toBe(true);
      expect(r.warnings.length).toBeGreaterThan(0);
      expect(r.warnings.some((w) => /below the (CPU|memory) request/i.test(w))).toBe(true);
    });
  });

  describe('invalid input returns valid:false (never throws)', () => {
    it('flags an entirely empty input', () => {
      const r = calculate({});
      expect(r.valid).toBe(false);
      expect(r.error).toBeTruthy();
      expect(r.rows).toEqual([]);
    });

    it('flags a replicas-only input (no resource field)', () => {
      const r = calculate({ replicas: '3' });
      expect(r.valid).toBe(false);
      expect(r.error).toBeTruthy();
      expect(r.rows).toEqual([]);
    });

    it('flags an unparseable CPU quantity, naming the field', () => {
      const r = calculate({ cpuRequest: 'banana' });
      expect(r.valid).toBe(false);
      expect(r.error).toMatch(/cpuRequest/);
      expect(r.rows).toEqual([]);
    });

    it('flags an unparseable memory quantity, naming the field', () => {
      const r = calculate({ memRequest: '10MB' });
      expect(r.valid).toBe(false);
      expect(r.error).toMatch(/memRequest/);
      expect(r.rows).toEqual([]);
    });

    it('flags a non-positive-integer replica count', () => {
      const r = calculate({ cpuRequest: '500m', replicas: '0' });
      expect(r.valid).toBe(false);
      expect(r.error).toMatch(/replicas/);
      expect(r.rows).toEqual([]);
    });

    it('never throws on hostile input', () => {
      const hostile = [
        {},
        { cpuRequest: '🙂' },
        { cpuRequest: '-1' },
        { memRequest: 'NaN' },
        { memRequest: 'Infinity' },
        { replicas: '-5' },
        { cpuLimit: 'abc', memLimit: 'xyz' },
        { memRequest: '1.5.5Gi' },
      ];
      for (const input of hostile) {
        expect(() => calculate(input)).not.toThrow();
      }
    });
  });
});

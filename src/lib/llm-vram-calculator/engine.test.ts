import { describe, it, expect } from 'vitest';
import { estimate, kvCacheGiB, weightsGiB, QUANTS, TIERS, LIMITS, OVERHEAD_GIB } from './engine';
import { PRESETS, presetBySlug, nearestPreset } from './presets';
import { examples } from './examples';

describe('kvCacheGiB — FP16 KV, 2·layers·kvHeads·headDim·ctx·2B / 2^30', () => {
  it('Llama 3.1 8B at 128k = 16.0 GiB', () => {
    expect(kvCacheGiB(32, 8, 128, 131072)).toBeCloseTo(16.0, 2);
  });
  it('Llama 3.1 70B at 128k = 40.0 GiB', () => {
    expect(kvCacheGiB(80, 8, 128, 131072)).toBeCloseTo(40.0, 2);
  });
});

describe('weightsGiB — bpw from llama.cpp tools/quantize/README.md (Llama-3.1-8B column)', () => {
  // https://github.com/ggml-org/llama.cpp/blob/master/tools/quantize/README.md
  // Q2_K 3.1593 · Q3_K_M 3.9960 · Q4_K_M 4.8944 · Q5_K_M 5.7036 · Q6_K 6.5633 · Q8_0 8.5008 · F16 16.0005
  it('pins the quant table', () => {
    expect(Object.fromEntries(QUANTS.map((q) => [q.id, q.bpw]))).toEqual({
      fp16: 16, q8_0: 8.5, q6_k: 6.56, q5_k_m: 5.7, q4_k_m: 4.89, q3_k_m: 4.0, q2_k: 3.16,
    });
  });
  it('8B at Q4_K_M ≈ 4.56 GiB', () => {
    expect(weightsGiB(8, 4.89)).toBeCloseTo(4.555, 2);
  });
  it('8B at FP16 = 14.90 GiB', () => {
    expect(weightsGiB(8, 16)).toBeCloseTo(14.9, 1);
  });
});

describe('estimate', () => {
  it('seeds examples[0] with a preset architecture and sums the parts', () => {
    const r = estimate(examples[0].input);
    expect(r.valid).toBe(true);
    expect(r.arch).toMatchObject({ layers: 32, kvHeads: 8, headDim: 128, estimated: false, presetName: 'Llama 3.1 8B' });
    expect(r.totalGiB).toBeCloseTo(r.weightsGiB + r.kvGiB + OVERHEAD_GIB, 10);
    expect(r.kvGiB).toBeCloseTo(1.0, 3); // 8k is 1/16 of 128k
    expect(r.minTierGiB).toBe(8);
    expect(r.tiers.map((t) => t.gib)).toEqual(TIERS.map((t) => t.gib));
  });

  it('is monotonic in params and in context', () => {
    const base = { quant: 'q4_k_m' as const, context: 8192, preset: 'llama-3-1-8b' };
    expect(estimate({ ...base, params: 8 }).totalGiB).toBeLessThan(estimate({ ...base, params: 9 }).totalGiB);
    expect(estimate({ ...base, params: 8 }).totalGiB).toBeLessThan(estimate({ ...base, params: 8, context: 16384 }).totalGiB);
  });

  it('MoE uses total params (Mixtral 8x7B = 46.7B)', () => {
    const r = estimate({ params: 46.7, quant: 'fp16', context: 512, preset: 'mixtral-8x7b' });
    expect(r.weightsGiB).toBeCloseTo(weightsGiB(46.7, 16), 6);
    expect(r.weightsGiB).toBeGreaterThan(80);
  });

  it('custom preset estimates the architecture from the nearest preset', () => {
    const r = estimate({ params: 13, quant: 'q8_0', context: 4096, preset: 'custom' });
    expect(r.arch.estimated).toBe(true);
    expect(r.arch.presetName).toBeUndefined();
    expect(r.arch.layers).toBe(nearestPreset(13).layers);
    expect(estimate({ params: 13, quant: 'q8_0', context: 4096 }).arch.estimated).toBe(true);
  });

  it('clamps to LIMITS', () => {
    const r = estimate({ params: 9999, quant: 'fp16', context: 10_000_000 });
    expect(r.params).toBe(LIMITS.params.max);
    expect(r.context).toBe(LIMITS.context.max);
    const lo = estimate({ params: 0, quant: 'fp16', context: 1 });
    expect(lo.params).toBe(LIMITS.params.min);
    expect(lo.context).toBe(LIMITS.context.min);
  });

  it('returns a specific error on non-finite input', () => {
    expect(estimate({ params: NaN, quant: 'fp16', context: 8192 })).toMatchObject({ valid: false, error: expect.stringContaining('Parameter count') });
    expect(estimate({ params: 8, quant: 'fp16', context: Infinity })).toMatchObject({ valid: false, error: expect.stringContaining('Context length') });
    expect(estimate({ params: 8, quant: 'q9' as never, context: 8192 })).toMatchObject({ valid: false, error: expect.stringContaining('quantization') });
  });

  it('minTierGiB is null past 80 GiB', () => {
    const r = estimate({ params: 405, quant: 'q4_k_m', context: 8192, preset: 'llama-3-1-405b' });
    expect(r.minTierGiB).toBeNull();
    expect(r.tiers.every((t) => !t.fits)).toBe(true);
  });
});

describe('presets', () => {
  it('every preset has positive fields, maxContext ≥ 8192 and a config.json source', () => {
    for (const p of PRESETS) {
      expect(p.params, p.slug).toBeGreaterThan(0);
      expect(p.layers, p.slug).toBeGreaterThan(0);
      expect(p.kvHeads, p.slug).toBeGreaterThan(0);
      expect(p.headDim, p.slug).toBeGreaterThan(0);
      expect(p.maxContext, p.slug).toBeGreaterThanOrEqual(8192);
      expect(p.source, p.slug).toMatch(/^https:\/\/huggingface\.co\/.+\/config\.json$/);
    }
    expect(new Set(PRESETS.map((p) => p.slug)).size).toBe(PRESETS.length);
  });
  it('presetBySlug / nearestPreset', () => {
    expect(presetBySlug('llama-3-1-8b')?.name).toBe('Llama 3.1 8B');
    expect(presetBySlug('nope')).toBeUndefined();
    expect(nearestPreset(12.4).params).toBe(12);
    expect(nearestPreset(13.6).params).toBe(14);
    expect(nearestPreset(50).params).toBe(46.7);
    expect(nearestPreset(1000).slug).toBe('llama-3-1-405b');
  });
  it('every example references a real preset within limits', () => {
    for (const e of examples) {
      expect(presetBySlug(e.input.preset!), e.label).toBeDefined();
      expect(e.input.context).toBeLessThanOrEqual(presetBySlug(e.input.preset!)!.maxContext);
    }
  });
});

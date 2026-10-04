/**
 * LLM VRAM Calculator — pure estimate, no DOM, no clock. All sizes in GiB (÷ 2^30).
 *
 *   weights  = params · 1e9 · bpw / 8 / 2^30
 *   KV cache = 2 (K and V) · layers · kvHeads · headDim · context · 2 bytes (FP16) / 2^30
 *   overhead = fixed 1.5 GiB (runtime + compute buffers — an estimate)
 */
import type { GpuTier, Quant, VramInput, VramResult } from './types';
import { nearestPreset, presetBySlug } from './presets';

const GIB = 2 ** 30;

/**
 * Effective bits per weight, measured by llama.cpp on Llama-3.1-8B (the "bpw" column):
 * https://github.com/ggml-org/llama.cpp/blob/master/tools/quantize/README.md
 * Rounded to two decimals; the 7B-era figures the plan quoted (Q2_K 3.35, Q3_K_M 3.91, Q4_K_M 4.85)
 * are superseded by that table.
 */
export const QUANTS: { id: Quant; label: string; bpw: number }[] = [
  { id: 'fp16', label: 'FP16', bpw: 16 },
  { id: 'q8_0', label: 'Q8_0', bpw: 8.5 },
  { id: 'q6_k', label: 'Q6_K', bpw: 6.56 },
  { id: 'q5_k_m', label: 'Q5_K_M', bpw: 5.7 },
  { id: 'q4_k_m', label: 'Q4_K_M', bpw: 4.89 },
  { id: 'q3_k_m', label: 'Q3_K_M', bpw: 4.0 },
  { id: 'q2_k', label: 'Q2_K', bpw: 3.16 },
];

export const OVERHEAD_GIB = 1.5;

export const TIERS: { gib: number; cards: string[] }[] = [
  { gib: 8, cards: ['RTX 4060', 'RTX 3070', 'RX 7600'] },
  { gib: 12, cards: ['RTX 4070', 'RTX 3060 12GB', 'RTX 5070'] },
  { gib: 16, cards: ['RTX 4060 Ti 16GB', 'RTX 4080', 'RTX 5080'] },
  { gib: 24, cards: ['RTX 4090', 'RTX 3090', 'RX 7900 XTX'] },
  { gib: 32, cards: ['RTX 5090', 'V100 32GB'] },
  { gib: 48, cards: ['RTX A6000', 'RTX 6000 Ada', 'L40S'] },
  { gib: 80, cards: ['A100 80GB', 'H100 80GB'] },
];

export const LIMITS = { params: { min: 0.1, max: 405 }, context: { min: 512, max: 131072 } };

export function weightsGiB(paramsB: number, bpw: number): number {
  return (paramsB * 1e9 * bpw) / 8 / GIB;
}

export function kvCacheGiB(layers: number, kvHeads: number, headDim: number, context: number): number {
  return (2 * layers * kvHeads * headDim * context * 2) / GIB;
}

const clamp = (n: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, n));

export function estimate(input: VramInput): VramResult {
  const quant = QUANTS.find((q) => q.id === input.quant);
  const base: VramResult = {
    valid: false,
    params: input.params,
    quant: input.quant,
    quantLabel: quant?.label ?? String(input.quant),
    bpw: quant?.bpw ?? 0,
    context: input.context,
    arch: { layers: 0, kvHeads: 0, headDim: 0, estimated: true },
    weightsGiB: 0,
    kvGiB: 0,
    overheadGiB: OVERHEAD_GIB,
    totalGiB: 0,
    tiers: [],
    minTierGiB: null,
  };
  if (!quant) return { ...base, error: `Unknown quantization "${String(input.quant)}".` };
  if (typeof input.params !== 'number' || !Number.isFinite(input.params))
    return { ...base, error: 'Parameter count must be a number of billions, e.g. 8 or 70.' };
  if (typeof input.context !== 'number' || !Number.isFinite(input.context))
    return { ...base, error: 'Context length must be a number of tokens, e.g. 8192.' };

  const params = clamp(input.params, LIMITS.params);
  const context = Math.round(clamp(input.context, LIMITS.context));

  const preset = input.preset && input.preset !== 'custom' ? presetBySlug(input.preset) : undefined;
  const shape = preset ?? nearestPreset(params);
  const arch = {
    layers: shape.layers,
    kvHeads: shape.kvHeads,
    headDim: shape.headDim,
    estimated: !preset,
    presetName: preset?.name,
  };

  const weights = weightsGiB(params, quant.bpw);
  const kv = kvCacheGiB(arch.layers, arch.kvHeads, arch.headDim, context);
  const total = weights + kv + OVERHEAD_GIB;
  const tiers: GpuTier[] = TIERS.map((t) => ({ ...t, fits: total <= t.gib }));
  const minTier = tiers.find((t) => t.fits);

  return {
    ...base,
    valid: true,
    params,
    context,
    arch,
    weightsGiB: weights,
    kvGiB: kv,
    totalGiB: total,
    tiers,
    minTierGiB: minTier ? minTier.gib : null,
  };
}

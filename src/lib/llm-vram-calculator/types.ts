/** LLM VRAM Calculator — shared types. All sizes are GiB (÷ 2^30); GPUs are sold in GiB. */

export type Quant = 'fp16' | 'q8_0' | 'q6_k' | 'q5_k_m' | 'q4_k_m' | 'q3_k_m' | 'q2_k';

export interface ModelPreset {
  slug: string;
  name: string;
  /** Billions of parameters, TOTAL (MoE counts every expert — that is what sits in VRAM). */
  params: number;
  layers: number;
  kvHeads: number;
  headDim: number;
  /** `max_position_embeddings` from the model's config.json. */
  maxContext: number;
  /** The Hugging Face config.json URL the shape was read from. */
  source: string;
}

export interface VramInput {
  /** Billions of parameters. */
  params: number;
  quant: Quant;
  /** Context window in tokens. */
  context: number;
  /** Preset slug, or 'custom' (architecture is then estimated from the nearest preset). */
  preset?: string;
}

export interface GpuTier {
  gib: number;
  cards: string[];
  fits: boolean;
}

export interface VramResult {
  valid: boolean;
  error?: string;
  params: number;
  quant: Quant;
  quantLabel: string;
  bpw: number;
  context: number;
  arch: { layers: number; kvHeads: number; headDim: number; estimated: boolean; presetName?: string };
  weightsGiB: number;
  kvGiB: number;
  overheadGiB: number;
  totalGiB: number;
  tiers: GpuTier[];
  /** Smallest tier that fits, or null when the model exceeds the largest (80 GiB). */
  minTierGiB: number | null;
}

/**
 * Model architecture presets. Every shape (layers / kvHeads / headDim / maxContext) was read
 * from the model's Hugging Face config.json on 2026-10-04 — `source` is that URL. The Meta and
 * Google repos are gated, so those were confirmed through the ungated `unsloth/*` mirrors
 * (byte-identical configs) and, for 405B, `NousResearch/Hermes-3-Llama-3.1-405B`.
 *
 * headDim = explicit `head_dim` where present, else hidden_size / num_attention_heads.
 * `params` is the marketing size the model is known by (what a user types), except Mixtral,
 * which carries its TOTAL 46.7B — all eight experts live in VRAM, not the 12.9B active.
 */
import type { ModelPreset } from './types';

const hf = (repo: string) => `https://huggingface.co/${repo}/resolve/main/config.json`;

export const PRESETS: ModelPreset[] = [
  { slug: 'llama-3-2-3b', name: 'Llama 3.2 3B', params: 3, layers: 28, kvHeads: 8, headDim: 128, maxContext: 131072, source: hf('meta-llama/Llama-3.2-3B') },
  { slug: 'llama-3-1-8b', name: 'Llama 3.1 8B', params: 8, layers: 32, kvHeads: 8, headDim: 128, maxContext: 131072, source: hf('meta-llama/Llama-3.1-8B') },
  { slug: 'llama-3-1-70b', name: 'Llama 3.1 70B', params: 70, layers: 80, kvHeads: 8, headDim: 128, maxContext: 131072, source: hf('meta-llama/Llama-3.1-70B') },
  { slug: 'llama-3-1-405b', name: 'Llama 3.1 405B', params: 405, layers: 126, kvHeads: 8, headDim: 128, maxContext: 131072, source: hf('meta-llama/Llama-3.1-405B') },
  { slug: 'qwen2-5-7b', name: 'Qwen2.5 7B', params: 7, layers: 28, kvHeads: 4, headDim: 128, maxContext: 131072, source: hf('Qwen/Qwen2.5-7B') },
  { slug: 'qwen2-5-14b', name: 'Qwen2.5 14B', params: 14, layers: 48, kvHeads: 8, headDim: 128, maxContext: 131072, source: hf('Qwen/Qwen2.5-14B') },
  { slug: 'qwen2-5-32b', name: 'Qwen2.5 32B', params: 32, layers: 64, kvHeads: 8, headDim: 128, maxContext: 131072, source: hf('Qwen/Qwen2.5-32B') },
  { slug: 'qwen2-5-72b', name: 'Qwen2.5 72B', params: 72, layers: 80, kvHeads: 8, headDim: 128, maxContext: 131072, source: hf('Qwen/Qwen2.5-72B') },
  { slug: 'mistral-7b-v0-3', name: 'Mistral 7B v0.3', params: 7, layers: 32, kvHeads: 8, headDim: 128, maxContext: 32768, source: hf('mistralai/Mistral-7B-v0.3') },
  { slug: 'mistral-nemo-12b', name: 'Mistral Nemo 12B', params: 12, layers: 40, kvHeads: 8, headDim: 128, maxContext: 131072, source: hf('mistralai/Mistral-Nemo-Base-2407') },
  { slug: 'gemma-2-9b', name: 'Gemma 2 9B', params: 9, layers: 42, kvHeads: 8, headDim: 256, maxContext: 8192, source: hf('google/gemma-2-9b') },
  { slug: 'gemma-2-27b', name: 'Gemma 2 27B', params: 27, layers: 46, kvHeads: 16, headDim: 128, maxContext: 8192, source: hf('google/gemma-2-27b') },
  { slug: 'mixtral-8x7b', name: 'Mixtral 8x7B', params: 46.7, layers: 32, kvHeads: 8, headDim: 128, maxContext: 32768, source: hf('mistralai/Mixtral-8x7B-v0.1') },
  { slug: 'deepseek-r1-distill-qwen-7b', name: 'DeepSeek-R1-Distill-Qwen 7B', params: 7, layers: 28, kvHeads: 4, headDim: 128, maxContext: 131072, source: hf('deepseek-ai/DeepSeek-R1-Distill-Qwen-7B') },
  { slug: 'deepseek-r1-distill-qwen-14b', name: 'DeepSeek-R1-Distill-Qwen 14B', params: 14, layers: 48, kvHeads: 8, headDim: 128, maxContext: 131072, source: hf('deepseek-ai/DeepSeek-R1-Distill-Qwen-14B') },
  { slug: 'deepseek-r1-distill-qwen-32b', name: 'DeepSeek-R1-Distill-Qwen 32B', params: 32, layers: 64, kvHeads: 8, headDim: 128, maxContext: 131072, source: hf('deepseek-ai/DeepSeek-R1-Distill-Qwen-32B') },
  { slug: 'deepseek-r1-distill-llama-8b', name: 'DeepSeek-R1-Distill-Llama 8B', params: 8, layers: 32, kvHeads: 8, headDim: 128, maxContext: 131072, source: hf('deepseek-ai/DeepSeek-R1-Distill-Llama-8B') },
  { slug: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek-R1-Distill-Llama 70B', params: 70, layers: 80, kvHeads: 8, headDim: 128, maxContext: 131072, source: hf('deepseek-ai/DeepSeek-R1-Distill-Llama-70B') },
];

export function presetBySlug(slug: string): ModelPreset | undefined {
  return PRESETS.find((p) => p.slug === slug);
}

/** The preset closest in size — used to estimate an architecture for a custom parameter count. */
export function nearestPreset(paramsB: number): ModelPreset {
  let best = PRESETS[0];
  for (const p of PRESETS) {
    if (Math.abs(p.params - paramsB) < Math.abs(best.params - paramsB)) best = p;
  }
  return best;
}

/** Example chips. examples[0] seeds the server-rendered result panel. */
import type { VramInput } from './types';

export interface Example {
  label: string;
  input: VramInput;
}

export const examples: Example[] = [
  { label: 'Llama 3.1 8B · Q4_K_M · 8k', input: { params: 8, quant: 'q4_k_m', context: 8192, preset: 'llama-3-1-8b' } },
  { label: 'Llama 3.1 70B · Q4_K_M · 8k', input: { params: 70, quant: 'q4_k_m', context: 8192, preset: 'llama-3-1-70b' } },
  { label: 'Qwen2.5 32B · Q5_K_M · 32k', input: { params: 32, quant: 'q5_k_m', context: 32768, preset: 'qwen2-5-32b' } },
  { label: 'DeepSeek-R1 Qwen 14B · Q8_0 · 16k', input: { params: 14, quant: 'q8_0', context: 16384, preset: 'deepseek-r1-distill-qwen-14b' } },
  { label: 'Mixtral 8x7B · Q4_K_M · 32k', input: { params: 46.7, quant: 'q4_k_m', context: 32768, preset: 'mixtral-8x7b' } },
  { label: 'Llama 3.1 8B · FP16 · 128k', input: { params: 8, quant: 'fp16', context: 131072, preset: 'llama-3-1-8b' } },
];

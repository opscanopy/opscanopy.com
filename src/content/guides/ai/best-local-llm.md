---
title: "Best Local LLMs to Run in 2026, by VRAM Budget"
description: "Which open-weight LLMs fit on an 8, 12, 16, 24 or 48 GiB GPU or an Apple Silicon Mac, at which quantization, and what each is good at: chat, coding, reasoning and multilingual work."
track: ai
order: 1
difficulty: beginner
estMinutes: 18
updatedDate: 2026-10-04
tags: ["llm", "local-llm", "ollama", "llama-cpp", "gguf", "quantization", "vram"]
relatedTools: ["llm-vram-calculator", "llm-token-counter"]
seoTitle: "Best Local LLMs in 2026 by VRAM: 8 GB to 48 GB"
metaDescription: "Which open LLMs fit an 8, 12, 16, 24 or 48 GB GPU or a Mac, at which quantization, for chat, coding and reasoning, with real VRAM numbers and licences."
faqs:
  - q: "What is the best local LLM for an 8 GB GPU?"
    a: "As of October 2026, a 7B or 8B model at Q4_K_M is the sweet spot: Qwen2.5 7B for general use and multilingual work, Qwen2.5-Coder 7B for code, Llama 3.1 8B for English chat, and DeepSeek-R1-Distill-Qwen 7B for step-by-step reasoning. Qwen2.5 7B at Q4_K_M with an 8K context needs about 5.9 GiB, which leaves room for a longer context on an 8 GiB card."
  - q: "What is the best local LLM for coding?"
    a: "Among the families covered here, Qwen2.5-Coder is the strongest code-specialised line you can run locally. Pick the 7B on an 8 to 12 GiB card, the 14B on 16 GiB, and the 32B on 24 GiB. The 32B at Q4_K_M with a 16K context needs about 23.7 GiB, so it just fits a 24 GiB card."
  - q: "Can I run a 70B model locally?"
    a: "Yes, with 48 GiB of VRAM or a Mac with enough unified memory. Llama 3.1 70B at Q4_K_M needs about 43.9 GiB with an 8K context and about 46.4 GiB at 16K. On a single 24 GiB card you would have to offload most layers to system RAM, which works but is several times slower."
  - q: "Which quantization should I use for a local LLM?"
    a: "Q4_K_M is the usual default: about 4.89 bits per weight, roughly 30% of the FP16 size, with a small quality loss. Step up to Q5_K_M or Q8_0 when you have spare memory and want the model closer to its original quality; drop to Q3_K_M only to squeeze a larger model into a fixed budget."
  - q: "Why does a longer context window need more VRAM?"
    a: "Every token in the context stores a key and a value vector for every layer, so the KV cache grows linearly with context length. Llama 3.1 8B needs 1 GiB of KV cache at 8K tokens and 4 GiB at 32K, on top of its 4.55 GiB of Q4_K_M weights."
  - q: "Are local LLMs free to use commercially?"
    a: "It depends on the licence, not on running it locally. As of October 2026, Mistral 7B, Mistral Nemo, Mixtral 8x7B and most Qwen2.5 sizes (including Coder 7B, 14B and 32B) are Apache-2.0. Llama models use Meta's community licence, which adds an acceptable-use policy and terms for very large services, and Gemma uses Google's Gemma Terms of Use. Read the licence on the model card before you ship anything."
---

"Best local LLM" is the wrong question until you answer a narrower one: how much memory does your GPU have? A model that is excellent on paper is useless if it spills out of VRAM into system RAM and drops to a few tokens per second. This guide works the other way round. It starts from the memory you have (8, 12, 16, 24 or 48 GiB of VRAM, or an Apple Silicon Mac with unified memory) and tells you which open-weight models fit, at which quantization, how much context you can afford, and what each one is actually good at.

Every memory figure here comes from the same arithmetic the [LLM VRAM Calculator](/llm-vram-calculator/) uses, with the architecture of each model read from its published configuration. Model and hardware statements are as of October 2026; this space moves fast, so treat the method as the durable part and the shortlist as a snapshot.

---

## How to read the numbers

A model in memory has three parts, and the calculator adds them up:

- **Weights** = parameters × bits per weight ÷ 8. Quantization lowers the bits per weight.
- **KV cache** = 2 (keys and values) × layers × KV heads × head dimension × context length × 2 bytes. It grows linearly with context.
- **Overhead**: a fixed 1.5 GiB allowance for the runtime and compute buffers. This is an estimate; real overhead varies by runtime, batch size and driver.

The quantization levels used throughout, with their effective bits per weight as measured by llama.cpp:

| Quantization | Bits per weight | Size vs FP16 | When to use it |
|---|---|---|---|
| **FP16** | 16 | 100% | Fine-tuning, reference quality, plenty of memory |
| **Q8_0** | 8.5 | 53% | Near-lossless; worth it on small models when memory is spare |
| **Q5_K_M** | 5.7 | 36% | A step above the default when it still fits |
| **Q4_K_M** | 4.89 | 31% | The default for local inference; small quality loss |
| **Q3_K_M** | 4.0 | 25% | Last resort to squeeze a bigger model into a fixed budget |

All sizes are in GiB (2^30 bytes). GPU vendors label cards in "GB", but an "8 GB" card's memory is 8 GiB, so the tiers below map directly onto the number printed on the box.

> **Note:** The totals assume the whole model sits in VRAM. Runtimes like llama.cpp and Ollama can offload some layers to system RAM when a model does not fit, but every offloaded layer runs at CPU and memory-bus speed. A model that "runs" with half its layers offloaded is often several times slower than a smaller model that fits completely.

### A rule of thumb before you start

Leave about 10% headroom. Your desktop, browser and display compositor also use VRAM, and drivers reserve some for themselves. A model that computes to 7.9 GiB on an 8 GiB card will usually fail to load fully, or load and then fail as the context fills up.

## 8 GiB: 7B and 8B models at Q4_K_M

An 8 GiB card (as of October 2026: the RTX 4060, RTX 3070 or RX 7600 class) is the most common starting point, and it runs the 7B to 8B class comfortably at Q4_K_M.

| Model | Quant | Context | Weights | KV cache | Total |
|---|---|---|---|---|---|
| Llama 3.2 3B | Q8_0 | 8K | 2.97 GiB | 0.88 GiB | **5.34 GiB** |
| Qwen2.5 7B | Q4_K_M | 8K | 3.98 GiB | 0.44 GiB | **5.92 GiB** |
| Qwen2.5 7B | Q4_K_M | 32K | 3.98 GiB | 1.75 GiB | **7.23 GiB** |
| Mistral 7B v0.3 | Q4_K_M | 8K | 3.98 GiB | 1.00 GiB | **6.48 GiB** |
| Llama 3.1 8B | Q4_K_M | 8K | 4.55 GiB | 1.00 GiB | **7.05 GiB** |
| DeepSeek-R1-Distill-Qwen 7B | Q4_K_M | 8K | 3.98 GiB | 0.44 GiB | **5.92 GiB** |

### What to pick

- **General chat and multilingual:** [Qwen2.5 7B](/llm-vram-calculator/qwen2-5-7b/). It uses only 4 KV heads where most models in this class use 8, so its KV cache is half the size, which is why it reaches 32K context on an 8 GiB card while Llama 3.1 8B tops out around 12K (16K would need 8.05 GiB). Qwen2.5 was trained with broad multilingual coverage and is a strong choice for non-English work.
- **Coding:** Qwen2.5-Coder 7B. It shares the architecture of Qwen2.5 7B, so the same memory figures apply. It handles completion, explanation and small refactors well; do not expect it to plan a multi-file change on its own.
- **English chat and tool use:** [Llama 3.1 8B](/llm-vram-calculator/llama-3-1-8b/). Well-behaved, widely supported by every runtime, and the base of a large ecosystem of fine-tunes.
- **Reasoning:** DeepSeek-R1-Distill-Qwen 7B. It writes out a long chain of thought before answering, which helps on maths and logic puzzles but costs a lot of tokens; budget context for the thinking, not just the answer.
- **Tight memory or laptops:** Llama 3.2 3B. Small enough to run at Q8_0 with room to spare, and a sensible choice for summarisation, classification and other narrow tasks where a 7B model is overkill.

> **Tip:** At 8 GiB the KV cache is what decides your context length. Llama 3.1 8B at Q4_K_M is 7.05 GiB at 8K but 10.05 GiB at 32K. If you need long documents, a model with fewer KV heads (Qwen2.5 7B) beats a slightly better model that cannot hold the text.

## 12 GiB: Mistral Nemo, Qwen2.5 14B and Q8_0 small models

A 12 GiB card (as of October 2026: RTX 4070, RTX 3060 12GB, RTX 5070) opens two doors: running 7B and 8B models at Q8_0 for near-original quality, or stepping up to the 12B to 14B class at Q4_K_M.

| Model | Quant | Context | Weights | KV cache | Total |
|---|---|---|---|---|---|
| Llama 3.1 8B | Q8_0 | 8K | 7.92 GiB | 1.00 GiB | **10.42 GiB** |
| Qwen2.5 7B | Q8_0 | 16K | 6.93 GiB | 0.88 GiB | **9.30 GiB** |
| Mistral Nemo 12B | Q4_K_M | 8K | 6.83 GiB | 1.25 GiB | **9.58 GiB** |
| Gemma 2 9B | Q4_K_M | 8K | 5.12 GiB | 2.63 GiB | **9.25 GiB** |
| Qwen2.5 14B | Q4_K_M | 8K | 7.97 GiB | 1.50 GiB | **10.97 GiB** |
| DeepSeek-R1-Distill-Qwen 14B | Q4_K_M | 8K | 7.97 GiB | 1.50 GiB | **10.97 GiB** |

### What to pick

- **Best all-rounder at this size:** [Mistral Nemo 12B](/llm-vram-calculator/mistral-nemo-12b/). Built by Mistral AI with NVIDIA, Apache-2.0, a 128K context window and good multilingual ability. It is the model to try when an 8B feels thin.
- **Most capable that fits:** Qwen2.5 14B at Q4_K_M with an 8K context, at just under 11 GiB. It is noticeably better than the 7B on instruction following and structured output, but 12 GiB leaves little room for context; 16K pushes it to 12.47 GiB.
- **Writing quality:** Gemma 2 9B. Its prose is often rated above its size class. Its weakness is context: the model was trained with an 8,192-token window, and its 256-wide attention heads make the KV cache large for its size (2.63 GiB at 8K).
- **Reasoning:** DeepSeek-R1-Distill-Qwen 14B, if 8K is enough room for its thinking. Otherwise stay on the 7B distill with more context.

> **Note:** Gemma 2 alternates full attention with sliding-window attention, so runtimes that implement the sliding window store less KV cache than the full-attention formula predicts. The figures here are the conservative upper bound.

## 16 GiB: the 14B class with real context

At 16 GiB (as of October 2026: RTX 4060 Ti 16GB, RTX 4080, RTX 5080) the 14B class stops being a squeeze. This is the tier where a local model starts to feel like a capable assistant rather than a demo.

| Model | Quant | Context | Weights | KV cache | Total |
|---|---|---|---|---|---|
| Qwen2.5 14B | Q4_K_M | 16K | 7.97 GiB | 3.00 GiB | **12.47 GiB** |
| Qwen2.5 14B | Q5_K_M | 16K | 9.29 GiB | 3.00 GiB | **13.79 GiB** |
| Qwen2.5 14B | Q4_K_M | 32K | 7.97 GiB | 6.00 GiB | **15.47 GiB** |
| Mistral Nemo 12B | Q8_0 | 8K | 11.87 GiB | 1.25 GiB | **14.62 GiB** |
| Mistral Nemo 12B | Q4_K_M | 32K | 6.83 GiB | 5.00 GiB | **13.33 GiB** |
| Llama 3.1 8B | Q8_0 | 32K | 7.92 GiB | 4.00 GiB | **13.42 GiB** |
| Gemma 2 27B | Q3_K_M | 4K | 12.57 GiB | 1.44 GiB | **15.51 GiB** |

### What to pick

- **Coding:** Qwen2.5-Coder 14B at Q4_K_M or Q5_K_M with a 16K context. That leaves enough room to paste a few files and a stack trace. Its architecture matches [Qwen2.5 14B](/llm-vram-calculator/qwen2-5-14b/), so that page gives you its exact numbers at every quantization.
- **General use:** Qwen2.5 14B at Q5_K_M, or Mistral Nemo at Q8_0 if you prefer its style and want it close to original quality.
- **Long documents:** Mistral Nemo at Q4_K_M with 32K context uses 13.33 GiB, comfortably inside the budget.
- **Reasoning:** DeepSeek-R1-Distill-Qwen 14B with 16K context (12.47 GiB). The extra context matters more than the extra precision for a model that thinks out loud.

Gemma 2 27B technically fits at Q3_K_M with a 4K context, but 15.51 GiB on a 16 GiB card is too close to the edge once your desktop is using some of it. Treat it as a 24 GiB model.

## 24 GiB: the 27B to 32B sweet spot

A 24 GiB card (as of October 2026: RTX 4090, RTX 3090, RX 7900 XTX) is where local models get genuinely strong. The 32B class at Q4_K_M fits with a usable context, and for many everyday tasks it holds its own against hosted models from a generation or two earlier.

| Model | Quant | Context | Weights | KV cache | Total |
|---|---|---|---|---|---|
| Qwen2.5 32B | Q4_K_M | 8K | 18.22 GiB | 2.00 GiB | **21.72 GiB** |
| Qwen2.5 32B | Q4_K_M | 16K | 18.22 GiB | 4.00 GiB | **23.72 GiB** |
| DeepSeek-R1-Distill-Qwen 32B | Q4_K_M | 8K | 18.22 GiB | 2.00 GiB | **21.72 GiB** |
| Gemma 2 27B | Q4_K_M | 8K | 15.37 GiB | 2.88 GiB | **19.75 GiB** |
| Qwen2.5 14B | Q8_0 | 32K | 13.85 GiB | 6.00 GiB | **21.35 GiB** |
| Mixtral 8x7B | Q3_K_M | 4K | 21.75 GiB | 0.50 GiB | **23.75 GiB** |

### What to pick

- **Coding:** Qwen2.5-Coder 32B. As of October 2026 it is still one of the strongest open coding models that fit on one consumer card, and it is Apache-2.0. At 16K context it lands at 23.72 GiB, which is right at the limit; 8K to 12K is the safer setting on a card that also drives your display.
- **General use and structured output:** [Qwen2.5 32B](/llm-vram-calculator/qwen2-5-32b/), with the same footprint.
- **Reasoning:** [DeepSeek-R1-Distill-Qwen 32B](/llm-vram-calculator/deepseek-r1-distill-qwen-32b/). The largest R1 distill that fits a single 24 GiB card; noticeably better than the 14B on multi-step problems.
- **Writing:** Gemma 2 27B at Q4_K_M with its full 8K window, at 19.75 GiB.
- **Long context with high precision:** Qwen2.5 14B at Q8_0 with 32K context, if you value the extra room and precision over the bigger model.

Mixtral 8x7B is a mixture-of-experts model: only about 12.9B parameters are active per token, so it generates quickly, but all 46.7B parameters must sit in memory. It only fits 24 GiB at Q3_K_M with a short context. On this card the dense 32B models are the better use of the memory.

> **Tip:** If 24 GiB is just short for the context you want, quantizing the KV cache helps. llama.cpp and Ollama can store keys and values at 8 bits instead of 16, which roughly halves the KV figures in these tables. It needs flash attention enabled and costs a little accuracy.

## 48 GiB: 70B-class models

48 GiB arrives either as a workstation card (as of October 2026: RTX A6000, RTX 6000 Ada, L40S) or as two 24 GiB consumer cards with the model split across them. It is the entry point for the 70B class.

| Model | Quant | Context | Weights | KV cache | Total |
|---|---|---|---|---|---|
| Llama 3.1 70B | Q4_K_M | 8K | 39.85 GiB | 2.50 GiB | **43.85 GiB** |
| Llama 3.1 70B | Q4_K_M | 16K | 39.85 GiB | 5.00 GiB | **46.35 GiB** |
| Qwen2.5 72B | Q4_K_M | 8K | 40.99 GiB | 2.50 GiB | **44.99 GiB** |
| DeepSeek-R1-Distill-Llama 70B | Q4_K_M | 8K | 39.85 GiB | 2.50 GiB | **43.85 GiB** |
| Qwen2.5 32B | Q8_0 | 32K | 31.66 GiB | 8.00 GiB | **41.16 GiB** |
| Mixtral 8x7B | Q4_K_M | 32K | 26.58 GiB | 4.00 GiB | **32.08 GiB** |

### What to pick

- **Strongest general model:** Qwen2.5 72B or [Llama 3.1 70B](/llm-vram-calculator/llama-3-1-70b/) at Q4_K_M. Both fit with 8K context and a little room to spare; 16K is possible but tight.
- **Reasoning:** DeepSeek-R1-Distill-Llama 70B, the largest of the distills. It was distilled from Llama 3.3 70B Instruct, which shares Llama 3.1 70B's architecture, so the memory figures are identical.
- **Quality over size:** Qwen2.5 32B or Qwen2.5-Coder 32B at Q8_0 with 32K context. For coding in particular, a near-lossless 32B with a long context is often more useful than a 4-bit 72B with a short one.
- **Speed:** Mixtral 8x7B at Q4_K_M. With only two experts active per token it generates faster than a dense model of the same memory footprint, and its 32K window fits easily.

Splitting a model across two cards works in llama.cpp, Ollama and LM Studio, but each card needs its own share of overhead and the cards exchange activations at every layer boundary. Expect two 24 GiB cards to behave like slightly less than one 48 GiB card. Llama 3.1 405B at Q4_K_M needs about 236 GiB at 8K context and is out of reach for any single workstation.

## Apple Silicon and unified memory

Apple Silicon Macs share one pool of memory between the CPU and GPU, so the question becomes "how much of my RAM can the GPU use?" By default macOS caps GPU allocations at roughly two-thirds to three-quarters of total memory, depending on how much you have. A Mac with more unified memory can hold models that no single consumer GPU can, at the cost of lower memory bandwidth than a high-end discrete card, so generation is slower per token.

A practical mapping, using the default GPU share and the figures above:

| Unified memory | Usable for the model (approx.) | Comfortable choice |
|---|---|---|
| 16 GB | ~10 to 11 GiB | Qwen2.5 7B or Llama 3.1 8B at Q4_K_M (Q8_0 is tight) |
| 24 GB | ~16 GiB | Qwen2.5 14B or Mistral Nemo at Q4_K_M with 16K |
| 32 to 36 GB | ~21 to 26 GiB | Gemma 2 27B at Q4_K_M; Qwen2.5 32B at Q4_K_M with 8K on 36 GB |
| 64 GB | ~48 GiB | Llama 3.1 70B or Qwen2.5 72B at Q4_K_M |
| 96 GB and up | 70+ GiB | 70B-class at Q5_K_M or above, or with long context |

The cap is adjustable. On recent macOS releases you can raise it until the next reboot:

```bash
# Allow the GPU to wire up to 56 GiB on a 64 GB Mac (resets on reboot)
sudo sysctl iogpu.wired_limit_mb=57344
```

Leave several gigabytes for macOS itself; pushing the limit to total RAM invites swapping, which is far worse than a smaller model.

> **Note:** On a Mac, look for MLX builds of a model as well as GGUF. LM Studio runs both, and MLX is Apple's own array framework tuned for this hardware. The memory arithmetic is the same; only the file format and the runtime differ.

## Context limits and licences at a glance

Context length and licence decide more deployments than benchmark scores do. As of October 2026:

| Family | Trained context | Licence | Notes |
|---|---|---|---|
| Llama 3.1 / 3.2 | 128K | Llama 3.1 / 3.2 Community License | Acceptable-use policy; separate terms for services above 700 million monthly users; attribution required |
| Qwen2.5 (7B, 14B, 32B) and Coder 7B/14B/32B | Up to 128K (32K native, longer via YaRN) | Apache-2.0 | The 3B and 72B general models use Qwen's own licences instead |
| Mistral 7B v0.3 | 32K | Apache-2.0 | |
| Mistral Nemo 12B | 128K | Apache-2.0 | |
| Mixtral 8x7B | 32K | Apache-2.0 | 46.7B total, ~12.9B active per token |
| Gemma 2 (9B, 27B) | 8K | Gemma Terms of Use | Prohibited-use policy applies to derivatives |
| DeepSeek-R1 distills | 128K | MIT for DeepSeek's contribution, plus the base model's licence | Qwen-based distills inherit Qwen2.5 terms, Llama-based ones the Llama licence |

"Trained context" is the model's ceiling, not a recommendation. Quality usually degrades well before the stated maximum, and the memory cost scales with every token you actually allocate. Size the context to the task, then check the total in the [calculator](/llm-vram-calculator/).

> **Caution:** Running a model locally does not change its licence. If a local model ends up inside a product, a customer deliverable or a hosted service, read the licence and acceptable-use policy on its model card first. "It runs on my laptop" is not a licence.

## Newer model generations

The families above are the ones with exact presets in the calculator, and they remain well supported by every runtime. As of October 2026, newer generations from the same labs (Qwen3, Gemma 3, Llama 4) and OpenAI's open-weight gpt-oss models are also available, and many outperform their predecessors at the same size. The sizing method does not change: enter the parameter count as a custom model in the [LLM VRAM Calculator](/llm-vram-calculator/), and remember that a mixture-of-experts model must hold all of its experts in memory, not just the active ones.

## How to run them

Three tools cover almost every local setup. All three read GGUF files, and all three can serve an OpenAI-compatible API, so code written against one usually works against the others.

### Ollama

Ollama is the shortest path from nothing to a running model. It is a single background service with a CLI and an HTTP API on port 11434. It pulls models from its own library, picks a sensible quantization (usually Q4_K_M) by default, and loads and unloads them on demand. Its default context window is small, so raise it explicitly when you need long inputs.

```bash
ollama pull qwen2.5-coder:14b
ollama run qwen2.5-coder:14b

# Raise the context for every model the server loads
OLLAMA_CONTEXT_LENGTH=16384 ollama serve

# Optional: 8-bit KV cache, roughly halving KV memory
OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 ollama serve
```

Inside an interactive session, `/set parameter num_ctx 16384` changes the context for that session only. Specific quantizations are separate tags on the model's library page, for example an `-instruct-q8_0` variant.

### llama.cpp

llama.cpp is the engine underneath much of the local-LLM world, Ollama and LM Studio included. Using it directly gives you every knob: exact context size, how many layers go to the GPU, KV cache type, and multi-GPU split. `llama-server` downloads a GGUF straight from Hugging Face and serves both a web UI and an OpenAI-compatible endpoint.

```bash
# Download a Q4_K_M GGUF from Hugging Face and serve it with a 16K context,
# all layers on the GPU, 8-bit KV cache
llama-server -hf bartowski/Qwen2.5-Coder-14B-Instruct-GGUF:Q4_K_M \
  -c 16384 -ngl 99 -fa on \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  --port 8080
```

If a model does not fit, lower `-ngl` to keep some layers in system RAM, and watch the tokens-per-second figure it reports. Flag spellings change between releases, so check `llama-server --help` on your build.

### LM Studio

LM Studio is a desktop app for people who would rather click than type. It searches Hugging Face for GGUF (and, on Apple Silicon, MLX) builds, tells you up front whether a given file is likely to fit your hardware, and lets you set context length and GPU offload with sliders. It includes a chat UI and a local server mode that exposes an OpenAI-compatible API, by default on port 1234. It is the easiest way to compare quantizations of one model side by side before you commit to a setup.

> **Tip:** Whichever runtime you use, measure your prompts before choosing a context size. Paste a typical prompt, file or log excerpt into the [LLM Token Counter](/llm-token-counter/) to see how many tokens it really is, then add room for the reply. Tokenizers differ between model families, so treat the count as an estimate for non-OpenAI models.

## A selection checklist

Work through these in order. Each step narrows the field.

1. **Find your real budget.** Take your VRAM (or your Mac's GPU share), subtract about 10% for the desktop and drivers. That is the number every total must fit under.
2. **Decide the task.** Coding points to Qwen2.5-Coder. Step-by-step reasoning points to an R1 distill. Multilingual work points to Qwen2.5 or Mistral Nemo. Polished English prose points to Gemma 2 or Llama 3.1.
3. **Decide the context.** Estimate your typical input with the [token counter](/llm-token-counter/) and add room for the output. A reasoning model needs extra for its chain of thought.
4. **Pick the largest model that fits at Q4_K_M** with that context. Use the [LLM VRAM Calculator](/llm-vram-calculator/) or a per-model page such as [Qwen2.5 14B](/llm-vram-calculator/qwen2-5-14b/) to check the total.
5. **Spend leftover memory wisely.** If there is room to spare, raise precision (Q5_K_M, then Q8_0) or context before reaching for an even larger model at Q3_K_M.
6. **Check the licence** against how you intend to use the output, especially for anything commercial.
7. **Test on your own work.** Benchmarks measure averages. Ten of your real prompts tell you more about whether a model is good enough for you than any leaderboard.

## Quick picks

If you just want an answer, as of October 2026:

| VRAM | General chat | Coding | Reasoning |
|---|---|---|---|
| 8 GiB | Qwen2.5 7B Q4_K_M | Qwen2.5-Coder 7B Q4_K_M | R1-Distill-Qwen 7B Q4_K_M |
| 12 GiB | Mistral Nemo 12B Q4_K_M | Qwen2.5-Coder 7B Q8_0 | R1-Distill-Qwen 14B Q4_K_M (8K) |
| 16 GiB | Qwen2.5 14B Q5_K_M | Qwen2.5-Coder 14B Q4_K_M, 16K | R1-Distill-Qwen 14B Q4_K_M, 16K |
| 24 GiB | Qwen2.5 32B Q4_K_M | Qwen2.5-Coder 32B Q4_K_M | R1-Distill-Qwen 32B Q4_K_M |
| 48 GiB | Qwen2.5 72B / Llama 3.1 70B Q4_K_M | Qwen2.5-Coder 32B Q8_0, 32K | R1-Distill-Llama 70B Q4_K_M |

The best local LLM is the largest model that fits completely in your memory, at a quantization no lower than Q4_K_M, with enough context for your real inputs. Run the numbers for your own card in the [LLM VRAM Calculator](/llm-vram-calculator/) before you download anything.

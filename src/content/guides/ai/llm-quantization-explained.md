---
title: "LLM Quantization Explained: GGUF, Q4_K_M, Q8_0 and FP16"
description: "What LLM quantization does to a model's weights, how bits per weight translate into file size and VRAM, what GGUF and K-quants like Q4_K_M are, how GPTQ, AWQ and EXL2 differ, and how to pick a format for your GPU."
track: ai
order: 3
difficulty: intermediate
estMinutes: 18
updatedDate: 2026-10-04
tags: ["llm", "quantization", "gguf", "llama.cpp", "local-llm", "vram"]
relatedTools: ["llm-vram-calculator"]
seoTitle: "LLM Quantization Explained: GGUF, Q4_K_M, Q8_0, FP16"
metaDescription: "What LLM quantization is, what GGUF replaced, how Q4_K_M, Q8_0 and FP16 compare in bits per weight, and the file sizes they give for 8B and 70B models."
faqs:
  - q: "What is quantization in an LLM?"
    a: "Quantization stores a model's weights with fewer bits than the 16-bit floats it was trained and released in. A 4-bit or 8-bit copy is a fraction of the size and needs a fraction of the memory, at the cost of a small, measurable loss of accuracy that grows as the bit count drops."
  - q: "What is GGUF?"
    a: "GGUF is the single-file model format used by llama.cpp and the tools built on it, such as Ollama and LM Studio. It holds the quantized tensors plus metadata — architecture, tokenizer, chat template — so one file is enough to load and run a model. It was introduced in August 2023."
  - q: "What is the difference between GGUF and GGML?"
    a: "GGML is the tensor library behind llama.cpp, and it was also the name of the original model file format. GGUF replaced that file format in August 2023 because the old one could not carry extensible metadata, so every new architecture or field broke compatibility. Old GGML files no longer load in current llama.cpp; GGUF is the format to download."
  - q: "Is Q4_K_M good enough?"
    a: "For most chat, coding and summarisation work, Q4_K_M is the usual default: it is roughly a third of the FP16 size and its quality loss is small enough that most people do not notice it in normal use. If you have the memory to spare, Q5_K_M or Q6_K close most of the remaining gap; below Q4 the loss becomes easier to see."
  - q: "What is the difference between Q8_0 and FP16?"
    a: "Q8_0 stores each weight as an 8-bit integer plus one 16-bit scale per block of 32 weights, which works out to 8.5 bits per weight, a little over half the size of FP16. Its output is very close to the FP16 original, which is why it is often treated as the near-lossless option when FP16 does not fit."
  - q: "Does quantization reduce the KV cache too?"
    a: "Not by itself. Weight quantization shrinks the model file; the KV cache is a separate allocation that grows with context length and is kept in FP16 by default. llama.cpp and Ollama can quantize the KV cache separately (for example to q8_0), which roughly halves it."
---

A 70-billion-parameter model released in 16-bit precision is about 130 GiB of weights. No consumer GPU holds that, and most workstations do not either. Yet people run 70B models at home every day, and 8B models run comfortably on laptops. The trick that makes this possible is **quantization**: storing each weight with fewer bits, accepting a small loss of accuracy in exchange for a model that is three or four times smaller.

This guide explains what quantization actually does to a model, what the names in a model download list mean (GGUF, Q4_K_M, Q8_0, FP16, BF16, GPTQ, AWQ, EXL2), how bits per weight turn into gigabytes, and how to choose a format for the memory you have. Every size in it comes from the same formulas the [LLM VRAM Calculator](/llm-vram-calculator/) uses, so you can reproduce any number by typing it in.

---

## What quantization does

A trained language model is mostly a very large collection of numbers — its weights — arranged in matrices. During inference, every generated token requires multiplying activations by those matrices, so every weight is read from memory once per token. Two consequences follow:

- **Memory capacity** decides whether the model loads at all. The weights have to sit somewhere fast, ideally GPU VRAM.
- **Memory bandwidth** decides how fast it runs. Token generation on a single user is usually bandwidth-bound: the GPU spends most of its time waiting for weights to arrive, not doing arithmetic.

Quantization attacks both at once. Models are typically trained and published in 16-bit floating point, so each weight takes two bytes. If you can represent that same weight in four bits, the model takes a quarter of the space *and* each token requires moving a quarter of the bytes. On bandwidth-bound hardware, a smaller quant is not just smaller; it is usually faster too.

### How a number loses bits

The core idea is simple. Take a group of weights — say 32 neighbouring values from one row of a matrix. Find the range they span, pick a **scale** (and sometimes an offset, often called the *min*) so that the range maps onto the small set of integers a few bits can represent, then store each weight as the nearest integer. To use the weights, multiply each integer back by the scale.

With 4 bits you have 16 possible levels per group. Most of a model's weights cluster near zero, so 16 well-placed levels capture a surprising amount of the original information. What is lost is rounding error: every weight is now slightly off. Quantization methods differ mainly in how cleverly they choose groups, scales and levels so that the errors that matter most stay small.

### Bits per weight is the number that matters

Because each group carries its own scale, the real cost of a format is a little more than its nominal bit count. That real cost is **bits per weight (bpw)**, and it is the single number you need to estimate a file size:

```text
weights (GiB) = parameters × bpw ÷ 8 ÷ 2^30
```

`Q8_0` is a good worked example. It stores weights in blocks of 32. Each block holds 32 eight-bit integers (256 bits) plus one 16-bit scale, so 272 bits for 32 weights, or exactly **8.5 bpw**. The "8" in the name is the nominal width; 8.5 is what you pay.

> **Note:** File sizes on model hubs are usually shown in decimal gigabytes (10^9 bytes), while GPU memory and the calculator use GiB (2^30 bytes). A file listed as 4.9 GB is about 4.55 GiB. Mixing the two is the most common reason a "should fit" estimate turns out a few percent short.

## The precision ladder: FP32, FP16, BF16

Before any integer quantization happens, a model already has a precision.

| Format | Bits | Layout | Where you meet it |
|---|---|---|---|
| FP32 | 32 | 8-bit exponent, 23-bit mantissa | Training master copies; almost never used for inference |
| FP16 | 16 | 5-bit exponent, 10-bit mantissa | Released checkpoints, GPU inference, the usual GGUF conversion target |
| BF16 | 16 | 8-bit exponent, 7-bit mantissa | Most modern training runs and many official checkpoints |

FP16 and BF16 are the same size, so they cost the same memory. They spend their 16 bits differently: BF16 keeps FP32's exponent range and gives up precision, which makes it robust for training; FP16 has more precision but a narrower range. For inference the difference rarely matters, and both are treated as the "unquantized" baseline that every other format is measured against. In this guide, and in the calculator, that baseline is called FP16.

> **Tip:** When a model card says weights are in BF16, converting to FP16 GGUF is the normal path in llama.cpp and is effectively lossless for inference. If you want to avoid even that step, `convert_hf_to_gguf.py` can write BF16 GGUF directly with `--outtype bf16`.

As of October 2026 there are also hardware-native low-precision float formats — FP8 on recent NVIDIA data-centre and workstation GPUs, and 4-bit float formats such as MXFP4 (OpenAI's gpt-oss models ship their mixture-of-experts weights in MXFP4) and NVFP4 on Blackwell. These matter most for serving stacks like vLLM and TensorRT-LLM; on the local GGUF side, integer K-quants remain the common currency.

## GGUF: the file format

If you run models locally with llama.cpp, Ollama, LM Studio, Jan or koboldcpp, you are almost certainly loading **GGUF** files.

### GGUF vs GGML

**GGML** is the C tensor library that Georgi Gerganov wrote and that llama.cpp is built on. In llama.cpp's early months, "GGML" was also the name of the model file format, and that format had a problem: it carried very little metadata, so adding a new architecture, a new hyperparameter or a tokenizer detail tended to break older files. Users had to re-download or re-convert models every few weeks.

**GGUF** replaced it in August 2023. The library is still called GGML; only the file format changed. GGUF's design goals were:

- **One self-describing file.** A GGUF holds the tensors *and* a key-value metadata section: architecture name, layer count, context length, rope settings, the full tokenizer vocabulary, and usually the chat template. Nothing else needs to be downloaded alongside it.
- **Extensibility.** New metadata keys can be added without breaking readers that do not know about them.
- **Memory-mappable layout.** Tensor data is aligned so the runtime can `mmap` the file and let the operating system page weights in, which makes loading fast and lets llama.cpp split a model between GPU VRAM and system RAM.
- **Mixed precision inside one file.** Each tensor records its own type, so a single GGUF can store embeddings at one precision and attention weights at another. This is what K-quant mixes like `Q4_K_M` rely on.

Old GGML-format files do not load in current llama.cpp. If you find a download from 2023 with a `.bin` extension and "ggml" in the name, look for the GGUF version instead. Large models are often split into shards named like `model-Q4_K_M-00001-of-00002.gguf`; point the runtime at the first shard and it finds the rest.

### Making a GGUF yourself

Most popular models already have GGUF quants published by the community, but the pipeline is short if you need your own:

```bash
# 1. Convert a Hugging Face checkpoint to a 16-bit GGUF
python convert_hf_to_gguf.py ./Llama-3.1-8B-Instruct --outtype f16 \
  --outfile llama-3.1-8b-instruct-f16.gguf

# 2. Quantize it to Q4_K_M
./llama-quantize llama-3.1-8b-instruct-f16.gguf \
  llama-3.1-8b-instruct-Q4_K_M.gguf Q4_K_M
```

Running `llama-quantize` with no arguments prints every type it supports, along with the bits-per-weight figures llama.cpp measured for them.

## K-quants: reading Q4_K_M and friends

The quant names in a GGUF repository look cryptic until you split them into parts. Take `Q4_K_M`:

- **Q4** — the nominal bit width of most weights: 4.
- **K** — the "K-quant" family, introduced to llama.cpp in mid-2023.
- **M** — the mix size: **S**mall, **M**edium or **L**arge.

### Legacy quants vs K-quants

The first llama.cpp formats — `Q4_0`, `Q4_1`, `Q5_0`, `Q5_1`, `Q8_0` — use flat blocks of 32 weights, each with a 16-bit scale (and, for the `_1` variants, a 16-bit min). They are simple and fast, but the per-block FP16 scale is an expensive overhead at low bit widths: `Q4_0` pays half a bit per weight just for its scales.

K-quants reorganise weights into **super-blocks** of 256, divided into smaller sub-blocks. Each sub-block gets its own scale, but those scales are themselves quantized to a few bits and share one higher-precision scale per super-block. The result is finer-grained scaling for less overhead, which is why a K-quant usually beats a legacy quant of similar size on quality. `Q8_0` survives as the exception: at 8 bits the scale overhead is relatively small, and its simplicity makes it a convenient high-quality option.

### What S, M and L mean

Not every tensor in a transformer is equally sensitive to rounding error. K-quant mixes exploit this: the `_S`, `_M` and `_L` variants of a type keep most tensors at the nominal width but store selected, more sensitive tensors — parts of the attention and feed-forward blocks, for example — at a higher-precision type. `_S` upgrades few or none, `_M` upgrades more, `_L` more again. That is why `Q4_K_M` measures 4.89 bpw on Llama 3.1 8B rather than a flat 4.5: some of its tensors are stored at 6 bits.

The common ladder, from smallest to largest:

| Type | Character |
|---|---|
| `Q2_K` | Very small; quality loss is clearly noticeable. A last resort to make a model fit at all. |
| `Q3_K_S` / `Q3_K_M` / `Q3_K_L` | Usable for large models on tight memory; visible degradation on smaller ones. |
| `Q4_K_S` / `Q4_K_M` | The mainstream default. `Q4_K_M` is the size most people start with. |
| `Q5_K_S` / `Q5_K_M` | A step closer to the original for roughly 15–20% more memory than Q4_K_M. |
| `Q6_K` | Very close to the original; a sensible ceiling for quality-focused local use. |
| `Q8_0` | Close to indistinguishable from FP16 in most use, at about half its size. |

### I-quants and the importance matrix

You will also see names like `IQ2_XXS`, `IQ3_M` and `IQ4_XS`. These **I-quants** use more sophisticated codebooks to squeeze out better quality per bit, mostly at the very low end where K-quants struggle. They can be slower on some backends, especially on CPU.

Related is the **importance matrix** (`imatrix`). llama.cpp can run a calibration text through the full-precision model, record which weights influence the output most, and then let the quantizer spend its precision where it matters. I-quants at 2–3 bits essentially require it; K-quants benefit from it too. Many community GGUF repositories note when their quants were made with an imatrix.

```bash
./llama-imatrix -m model-f16.gguf -f calibration.txt -o imatrix.gguf
./llama-quantize --imatrix imatrix.gguf model-f16.gguf model-IQ3_M.gguf IQ3_M
```

## Bits per weight and real sizes for 8B and 70B models

Here is where the abstractions become gigabytes. The table uses the effective bpw values llama.cpp measured on Llama 3.1 8B (the same values the calculator uses) and applies the weights formula above to an 8-billion and a 70-billion-parameter model. Sizes are weights only, in GiB.

| Type | bpw | 8B weights | 70B weights | vs FP16 |
|---|---:|---:|---:|---:|
| FP16 / BF16 | 16.00 | 14.90 GiB | 130.39 GiB | 100% |
| Q8_0 | 8.50 | 7.92 GiB | 69.27 GiB | 53% |
| Q6_K | 6.56 | 6.11 GiB | 53.46 GiB | 41% |
| Q5_K_M | 5.70 | 5.31 GiB | 46.45 GiB | 36% |
| Q4_K_M | 4.89 | 4.55 GiB | 39.85 GiB | 31% |
| Q3_K_M | 4.00 | 3.73 GiB | 32.60 GiB | 25% |
| Q2_K | 3.16 | 2.94 GiB | 25.75 GiB | 20% |

Effective bpw for a given type varies a little from model to model, because the share of upgraded tensors in a mix depends on the architecture, so treat these as close estimates rather than exact download sizes.

### Weights are not the whole bill

Loading a model needs more than its weights. The calculator adds two more terms:

- **KV cache** — the attention keys and values for every token in the context window, per layer: `2 × layers × kvHeads × headDim × context × 2 bytes`. It is independent of weight quantization.
- **Overhead** — runtime buffers, CUDA context and scratch space, estimated at a flat 1.5 GiB.

At an 8,192-token context, the totals look like this (Llama 3.1 architecture: 32 layers for 8B, 80 for 70B, both with 8 KV heads of dimension 128):

| Type | Llama 3.1 8B total | Llama 3.1 70B total |
|---|---:|---:|
| FP16 | 17.40 GiB | 134.39 GiB |
| Q8_0 | 10.42 GiB | 73.27 GiB |
| Q4_K_M | 7.05 GiB | 43.85 GiB |

So an 8B model at Q4_K_M fits an 8 GB card at 8k context, Q8_0 wants a 12 GB card, and FP16 needs 24 GB. The 70B at Q4_K_M overshoots a 24 GB card by a wide margin and lands in 48 GB territory — two 24 GB cards or one 48 GB workstation card. The per-model pages have these breakdowns ready-made: [Llama 3.1 8B](/llm-vram-calculator/llama-3-1-8b/), [Llama 3.1 70B](/llm-vram-calculator/llama-3-1-70b/) and [Qwen2.5 32B](/llm-vram-calculator/qwen2-5-32b/), a mid-size model whose Q4_K_M total at 8k (21.72 GiB) is about as much as a 24 GB card can hold.

> **Note:** These are estimates. Real usage depends on the runtime, batch size, flash attention and how layers are offloaded. Leave a margin of a gigabyte or so, and remember your desktop session also uses VRAM if the same GPU drives your display.

## KV-cache quantization

Long contexts change the picture. The KV cache grows linearly with context length, and with FP16 entries it gets large quickly:

| Context | Llama 3.1 8B KV (FP16) | Llama 3.1 70B KV (FP16) |
|---:|---:|---:|
| 8,192 | 1.00 GiB | 2.50 GiB |
| 32,768 | 4.00 GiB | 10.00 GiB |
| 131,072 | 16.00 GiB | 40.00 GiB |

At the full 128k context, an 8B model's KV cache is larger than its FP16 weights. That is where **KV-cache quantization** comes in. It is a separate setting from weight quantization: you can run Q4_K_M weights with an FP16 cache or with a quantized one.

In llama.cpp, set the K and V cache types independently. Quantizing the V cache requires flash attention; current builds default `-fa` to `auto`, and `-fa on` forces it:

```bash
./llama-server -m llama-3.1-8b-instruct-Q4_K_M.gguf -c 32768 \
  -fa on --cache-type-k q8_0 --cache-type-v q8_0
```

In Ollama, the equivalent is two environment variables on the server:

```bash
OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 ollama serve
```

A `q8_0` cache uses 8.5 bits per element instead of 16, so it is a little over half the size: the 70B's 32k cache drops from 10.00 GiB to about 5.31 GiB, and the 8B's 128k cache from 16.00 GiB to 8.50 GiB. The quality effect of a `q8_0` cache is generally small; a `q4_0` cache saves more but is more likely to hurt, especially on long-context retrieval. The calculator assumes an FP16 cache, so its numbers are the conservative case.

> **Tip:** If you are not sure how many tokens your real prompts use, measure a few with the [LLM Token Counter](/llm-token-counter/) before choosing a context length. Allocating 128k when your documents are 6k long wastes memory that could have bought you a better quant.

## GPTQ, AWQ and EXL2: the GPU-native alternatives

GGUF is not the only quantized format. Three others show up frequently on model hubs, mostly aimed at GPU-only inference servers rather than mixed CPU/GPU desktops.

- **GPTQ** (2022) quantizes a model layer by layer, using a small calibration dataset and second-order information to adjust the remaining weights as each one is rounded, so errors partly cancel out. Files are typically 4-bit (sometimes 3- or 8-bit) with a group size such as 128. It is widely supported by GPU serving stacks, including vLLM and Hugging Face Transformers.
- **AWQ** (Activation-aware Weight Quantization, 2023) starts from the observation that a small fraction of weight channels matter disproportionately, identified by the size of the activations that flow through them. It scales those channels to protect them before quantizing to 4 bits. AWQ models are popular for vLLM deployments because they keep quality well at 4 bits and run with efficient kernels.
- **EXL2** is the format of ExLlamaV2, a fast GPU inference library. Its distinguishing feature is a **fractional, mixed bitrate**: you can quantize to an arbitrary average such as 4.65 or 5.0 bpw, and the quantizer decides per layer where to spend bits. That makes it easy to fill a specific card exactly. Its successor, ExLlamaV3, introduced the EXL3 format, a streamlined variant of the QTIP quantization method.

The practical rule as of October 2026: if your runtime is llama.cpp, Ollama or LM Studio, or you need to split a model between GPU and system RAM or run on Apple Silicon, use **GGUF**. If you are serving a model from GPUs with vLLM, SGLang or TensorRT-LLM, look at **AWQ**, **GPTQ** or native **FP8**. If you run a single NVIDIA GPU and want to tune size to the last few hundred megabytes, **EXL2/EXL3** is built for that. The bits-per-weight arithmetic is the same everywhere: a 4.65 bpw EXL2 and a 4.89 bpw Q4_K_M differ by about 5% in size.

## Quality vs size: what you actually give up

Quantization error is usually measured in two ways:

- **Perplexity** — how surprised the model is by a held-out text. Lower is better. llama.cpp ships `llama-perplexity` for this. A quantized model's perplexity is compared with the FP16 original; the gap is the cost.
- **KL divergence** — how far the quantized model's next-token probabilities drift from the original's on the same text. It catches changes that perplexity averages away, and llama.cpp can compute it against saved FP16 logits.

The consistent pattern across published measurements is:

1. **Q8_0 and Q6_K** sit very close to FP16. For practical purposes, most users cannot tell them apart from the original.
2. **Q5_K_M and Q4_K_M** show a small but measurable increase in perplexity. In everyday chat or coding, the difference is subtle; on tasks that need precise recall, such as exact numbers, long code edits or strict formats, it appears more often.
3. **Below 4 bits**, the curve bends. Each step down costs more quality than the previous one, and Q2_K degrades noticeably.
4. **Bigger models tolerate quantization better.** A 70B model at Q3_K_M generally holds up better than an 8B model at the same type, and often beats a smaller model at higher precision. If the choice is "larger model, lower quant" versus "smaller model, higher quant" at the same memory, the larger model usually wins down to roughly 4 bits, and sometimes below.

> **Note:** Perplexity differences are relative and depend on the model, the evaluation text and the context length, so a number from one model's quant does not transfer to another. Treat published tables as a guide to the shape of the curve, not as a guarantee for your model or task.

## How to pick a quantization

A short decision process that works for most local setups:

1. **Start from your memory.** Find your GPU's VRAM (or, on Apple Silicon, the portion of unified memory the GPU can use). Subtract a gigabyte or so of margin, more if the GPU also drives your display.
2. **Fix the context you need.** Decide your real context length first, because the KV cache scales with it: an 8B model at 32k context adds 4 GiB of FP16 cache, a 70B adds 10 GiB.
3. **Choose the highest quant that fits.** Within your budget, prefer Q6_K over Q5_K_M over Q4_K_M. Treat Q4_K_M as the floor for small models (under ~14B) and Q3_K_M as the floor for large ones (70B and up).
4. **Prefer a bigger model at Q4 over a smaller one at Q8.** If a 14B model at Q4_K_M fits in the same memory as an 8B at Q8_0, the 14B is usually the better model.
5. **Use KV-cache quantization before dropping a weight level.** If you are a few gigabytes short only because of a long context, a `q8_0` cache is usually a cheaper trade than going from Q4_K_M to Q3_K_M weights.
6. **Accept partial offload only knowingly.** llama.cpp can keep some layers in system RAM, but generation speed falls sharply for every layer that leaves the GPU. It is fine for experimenting, frustrating for daily use.

Some typical outcomes, all at 8k context with an FP16 cache and all estimates from the calculator as of October 2026:

| VRAM | Comfortable choice |
|---|---|
| 8 GB | 7B–8B at Q4_K_M (Llama 3.1 8B: 7.05 GiB) |
| 12 GB | 8B at Q8_0 (10.42 GiB), or 12B–14B at Q4_K_M |
| 16 GB | 8B at Q8_0 with long context, or 14B at Q5_K_M/Q6_K |
| 24 GB | 32B at Q4_K_M (Qwen2.5 32B: 21.72 GiB), or 8B at FP16 |
| 48 GB | 70B at Q4_K_M (Llama 3.1 70B: 43.85 GiB) |

For anything not in the table, put your model, quant and context into the [VRAM calculator](/llm-vram-calculator/) — or open a preset such as [DeepSeek-R1-Distill-Qwen 14B](/llm-vram-calculator/deepseek-r1-distill-qwen-14b/) — and read off the smallest GPU tier that fits.

## Summary

- Quantization stores weights in fewer bits. It reduces both the memory a model needs and, on bandwidth-bound hardware, the time per token.
- **Bits per weight** is the number to reason with: `parameters × bpw ÷ 8` bytes. Q8_0 is 8.5 bpw, Q4_K_M about 4.89, FP16 16.
- **GGUF** is llama.cpp's self-describing single-file format, which replaced the GGML file format in August 2023. GGML is still the name of the library underneath.
- **K-quants** use super-blocks with quantized scales; the `_S/_M/_L` suffix says how many sensitive tensors get extra precision. **I-quants** and an **imatrix** help at the low end.
- **GPTQ, AWQ and EXL2** are GPU-oriented alternatives; the same size arithmetic applies to them.
- Weights are only part of the bill. Add the **KV cache**, which grows with context and can be quantized separately, plus runtime overhead.
- Pick the highest quant that fits with your real context, prefer larger models at around 4 bits over smaller ones at 8, and check the numbers in the calculator before you download 40 GiB.

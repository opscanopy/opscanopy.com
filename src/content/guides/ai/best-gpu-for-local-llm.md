---
title: "Best GPU for Running LLMs Locally, by Model Size"
description: "Which GPU to buy for local LLMs, worked out from model size: how much VRAM each model needs at Q4_K_M and Q8_0, why memory bandwidth sets tokens per second, and where Apple Silicon, AMD, Intel, multi-GPU and CPU offload fit."
track: ai
order: 2
difficulty: intermediate
estMinutes: 18
updatedDate: 2026-10-04
tags: ["llm", "gpu", "vram", "local-llm", "hardware", "llama.cpp", "ollama"]
relatedTools: ["llm-vram-calculator"]
seoTitle: "Best GPU for Local LLMs: VRAM by Model Size"
metaDescription: "Local LLM hardware requirements by model size: VRAM needed at Q4_K_M and Q8_0, why bandwidth sets tokens/s, and which 8–80 GB GPU tier fits each model."
faqs:
  - q: "How much VRAM do I need to run an LLM locally?"
    a: "Roughly the quantized weights plus the KV cache plus about 1.5 GiB of runtime overhead. At Q4_K_M with an 8,192-token context, an 8B model needs about 7.1 GiB (an 8 GB card), a 14B about 11.0 GiB (12 GB), a 32B about 21.7 GiB (24 GB) and a 70B about 43.8 GiB (48 GB). Longer contexts add KV cache on top."
  - q: "Is an RTX 4090 or RTX 5090 enough for a 70B model?"
    a: "Not on its own, as of October 2026. A 70B model at Q4_K_M needs about 40 GiB for the weights alone, more than the 24 GB of an RTX 4090 or the 32 GB of an RTX 5090. Two 24 GB cards split by layer, a 48 GB workstation card, a large Apple Silicon machine or partial CPU offload are the realistic options."
  - q: "Does memory bandwidth matter more than CUDA cores for LLM inference?"
    a: "For generating tokens on a single machine, usually yes. Each new token reads every active weight once, so tokens per second is capped near memory bandwidth divided by model size. Compute matters more for prompt processing (prefill) and for serving many users at once."
  - q: "Can I use an AMD or Intel GPU for local LLMs?"
    a: "Yes, with caveats. As of October 2026, llama.cpp and Ollama run on supported AMD Radeon cards through ROCm, and llama.cpp's Vulkan backend runs on most modern AMD and Intel GPUs. Expect fewer supported tools than CUDA, and check the vendor's ROCm or oneAPI support list for your exact card before buying."
  - q: "How much of a Mac's unified memory can an LLM use?"
    a: "By default macOS lets the GPU wire roughly two-thirds to three-quarters of unified memory, with the larger share on bigger configurations, so a 64 GB Mac gives you around 48 GB for model plus KV cache. The limit can be raised with the iogpu.wired_limit_mb sysctl, at the cost of memory for everything else."
  - q: "Is it worth offloading part of a model to the CPU?"
    a: "It works, but every layer left in system RAM runs at system-memory bandwidth, which on a dual-channel DDR5 desktop is around a tenth of a high-end GPU's. A few offloaded layers cost little; offloading half a 70B model typically drops generation to low single-digit tokens per second."
---

Picking a GPU for local LLMs is less about benchmarks and more about arithmetic. A model either fits in video memory or it does not, and once it fits, the speed you see is mostly set by how fast that memory can be read. Compute throughput, the headline number on every spec sheet, comes a distant third for one person chatting with one model.

This guide works the problem from the model side. It starts with what each common model size actually needs, computed with the same formula as the [LLM VRAM Calculator](/llm-vram-calculator/), then maps those numbers onto the 8, 12, 16, 24, 32, 48 and 80 GB cards you can buy, and finishes with the alternatives: Apple Silicon, AMD and Intel GPUs, multi-GPU rigs, CPU offload and the used market. All hardware and model references are as of October 2026, and there are no prices here on purpose: they move weekly, and the memory arithmetic does not.

---

## The three constraints, in order

Every local-inference hardware decision comes down to three limits. They apply in a fixed order, and it pays to check them in that order.

### 1. VRAM capacity decides what you can run at all

To generate text at full speed, the model's weights, its KV cache (the attention state for every token in the context) and the runtime's own buffers all have to sit in GPU memory. If they do not fit, the runtime either refuses to load, crashes with an out-of-memory error partway through a long conversation, or spills layers to system RAM and slows down dramatically.

This is why VRAM is the first number to look at. A fast card that cannot hold the model is slower than a modest card that can.

### 2. Memory bandwidth decides tokens per second

Generating one token means reading every active weight from memory once. On a single GPU, the decode speed is therefore capped at roughly:

```text
max tokens/s  ≈  memory bandwidth (GB/s)  ÷  bytes of weights read per token
```

An 8B model at Q4_K_M is about 4.9 GB of weights. On a card with 1,008 GB/s of bandwidth, such as the RTX 4090, the ceiling is about 206 tokens per second; on an RTX 4060 with 272 GB/s it is about 56. Real runtimes land below the ceiling, commonly at 60–80% of it, because of attention over the KV cache, kernel overhead and sampling, but the ratio between cards holds up well.

### 3. Compute decides prompt processing and concurrency

Raw compute (tensor cores, FLOPS) matters when the GPU processes many tokens at once: reading a long prompt or a pasted document (prefill), or batching requests from many users in a server like vLLM. For a single user, a large compute advantage mostly shows up as faster time-to-first-token on long prompts. It rarely changes which card you should buy for chat.

> **Note:** Mixture-of-experts models bend rule 2. Mixtral 8x7B must hold all 46.7B parameters in memory, but only about 12.9B are active per token, so it generates closer to the speed of a 13B dense model while needing the VRAM of a 47B one.

---

## How much VRAM each model size needs

The VRAM estimate is three parts added together:

```text
weights  = parameters × bits-per-weight ÷ 8          (bytes)
KV cache = 2 × layers × kv_heads × head_dim × context × 2 bytes   (FP16 K and V)
overhead ≈ 1.5 GiB                                    (runtime, compute buffers)
```

The bits-per-weight figures are llama.cpp's measured values: 4.89 for Q4_K_M, 8.5 for Q8_0 and 16 for FP16. The architecture numbers (layers, KV heads, head dimension) come from each model's published `config.json`. Q4_K_M is the usual default for local use; Q8_0 is close to lossless and roughly 1.7 times larger. If those names are unfamiliar, the [quantization guide](/learn/guides/llm-quantization-explained/) explains what each format trades away.

The table below uses an 8,192-token context, which covers most chat sessions. "Smallest tier" is the first standard card size whose capacity covers the total.

| Model | Params | Q4_K_M total | Smallest tier | Q8_0 total | Smallest tier |
|---|---|---|---|---|---|
| Llama 3.2 3B | 3B | 4.1 GiB | 8 GB | 5.3 GiB | 8 GB |
| Qwen2.5 7B | 7B | 5.9 GiB | 8 GB | 8.9 GiB | 12 GB |
| Llama 3.1 8B | 8B | 7.1 GiB | 8 GB | 10.4 GiB | 12 GB |
| Gemma 2 9B | 9B | 9.2 GiB | 12 GB | 13.0 GiB | 16 GB |
| Mistral Nemo 12B | 12B | 9.6 GiB | 12 GB | 14.6 GiB | 16 GB |
| Qwen2.5 14B | 14B | 11.0 GiB | 12 GB | 16.9 GiB | 24 GB |
| Gemma 2 27B | 27B | 19.7 GiB | 24 GB | 31.1 GiB | 32 GB |
| Qwen2.5 32B | 32B | 21.7 GiB | 24 GB | 35.2 GiB | 48 GB |
| Mixtral 8x7B | 46.7B | 29.1 GiB | 32 GB | 48.7 GiB | 80 GB |
| Llama 3.1 70B | 70B | 43.8 GiB | 48 GB | 73.3 GiB | 80 GB |
| Qwen2.5 72B | 72B | 45.0 GiB | 48 GB | 75.2 GiB | 80 GB |
| Llama 3.1 405B | 405B | 236.0 GiB | multi-GPU | 406.2 GiB | multi-GPU |

Two things in that table surprise people. Gemma 2 9B needs more than Llama 3.1 8B at the same quantization, despite being only slightly larger, because its 256-wide attention heads and 42 layers make its KV cache more than two and a half times as large (2.63 GiB versus 1.00 GiB at 8k). And the 8B model at Q4_K_M, at 7.1 GiB, is right at the edge of an 8 GB card, which leaves almost no room for a desktop session on the same GPU.

### Context length is the hidden variable

The KV cache grows linearly with context. Quadruple the context from 8,192 to 32,768 tokens and the KV cache quadruples too:

| Model at Q4_K_M | 8k context | 32k context | Tier at 32k |
|---|---|---|---|
| Llama 3.1 8B | 7.1 GiB | 10.1 GiB | 12 GB |
| Qwen2.5 14B | 11.0 GiB | 15.5 GiB | 16 GB |
| Qwen2.5 32B | 21.7 GiB | 27.7 GiB | 32 GB |
| Gemma 2 27B (8k max) | 19.7 GiB | n/a | 24 GB |
| Llama 3.1 70B | 43.8 GiB | 51.3 GiB | 80 GB |

A 70B model that fits a 48 GB card at 8k no longer fits at 32k: the KV cache alone grows from 2.5 to 10 GiB. If you work with long documents or large codebases, size for the context you will actually use, not the default. To see how many tokens a given document really is, paste it into the [LLM Token Counter](/llm-token-counter/).

> **Tip:** Most runtimes can quantize the KV cache to 8-bit (llama.cpp's `--cache-type-k q8_0 --cache-type-v q8_0`, Ollama's `OLLAMA_KV_CACHE_TYPE=q8_0`, which needs flash attention enabled), roughly halving it. The estimates here assume the default FP16 cache, so treat them as the safe upper bound.

For any model not in the table, or a specific context and quantization, the [VRAM calculator](/llm-vram-calculator/) does the same arithmetic interactively, and the per-model pages, such as [Llama 3.1 70B](/llm-vram-calculator/llama-3-1-70b/), [Qwen2.5 32B](/llm-vram-calculator/qwen2-5-32b/) and [DeepSeek-R1-Distill-Qwen 14B](/llm-vram-calculator/deepseek-r1-distill-qwen-14b/), show the breakdown at every quantization.

---

## GPU tiers: what each VRAM size gets you

GPU memory is sold in binary gigabytes, so a "24 GB" card really holds 24 GiB, but you never get all of it. The driver, the CUDA context and, if the card also drives your monitors, the desktop compositor each take a slice, commonly a few hundred megabytes to over a gigabyte. Keep a margin of 0.5–1 GiB below the card's size when you plan.

The cards named in each tier are examples current as of October 2026, with bandwidth figures from the manufacturers' published specifications.

### 8 GB: small models, short contexts

Examples: RTX 4060 (272 GB/s), RTX 3070 (448 GB/s), RTX 5060, Radeon RX 7600.

This tier runs 3B–8B models at Q4_K_M with modest context. Llama 3.1 8B at 7.1 GiB fits, barely; Qwen2.5 7B at 5.9 GiB fits comfortably and leaves room for a longer context. Q8_0 of an 8B model (10.4 GiB) does not fit. It is a workable starting point for autocomplete, summarisation and small coding helpers, but it is the tier people outgrow fastest.

### 12 GB: the comfortable 7B–14B tier

Examples: RTX 3060 12GB (360 GB/s), RTX 4070 (504 GB/s), RTX 5070 (672 GB/s), Intel Arc B580 (456 GB/s).

Twelve gigabytes runs any 7B–9B model at Q4_K_M with room for 16k+ context, an 8B at Q8_0, and a 14B at Q4_K_M at 8k (11.0 GiB, a tight fit). The RTX 3060 12GB has long been the budget pick for this reason: it has more memory than several faster cards that followed it.

### 16 GB: 14B at long context, 8B at Q8_0

Examples: RTX 4060 Ti 16GB (288 GB/s), RTX 4080 (717 GB/s), RTX 5060 Ti 16GB (448 GB/s), RTX 5070 Ti (896 GB/s), RTX 5080 (960 GB/s), Radeon RX 9070 XT, Arc A770 16GB.

The 14B class (Qwen2.5 14B, DeepSeek-R1-Distill-Qwen 14B) at Q4_K_M with a 32k context fits here at 15.5 GiB. This tier also shows the bandwidth spread most clearly: an RTX 4060 Ti 16GB and an RTX 5080 hold the same models, but the 5080's bandwidth is roughly 3.3 times higher, and token generation scales with it.

### 24 GB: the enthusiast sweet spot

Examples: RTX 3090 (936 GB/s), RTX 4090 (1,008 GB/s), Radeon RX 7900 XTX (960 GB/s).

Twenty-four gigabytes is where the 27B–32B class opens up: Gemma 2 27B at 19.7 GiB and Qwen2.5 32B at 21.7 GiB, both at Q4_K_M and 8k. These are much stronger at reasoning and code than the 7B–14B models, which is why 24 GB has been the default recommendation for serious local use for several GPU generations. A single 24 GB card still cannot hold a 70B at Q4_K_M.

### 32 GB: 32B with real context

Examples: RTX 5090 (1,792 GB/s), Tesla V100 32GB (data-centre, older).

The RTX 5090 adds 8 GB over the 24 GB tier and nearly doubles the bandwidth of the 3090. In practice that buys a 32B model at Q4_K_M with a 32k context (27.7 GiB), Mixtral 8x7B at Q4_K_M (29.1 GiB), or Gemma 2 27B at Q8_0 (31.1 GiB, tight). It is the fastest single consumer card for decode as of October 2026, but a 70B model still does not fit without offload.

### 48 GB: single-card 70B

Examples: RTX A6000 (768 GB/s), RTX 6000 Ada (960 GB/s), L40S (864 GB/s).

This is the smallest single card that holds a 70B–72B model at Q4_K_M (43.8 and 45.0 GiB at 8k), and it does so with little to spare: the 32k context version of the same model (51.3 GiB) does not fit. Workstation cards are blower-cooled, two slots wide and built for multi-card chassis, which matters if you plan to add a second one. NVIDIA's Blackwell-generation RTX PRO 6000 raises this tier to 96 GB on one card.

### 80 GB and beyond: data-centre cards

Examples: A100 80GB (about 2 TB/s), H100 80GB (3.35 TB/s on the SXM version).

An 80 GB card holds a 70B model at Q8_0 (73.3 GiB at 8k) or at Q4_K_M with a 32k context. These are passively cooled server parts designed for chassis airflow, often in the SXM form factor that needs a matching baseboard, so for most individuals they mean renting cloud instances rather than buying. Llama 3.1 405B, at 236 GiB even at Q4_K_M, needs several of them.

### Speed ceilings across the tiers

Using the bandwidth formula above, the theoretical decode ceiling for a few model sizes at Q4_K_M:

| Hardware | Bandwidth | 8B | 14B | 32B | 70B |
|---|---|---|---|---|---|
| RTX 4060 | 272 GB/s | 56 tok/s | 32 | does not fit | does not fit |
| RTX 3060 12GB | 360 GB/s | 74 | 42 | does not fit | does not fit |
| RTX 5080 | 960 GB/s | 196 | 112 | does not fit | does not fit |
| RTX 4090 | 1,008 GB/s | 206 | 118 | 52 | does not fit |
| RTX 5090 | 1,792 GB/s | 366 | 209 | 92 | does not fit |
| Apple M4 Max | 546 GB/s | 112 | 64 | 28 | 13 |
| Dual-channel DDR5 (CPU) | ~96 GB/s | 20 | 11 | 5 | 2 |

Treat these as upper bounds, not benchmarks. The useful reading is relative: anything above roughly 10–15 tokens per second reads faster than most people can, and below about 5 a chat starts to feel slow.

---

## Apple Silicon and unified memory

Apple Silicon Macs have no separate VRAM: the CPU and GPU share one pool of unified memory, so a Mac with 64 GB or 128 GB can load models no single consumer GPU can hold. As of October 2026, the M5 Max offers up to 128 GB at up to 614 GB/s (the M4 Max before it: 128 GB at 546 GB/s), and the M3 Ultra Mac Studio goes up to 256 GB at 819 GB/s; Apple dropped its original 512 GB option in March 2026.

There are two catches.

**Not all of it is usable by the GPU.** macOS caps how much memory the GPU may wire, by default roughly two-thirds to three-quarters of the total, with the larger share on bigger configurations. Plan on about 75% for a 64 GB or larger machine: around 48 GB of a 64 GB Mac, enough for a 70B at Q4_K_M with a short context. The cap can be raised:

```bash
# Allow the GPU to wire up to 56 GiB on a 64 GB Mac (resets on reboot)
sudo sysctl iogpu.wired_limit_mb=57344
```

Leave enough for macOS and your other applications, or the system will start swapping.

**Bandwidth is lower than a high-end discrete GPU.** The M4 Max's 546 GB/s is about half an RTX 4090's, so a model that fits on both generates roughly half as fast on the Mac. The Mac wins whenever the model does not fit on the GPU at all: a 70B at 13 tokens per second beats the same model offloaded to CPU at 2.

> **Note:** Unified-memory PCs follow the same logic. AMD's Ryzen AI Max+ 395 ("Strix Halo") and NVIDIA's DGX Spark both pair up to 128 GB of shared memory with roughly 256–273 GB/s, as of October 2026. They hold large models well, but generate at about half the M4 Max's speed and a quarter of an RTX 4090's.

---

## AMD and Intel GPUs

NVIDIA's CUDA is still the path of least resistance: every runtime supports it first, and most guides assume it. The alternatives are real but take more care.

### AMD Radeon and ROCm

AMD's compute stack is ROCm. As of October 2026, llama.cpp, Ollama and vLLM all run on ROCm, and the Radeon RX 7900 XTX (24 GB, 960 GB/s) is the most common AMD choice for local LLMs, matching the RTX 3090 and 4090 on capacity. The caveats:

- **Official support is per card.** ROCm's supported-GPU list covers the higher-end RDNA 3 and RDNA 4 cards, and lower models may work only unofficially, through the `HSA_OVERRIDE_GFX_VERSION` environment variable. Check the current list for your exact model before buying.
- **Linux first.** ROCm support on Windows has historically lagged Linux, so expect the smoothest experience on a supported Linux distribution.
- **Fewer optimised kernels.** Some quantization formats and attention kernels arrive on CUDA first, so the same card can be slower than its bandwidth suggests in some runtimes.

### Intel Arc

Intel's Arc cards, such as the B580 (12 GB, 456 GB/s) and the A770 16GB, offer a lot of memory per card. llama.cpp supports them through its SYCL backend (Intel's oneAPI) and its Vulkan backend, and Intel's own IPEX-LLM library was archived in January 2026. Tool support is narrower than AMD's, and performance varies more between runtime versions.

### Vulkan as the universal fallback

llama.cpp's Vulkan backend runs on nearly any modern GPU from any vendor, with no ROCm or oneAPI install. It is usually slower than the native backend, but it makes a non-NVIDIA card useful quickly:

```bash
# Build llama.cpp with the Vulkan backend
cmake -B build -DGGML_VULKAN=ON
cmake --build build --config Release -j
```

---

## Running across two or more GPUs

When a model does not fit on one card, splitting it across several is often cheaper than one larger card. Two 24 GB cards give 48 GB, enough for a 70B at Q4_K_M at short context.

There are two ways to split:

| Method | How it works | Speed effect | Where you find it |
|---|---|---|---|
| **Layer split** (pipeline) | Each GPU holds a contiguous block of layers; a token passes through them in turn | Capacity adds up, speed does not: GPUs take turns, so decode runs near one card's speed on the whole model | llama.cpp default, Ollama |
| **Tensor split** (tensor parallel) | Each layer's matrices are divided across GPUs, which work on every token together | Bandwidth adds up, so decode can get faster, but cards sync on every layer and want a fast interconnect | vLLM, llama.cpp `--split-mode row` |

With llama.cpp, the split ratio is set per GPU:

```bash
# Spread a 70B Q4_K_M model evenly across two GPUs, all layers on GPU
./llama-server -m llama-3.1-70b-instruct-q4_k_m.gguf \
  --n-gpu-layers 999 --split-mode layer --tensor-split 1,1 -c 8192
```

Ollama detects multiple GPUs and spreads layers across them on its own when a model does not fit on one. vLLM uses tensor parallelism with `--tensor-parallel-size 2`, which expects identical cards. If you run your models in containers, the [Ollama in Docker guide](/learn/guides/ollama-docker-gpu/) covers passing several GPUs through.

Practical notes for a multi-GPU build:

- **Power and cooling dominate.** Two high-end consumer cards can draw well over 700 W between them. Size the power supply for transient spikes, not only rated board power, and leave airflow between cards.
- **PCIe lanes matter less than people expect for layer split**, since little data crosses between GPUs per token. They matter more for tensor parallelism.
- **Mixed cards work with layer split.** You can pair a 24 GB and a 12 GB card and set `--tensor-split 2,1`; the slower card sets the pace for its share of layers.

---

## CPU offload: the slow escape hatch

If a model is slightly too large, llama.cpp and Ollama can keep some layers in system RAM and run them on the CPU. In llama.cpp you choose how many layers go to the GPU:

```bash
# Put 60 of a 70B model's 80 layers on the GPU, the rest on CPU
./llama-server -m llama-3.1-70b-instruct-q4_k_m.gguf --n-gpu-layers 60 -c 8192
```

Ollama decides the split automatically from the free VRAM it detects; `ollama ps` shows how much of a loaded model ended up on the CPU.

The trade-off is bandwidth again. A dual-channel DDR5 desktop has about 96 GB/s of theoretical memory bandwidth, around a tenth of a 24 GB flagship card. Each token has to pass through the CPU-resident layers, so the slow part dominates quickly:

- **A few layers offloaded** (say 10%) costs a modest slowdown and is often worth it to run a better model or a longer context.
- **Half the model offloaded** typically puts a 70B in low single digits of tokens per second.
- **Everything on CPU** is fine for small models and batch jobs, and slow for interactive chat with anything above about 14B.

Workstation and server CPUs with eight or twelve memory channels change the picture considerably, since their bandwidth is several times a desktop's. That is why some people run very large mixture-of-experts models on many-channel servers with a single GPU for the shared layers.

---

## Buying used

The used market is where a lot of local-LLM hardware comes from, especially 24 GB cards from previous generations. A few things to check:

- **Run a memory stress test, not just a game.** A card that games fine can still have marginal VRAM. Load a model that fills most of the memory and generate for a long stretch, or run a dedicated VRAM test.
- **Watch memory temperature on the RTX 3090.** Half its GDDR6X sits on the back of the board, and those chips run hot under sustained memory load, which is exactly what inference produces. Check memory junction temperature, and expect to replace thermal pads on a well-used card.
- **Ex-mining and ex-datacentre cards.** Many ran 24/7 for years. Fans and thermal paste are the usual failure points and are serviceable; check that the card has not had a modified BIOS.
- **Older data-centre cards have hidden costs.** Passive cards like the Tesla P40 and V100 need forced airflow you have to add yourself, the V100's SXM2 version needs an adapter board, and older architectures lack fast FP16 and newer kernel features, so they are slower than their memory size suggests and lose support sooner.
- **Check the generation, not only the memory size.** Runtimes drop support for old architectures over time. A card that works today may not get new kernels.

---

## Putting it together: picking a card by model size

Work backwards from the largest model you actually want to run, at the context you actually use.

1. **Find the target model's total** in the tables above or in the [VRAM calculator](/llm-vram-calculator/), at Q4_K_M and your real context length.
2. **Add a margin** of 0.5–1 GiB for the driver and desktop, more if the card also runs your monitors.
3. **Pick the tier** whose capacity clears that total. If two cards share a tier, the one with more bandwidth will generate faster.
4. **If no single card fits**, compare two cards with layer split, a large unified-memory machine, or partial CPU offload, in that order of speed for most setups.

A rough guide, as of October 2026:

| You want to run | Minimum tier | Typical cards |
|---|---|---|
| 3B–8B models, short context | 8 GB | RTX 4060, RTX 3070 |
| 7B–14B models, everyday use | 12 GB | RTX 3060 12GB, RTX 4070, RTX 5070, Arc B580 |
| 14B at long context, 8B at Q8_0 | 16 GB | RTX 4060 Ti 16GB, RTX 5070 Ti, RTX 5080 |
| 27B–32B models | 24 GB | RTX 3090, RTX 4090, RX 7900 XTX |
| 32B at 32k context, Mixtral 8x7B | 32 GB | RTX 5090 |
| 70B–72B at Q4_K_M | 48 GB | RTX A6000, RTX 6000 Ada, 2 × 24 GB |
| 70B at Q8_0 or long context | 80 GB+ | A100 / H100, multi-GPU, 96–128 GB Macs |

Models improve faster than GPUs do, and a 14B or 32B model today often matches what needed 70B a year earlier. That argues for buying the most VRAM you can sensibly use rather than the most compute: memory is what decides whether next year's model runs on your desk at all. For which models to put on that card, see the [best local LLMs by VRAM budget](/learn/guides/best-local-llm/) guide.

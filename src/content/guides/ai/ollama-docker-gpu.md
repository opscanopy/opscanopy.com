---
title: "Run Ollama in Docker with GPU Passthrough"
description: "Run Ollama in Docker on an NVIDIA or AMD GPU: install the NVIDIA Container Toolkit, start the container with --gpus=all or the ROCm image, write a docker-compose.yml with Open WebUI, keep port 11434 private, and fix the usual GPU errors."
track: ai
order: 4
difficulty: intermediate
estMinutes: 25
updatedDate: 2026-10-04
tags: ["ollama", "docker", "gpu", "nvidia", "amd", "rocm", "docker-compose", "llm", "open-webui"]
relatedTools: ["docker-run-to-compose", "llm-vram-calculator", "dockerfile-linter"]
seoTitle: "Ollama in Docker with GPU: NVIDIA, AMD & Compose"
metaDescription: "Run Ollama in Docker with GPU passthrough: NVIDIA Container Toolkit, the AMD ROCm image, a docker-compose.yml with Open WebUI, and fixes for GPU errors."
faqs:
  - q: "What are the GPU requirements for Ollama?"
    a: "As of October 2026, Ollama's docs list NVIDIA GPUs with compute capability 5.0 or newer on driver 550+ (compute capability 5.0 to 6.2 needs driver 570+), AMD Radeon RX 9000/7000 and the top RX 6000 cards (6800 XT and up), Radeon PRO and Radeon AI PRO, Ryzen AI and Instinct cards through ROCm v7 on Linux, Apple silicon through Metal, and other GPUs through Vulkan. The amount of VRAM matters more than the card generation: the model weights, the KV cache for your context length and roughly 1.5 GiB of runtime overhead all have to fit."
  - q: "Why is Ollama in Docker not using my GPU?"
    a: "The usual causes are a container started without --gpus=all (or without the deploy.resources.reservations.devices block in Compose), a host without the NVIDIA Container Toolkit or without running nvidia-ctk runtime configure followed by a Docker restart, or a host driver too old for the CUDA libraries in the image. Run nvidia-smi inside the container: if it fails, Docker cannot see the GPU and Ollama will fall back to the CPU."
  - q: "How do I use Ollama with Docker Compose and a GPU?"
    a: "Give the ollama service a deploy.resources.reservations.devices entry with driver: nvidia, count: all and capabilities: [gpu], mount a named volume at /root/.ollama and publish port 11434. For AMD, use the ollama/ollama:rocm image and list /dev/kfd and /dev/dri under devices instead."
  - q: "Is it safe to expose Ollama port 11434?"
    a: "Not to the internet. The Ollama API has no authentication, so anyone who can reach port 11434 can run models on your GPU, pull new models and delete existing ones. Publish it on 127.0.0.1 only, put an authenticating reverse proxy in front if other machines need it, and remember that Docker's published ports bypass host firewalls such as UFW."
  - q: "Where does Ollama store models in Docker and how much disk do they need?"
    a: "Inside the container models live under /root/.ollama, which the official command mounts as the named volume ollama so downloads survive container upgrades. A Q4_K_M model needs roughly 0.6 GB of disk per billion parameters: about 4.9 GB for an 8B model and about 43 GB for a 70B model."
  - q: "How do I fix CUDA out of memory errors in Ollama?"
    a: "Lower the context length, pick a smaller quantization or a smaller model, set OLLAMA_MAX_LOADED_MODELS=1 so only one model occupies VRAM, or quantize the KV cache with OLLAMA_KV_CACHE_TYPE=q8_0. Estimate the total first with the LLM VRAM calculator so the model you pull actually fits your card."
---

Ollama is the shortest path from "I have a GPU" to "I have a local LLM answering over HTTP", and running it in Docker keeps the CUDA or ROCm libraries, the model store and the server process off your host. The catch is that a container cannot see a GPU by default. Without the right runtime and flags, Ollama starts happily, detects no GPU, and runs every token on the CPU at a fraction of the speed. This guide walks through GPU passthrough for NVIDIA and AMD, a `docker-compose.yml` with Open WebUI as a chat front end, the network settings that keep your GPU from becoming a public API, and the errors you are most likely to hit. All hardware and version facts are as of October 2026, checked against the official Ollama, Docker and NVIDIA documentation.

---

## What you need before you start

### GPU and driver requirements

Ollama's own hardware page sets the floor. As of October 2026:

| Vendor | Supported | Host requirement |
|---|---|---|
| **NVIDIA** | Compute capability 5.0 and newer (Maxwell onwards) | Driver 550+; compute capability 5.0 to 6.2 needs driver 570+ |
| **AMD** | Radeon RX 9000, 7000 and 6800 XT/6900 XT, Radeon PRO W7000/W6800, Radeon AI PRO, Ryzen AI 300/400, Instinct MI100 to MI350X | ROCm v7 on Linux |
| **Apple** | Apple silicon via Metal | Native install only, see the note below |
| **Other** | GPUs reachable through Vulkan on Linux and Windows | Vulkan-capable driver |

The driver lives on the **host**, not in the image. The `ollama/ollama` image ships the CUDA user-space libraries; the kernel driver and the `libcuda` it talks to come from the machine underneath. That split is why a perfectly good image can fail on a host with an old driver, and why you never install an NVIDIA driver inside a container.

> **Note:** Docker Desktop on macOS runs containers in a Linux VM with no access to the Apple GPU, so Ollama in Docker on a Mac is CPU-only. On a Mac, install Ollama natively and use Docker only for the front end. Everything below assumes a Linux host (or Windows with WSL 2, where the NVIDIA path works the same way once the Windows driver is installed).

### How much VRAM the model needs

The card generation decides *whether* Ollama uses the GPU. The amount of VRAM decides *which models* you can run there. A model fits when three things fit together:

- **Weights**: parameters x bits per weight / 8. Ollama's default tags are usually `Q4_K_M`, which averages 4.89 bits per weight.
- **KV cache**: 2 x layers x KV heads x head dimension x context length x 2 bytes. It grows linearly with context.
- **Overhead**: runtime and compute buffers, roughly 1.5 GiB.

Run those numbers through the [LLM VRAM calculator](/llm-vram-calculator/) and you get figures like these (Q4_K_M, 8K context):

| Model | Weights | KV cache (8K) | Total |
|---|---|---|---|
| [Llama 3.2 3B](/llm-vram-calculator/llama-3-2-3b/) | 1.71 GiB | 0.88 GiB | **4.08 GiB** |
| [Qwen2.5 7B](/llm-vram-calculator/qwen2-5-7b/) | 3.98 GiB | 0.44 GiB | **5.92 GiB** |
| [Llama 3.1 8B](/llm-vram-calculator/llama-3-1-8b/) | 4.55 GiB | 1.00 GiB | **7.05 GiB** |
| [Qwen2.5 14B](/llm-vram-calculator/qwen2-5-14b/) | 7.97 GiB | 1.50 GiB | **10.97 GiB** |
| [Qwen2.5 32B](/llm-vram-calculator/qwen2-5-32b/) | 18.22 GiB | 2.00 GiB | **21.72 GiB** |
| [Llama 3.1 70B](/llm-vram-calculator/llama-3-1-70b/) | 39.85 GiB | 2.50 GiB | **43.85 GiB** |

So an 8 GB card runs 7B and 8B models comfortably, a 12 GB card reaches 14B, a 24 GB card reaches 32B, and a 70B model at Q4_K_M needs about 44 GiB, which means two 24 GB cards or a 48 GB workstation card. Ollama will still *run* a model that does not fit by splitting layers between GPU and CPU, but the CPU layers set the pace. Pick the model that fits before you pull it. If the quantization names are unfamiliar, the [quantization guide](/learn/guides/llm-quantization-explained/) explains what `Q4_K_M` and `Q8_0` trade away.

---

## NVIDIA: install the Container Toolkit

Docker reaches NVIDIA GPUs through the **NVIDIA Container Toolkit**, which registers a runtime hook that mounts the host driver and the device nodes into any container started with `--gpus`. Install it once per host.

### Debian and Ubuntu (apt)

Add NVIDIA's signed repository, then install the package:

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
```

### RHEL, Fedora, Rocky and Amazon Linux (dnf/yum)

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo \
  | sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo

sudo yum install -y nvidia-container-toolkit
```

### Register the runtime with Docker

Installing the package is not enough. Docker has to be told about the runtime, and the daemon has to restart to pick it up:

```bash
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

`nvidia-ctk` edits `/etc/docker/daemon.json` to add the `nvidia` runtime. Forgetting the restart is the most common reason the next step fails with "could not select device driver".

### Prove the GPU is visible before involving Ollama

Test the plumbing with a throwaway container. If this does not print your GPU table, Ollama will not see the GPU either, and debugging it here is easier:

```bash
sudo docker run --rm --gpus all ubuntu nvidia-smi
```

The output should list your card, the driver version and the highest CUDA version that driver supports. Note that number: it matters for the troubleshooting section.

> **Tip:** On a multi-GPU host, `nvidia-smi -L` prints each GPU's index and UUID. You will use those to pin Ollama to specific cards.

---

## Run Ollama with an NVIDIA GPU

With the toolkit in place, the official command is a single line:

```bash
docker run -d --gpus=all -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
```

Each flag does one job:

| Flag | Purpose |
|---|---|
| `-d` | Run detached, in the background |
| `--gpus=all` | Ask the NVIDIA runtime for every GPU on the host |
| `-v ollama:/root/.ollama` | Named volume for models and keys, so they survive container upgrades |
| `-p 11434:11434` | Publish the Ollama API port (narrowed to localhost later in this guide) |
| `--name ollama` | A stable name for `docker exec` and for other containers to resolve |

### Verify the GPU inside the container

First confirm the container itself can see the card:

```bash
docker exec -it ollama nvidia-smi
```

Then pull and run a model. `llama3.2` is a 3B model and a quick first download:

```bash
docker exec -it ollama ollama run llama3.2
```

Ask it something, exit with `/bye`, and check where the model actually loaded:

```bash
docker exec -it ollama ollama ps
```

The `PROCESSOR` column is the answer. `100% GPU` means the whole model is in VRAM. A split such as `30%/70% CPU/GPU` means it did not fit and some layers are running on the CPU. `100% CPU` means Ollama found no usable GPU at all. The `CONTEXT` column shows the context length actually allocated, which drives the KV cache size from the table above.

> **Note:** `nvidia-smi` running on the host also shows an `ollama` process holding VRAM while a model is loaded. Ollama unloads idle models after 5 minutes by default (`OLLAMA_KEEP_ALIVE`), so an empty process list a few minutes later is normal.

### Pin Ollama to particular GPUs

`--gpus=all` is right for a dedicated box. To give Ollama one card and keep another for something else, pass a device list instead:

```bash
docker run -d --gpus '"device=1"' -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
```

Inside the container, `CUDA_VISIBLE_DEVICES` narrows further by index or UUID, and `CUDA_VISIBLE_DEVICES=-1` forces CPU-only, which is handy for comparing speeds.

---

## Run Ollama with an AMD GPU (ROCm)

AMD cards use a separate image tag that bundles the ROCm libraries, and they need the kernel's compute and render device nodes passed through directly. There is no runtime hook to install:

```bash
docker run -d --device /dev/kfd --device /dev/dri -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama:rocm
```

- `/dev/kfd` is the ROCm compute interface.
- `/dev/dri` holds the render nodes, one per GPU.

The host still needs the `amdgpu` kernel driver loaded, and your user's access to those nodes depends on the `video` and `render` groups. Verify the same way as on NVIDIA, with `ollama run` followed by `ollama ps`.

Two AMD-specific variables come up often:

- **`ROCR_VISIBLE_DEVICES`** picks GPUs by the IDs `rocminfo` prints, the ROCm counterpart of `CUDA_VISIBLE_DEVICES`.
- **`HSA_OVERRIDE_GFX_VERSION`** makes ROCm treat an unsupported card as a close supported target, for example `-e HSA_OVERRIDE_GFX_VERSION=10.3.0`. It works for some consumer cards outside the official list, but it is an override: if the target is wrong, expect crashes rather than slow output.

> **Tip:** As of October 2026 Ollama also supports GPUs through Vulkan, and Vulkan is bundled into the standard `ollama/ollama` image and enabled by default once the container has the same `--device /dev/kfd --device /dev/dri` flags (`OLLAMA_VULKAN=0` turns it off). If your AMD card is not on the ROCm list, try Vulkan before reaching for `HSA_OVERRIDE_GFX_VERSION`.

---

## Docker Compose: Ollama plus Open WebUI

A `docker run` line is fine for a test. For anything you keep, Compose records the configuration in a file you can version. (If you already have a working `docker run` command, the [docker run to Compose converter](/docker-run-to-compose/) translates it into a service block for you.)

### The NVIDIA compose file

Compose has no `--gpus` flag. GPU access is declared as a device reservation under `deploy.resources`:

```yaml
services:
  ollama:
    image: ollama/ollama
    container_name: ollama
    restart: unless-stopped
    ports:
      - "127.0.0.1:11434:11434"
    volumes:
      - ollama:/root/.ollama
    environment:
      - OLLAMA_KEEP_ALIVE=30m
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    container_name: open-webui
    restart: unless-stopped
    depends_on:
      - ollama
    ports:
      - "127.0.0.1:3000:8080"
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
    volumes:
      - open-webui:/app/backend/data

volumes:
  ollama:
  open-webui:
```

A few details that matter:

- **`capabilities: [gpu]` is mandatory.** Without it the reservation is invalid. `count` takes an integer or `all`.
- **`count` and `device_ids` are mutually exclusive.** To pin GPUs, replace `count: all` with `device_ids: ["0"]` (or a UUID from `nvidia-smi -L`); setting both is an error.
- **Open WebUI talks to Ollama by service name.** Both services share the Compose project's default network, so `http://ollama:11434` resolves inside it and the traffic never touches the host port.
- **Open WebUI listens on 8080 inside its container.** The mapping `3000:8080` puts it on `http://localhost:3000`.

Start it and follow the logs:

```bash
docker compose up -d
docker compose logs -f ollama
```

Pull a model through the container, then pick it in the Open WebUI model menu:

```bash
docker compose exec ollama ollama pull llama3.1:8b
```

### The AMD variant

Swap the image tag and replace the `deploy` block with device mappings:

```yaml
services:
  ollama:
    image: ollama/ollama:rocm
    container_name: ollama
    restart: unless-stopped
    ports:
      - "127.0.0.1:11434:11434"
    volumes:
      - ollama:/root/.ollama
    devices:
      - /dev/kfd
      - /dev/dri

volumes:
  ollama:
```

The Open WebUI service is unchanged.

### Running Open WebUI against a native Ollama

If Ollama runs directly on the host (the usual setup on a Mac), run only Open WebUI in Docker and let it reach the host through the special `host.docker.internal` name:

```bash
docker run -d -p 3000:8080 --add-host=host.docker.internal:host-gateway \
  -v open-webui:/app/backend/data --name open-webui --restart always \
  ghcr.io/open-webui/open-webui:main
```

On Linux, the native Ollama service binds `127.0.0.1` by default, which a container cannot reach through the host gateway. You would have to bind it to the Docker bridge address, which is one more reason to run both in Compose.

---

## Persistent storage and model sizes

### What lives in the volume

Everything Ollama downloads goes under `/root/.ollama` in the container: model blobs, manifests and the server's key pair. Mounting the named volume `ollama` there means `docker rm ollama`, an image upgrade, or a Compose recreate leaves your models in place. Without the volume, every new container downloads every model again.

To keep models on a specific disk, use a bind mount instead of a named volume:

```yaml
    volumes:
      - /srv/ollama:/root/.ollama
```

Alternatively, set `OLLAMA_MODELS` to a different path inside the container and mount that.

### How much disk to plan for

Model files are almost exactly the weights column of the VRAM table: at Q4_K_M, about 0.61 GB of disk per billion parameters.

| Model (Q4_K_M) | Approximate download |
|---|---|
| Llama 3.2 3B | 1.8 GB |
| Llama 3.1 8B | 4.9 GB |
| Qwen2.5 14B | 8.6 GB |
| Qwen2.5 32B | 19.6 GB |
| Llama 3.1 70B | 42.8 GB |

Higher-precision tags scale with bits per weight: the same 8B model is about 8.5 GB at `Q8_0` and 16 GB at FP16. A few experiments fill 100 GB quickly. `ollama list` shows what is on disk and `ollama rm <model>` reclaims it.

### Upgrading

Because the state lives in the volume, an upgrade is a pull and a recreate:

```bash
docker compose pull ollama
docker compose up -d ollama
```

Pin a version tag rather than the floating default once a setup works, so a host reboot does not silently change Ollama under you. If you build your own image on top of `ollama/ollama` (to bake in a default model or a healthcheck), run the Dockerfile through the [Dockerfile linter](/dockerfile-linter/) before it lands in CI.

---

## Port 11434 and OLLAMA_HOST: keep it private

### What the defaults mean

A native Ollama install binds `127.0.0.1:11434`, reachable only from the same machine. The Docker image is different: inside the container Ollama listens on all interfaces (`0.0.0.0`), because it has to accept traffic arriving through Docker's port mapping. **What decides who can reach it is the `-p` flag**, and `-p 11434:11434` publishes the port on every interface of the host.

The Ollama API has **no authentication**. Anyone who can reach the port can:

- run any model you have on your GPU, for as long as they like;
- pull new models and fill your disk;
- delete your models through the API.

Scanners look for open 11434 ports, so a home server or cloud VM with a public IP and the default command is an open GPU within days.

### Bind to localhost

Publish the port on the loopback address only:

```bash
docker run -d --gpus=all -v ollama:/root/.ollama -p 127.0.0.1:11434:11434 --name ollama ollama/ollama
```

The Compose file above already does this for both services. Containers on the same Compose network still reach Ollama by service name, so Open WebUI keeps working with no host port published at all. You can drop the Ollama `ports:` block entirely if nothing on the host calls the API directly.

> **Note:** Docker writes its own iptables rules for published ports, and the traffic is diverted in the `nat` table before UFW's rules ever see it (on firewalld hosts Docker adds its own `docker` zone that accepts forwarded traffic). A `ufw deny 11434` does **not** protect a port published with `-p 11434:11434`. Binding to `127.0.0.1` is the reliable fix.

### When other machines need access

Expose the API through something that authenticates: a reverse proxy (Caddy, nginx, Traefik) with basic auth or OIDC in front of `ollama:11434`, or a private network such as a VPN or a tailnet. Open WebUI has its own user accounts, so exposing *it* behind TLS while Ollama stays unpublished is the common pattern. The first account created in Open WebUI becomes the admin, so create yours before sharing the URL.

For the native service, the equivalent setting is the `OLLAMA_HOST` environment variable (for example `OLLAMA_HOST=0.0.0.0:11434`). The same rule applies: only bind beyond localhost on a network you trust.

---

## Tuning the server for your VRAM

Ollama reads its configuration from environment variables, so in Docker they go in `-e` flags or the Compose `environment:` list.

| Variable | Default (as of October 2026) | Why change it |
|---|---|---|
| `OLLAMA_CONTEXT_LENGTH` | 4K below 24 GiB VRAM, 32K for 24 to 48 GiB, 256K at 48 GiB and above | Longer prompts or documents; each doubling doubles the KV cache |
| `OLLAMA_KEEP_ALIVE` | `5m` | Keep a model resident longer and avoid reload delays |
| `OLLAMA_MAX_LOADED_MODELS` | 3 x the number of GPUs (3 on CPU) | Set to `1` on small cards so two models never compete for VRAM |
| `OLLAMA_NUM_PARALLEL` | `1` | Serve concurrent requests; each slot adds KV cache |
| `OLLAMA_KV_CACHE_TYPE` | `f16` | `q8_0` roughly halves KV cache memory |
| `OLLAMA_FLASH_ATTENTION` | Enabled where supported | Force on or off when debugging |

Context length is the setting people underestimate. For Llama 3.1 8B at Q4_K_M, the KV cache is 1 GiB at 8K context, 4 GiB at 32K and 16 GiB at the full 128K, which takes the total from 7.05 GiB to 10.05 GiB to 22.05 GiB. An 8 GB card that runs the model happily at 8K will spill to the CPU at 32K. Check any combination on the [Llama 3.1 8B page](/llm-vram-calculator/llama-3-1-8b/) before you raise the limit. When you are sizing prompts for a context window, the [LLM token counter](/llm-token-counter/) shows how many tokens a document actually uses.

---

## Troubleshooting

### "could not select device driver with capabilities: [[gpu]]"

Docker does not know about the NVIDIA runtime. Either the Container Toolkit is not installed, or `nvidia-ctk runtime configure --runtime=docker` was not run, or Docker was not restarted afterwards. Run all three steps, then repeat the `ubuntu nvidia-smi` test.

### The container runs but `ollama ps` shows 100% CPU

Work from the outside in:

1. **Host:** does `nvidia-smi` work on the host at all? If not, fix the driver first. Nothing in Docker can work around a missing driver.
2. **Container flags:** was it started with `--gpus=all`, or does the Compose service have the `deploy.resources.reservations.devices` block? `docker inspect ollama` shows the device requests. A plain `docker compose up` on a file without the block gives a CPU-only container with no error.
3. **Inside the container:** `docker exec -it ollama nvidia-smi`. If this fails while the host command works, the problem is the runtime configuration.
4. **Ollama's own view:** `docker logs ollama` prints the GPUs Ollama discovered at startup, or says that none were found, along with the reason.

On AMD, check that `/dev/kfd` and `/dev/dri` exist on the host, that both were passed with `--device`, that you used the `:rocm` tag, and whether your card is on the supported list.

### CUDA version mismatch

`nvidia-smi` reports the highest CUDA version the host driver supports. If the CUDA libraries in the image are newer than that, the GPU backend fails to initialize and Ollama falls back to the CPU, with errors like "CUDA driver version is insufficient for CUDA runtime version" in the logs. The fix is on the host: update the NVIDIA driver to at least 550 (570 for compute capability 5.0 to 6.2 cards), as of October 2026. Downgrading the image works as a stopgap, but you lose every fix since.

The reverse never causes trouble. A new driver runs older CUDA libraries.

### Out of memory, or the model spills to the CPU

If the model loads partly on the CPU, crashes with an out-of-memory error, or generates painfully slowly, the total footprint exceeds your VRAM. In order of least sacrifice:

1. **Shorten the context.** Set `OLLAMA_CONTEXT_LENGTH` lower; the KV cache shrinks proportionally.
2. **Quantize the KV cache.** `OLLAMA_KV_CACHE_TYPE=q8_0` roughly halves it.
3. **Load one model at a time.** `OLLAMA_MAX_LOADED_MODELS=1`, and stop other GPU processes (a desktop compositor or a browser can hold hundreds of MB).
4. **Use a smaller quantization.** Moving from `Q8_0` to `Q4_K_M` cuts Llama 3.1 8B from 10.42 GiB to 7.05 GiB at 8K context.
5. **Use a smaller model.** Qwen2.5 14B at 10.97 GiB fits a 12 GB card where Qwen2.5 32B at 21.72 GiB does not.

The [LLM VRAM calculator](/llm-vram-calculator/) shows the effect of each change before you pull a single gigabyte. The [Qwen2.5 14B](/llm-vram-calculator/qwen2-5-14b/) and [Qwen2.5 32B](/llm-vram-calculator/qwen2-5-32b/) pages are a good place to see where the 12 GB and 24 GB lines fall.

### Slow first response, fast afterwards

That is the model loading from disk into VRAM. It happens again after `OLLAMA_KEEP_ALIVE` expires. Raise the keep-alive, or put the volume on an SSD if it is on spinning disk or network storage.

### Permission errors on a bind mount

The official image runs as root, so a bind-mounted host directory works without changes. If you run the container as a non-root user (`--user`), that user needs write access to the mounted path, and on AMD it needs membership in the groups that own `/dev/kfd` and `/dev/dri`.

---

## Quick reference

```bash
# NVIDIA: toolkit, then run
sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker
docker run -d --gpus=all -v ollama:/root/.ollama -p 127.0.0.1:11434:11434 --name ollama ollama/ollama

# AMD: ROCm image, device nodes
docker run -d --device /dev/kfd --device /dev/dri -v ollama:/root/.ollama -p 127.0.0.1:11434:11434 --name ollama ollama/ollama:rocm

# Verify
docker exec -it ollama nvidia-smi
docker exec -it ollama ollama run llama3.2
docker exec -it ollama ollama ps
```

For a broader grounding in images, volumes and networks, the [Docker for DevOps guide](/learn/guides/docker-for-devops/) covers the parts of Docker this setup leans on.

---
title: "OOMKilled and exit code 137: why Kubernetes killed your pod"
description: "Exit code 137 means the kernel killed your container for exceeding its memory limit. How to confirm it, and why raising the limit is usually the wrong fix."
pubDate: 2026-08-29
tags: ["kubernetes","memory","limits","debugging"]
relatedTool:
  name: "Kubernetes Resource Calculator"
  href: "/kubernetes-resource-calculator"
---

![A pod restarting under memory pressure: the container's working set crossing its configured limit line, the kernel OOM killer terminating it, and the restart counter incrementing.](/blog/kubernetes-oomkilled-exit-code-137-hero.svg)

A pod is restarting and you can't see why. The logs end mid-request with nothing that looks like a crash. Then you describe it:

```
    State:          Running
    Last State:     Terminated
      Reason:       OOMKilled
      Exit Code:    137
      Started:      Mon, 29 Aug 2026 09:14:02 +0000
      Finished:     Mon, 29 Aug 2026 09:41:37 +0000
    Restart Count:  6
```

Two things are worth knowing immediately. **Your application did not crash** — it was killed from outside, by the Linux kernel, with SIGKILL. And **there is no graceful shutdown and no stack trace**, because SIGKILL cannot be caught. That silence in the logs is the expected symptom, not a missing clue.

## What 137 actually means

`137` is `128 + 9`. The 128 marks "terminated by signal", and 9 is SIGKILL. So exit code 137 means *something* sent SIGKILL — most often the kernel's OOM killer, but not always.

The distinction that matters:

- **`Reason: OOMKilled`** — the container exceeded its memory limit. The kernel's cgroup OOM killer terminated it.
- **`Reason: Error`, exit code 137** — something else sent SIGKILL. Usually a `terminationGracePeriodSeconds` that expired: Kubernetes sent SIGTERM, the process ignored it or shut down too slowly, and Kubernetes escalated to SIGKILL.

Read the `Reason` field before assuming memory. The second case is a shutdown-handling bug and no amount of extra memory will fix it.

```bash
kubectl describe pod <pod> | grep -A4 "Last State"
```

## Confirm it, don't infer it

`Restart Count` going up with `OOMKilled` in `Last State` is the confirmation. To see the pattern rather than a single instance:

```bash
# Which containers have OOMed, across the namespace
kubectl get pods -o json \
  | jq -r '.items[] | .metadata.name as $p
      | .status.containerStatuses[]?
      | select(.lastState.terminated.reason=="OOMKilled")
      | "\($p)\t\(.name)\trestarts=\(.restartCount)"'
```

Also check events, which sometimes name the node-level pressure that triggered it:

```bash
kubectl get events --field-selector reason=OOMKilling -A
```

## Why raising the limit is often the wrong first move

The reflex is to double `limits.memory` and move on. Sometimes that is correct — the limit was simply set below what the workload legitimately needs. Often it isn't, and it converts a fast, obvious failure into a slow, expensive one.

Ask which of these you have:

**A limit that was always too low.** The container OOMs quickly and consistently, often within seconds of starting, at roughly the same memory figure every time. Raising the limit is the right fix.

**A leak.** Memory climbs steadily over minutes or hours until it hits the ceiling, and the time-to-OOM is proportional to the limit. Doubling the limit doubles the time between restarts and fixes nothing. The tell is that `Started` and `Finished` in `Last State` are far apart, and the interval grows when you raise the limit.

**A runtime that ignores the cgroup.** The JVM before it was container-aware, Node's default old-space, Go with no `GOMEMLIMIT` — the runtime sizes its heap against the *node's* total memory, not the container's limit, then confidently allocates past the ceiling. This is extremely common and looks exactly like a leak from the outside.

For the JVM, use the container-aware flags rather than a fixed `-Xmx`:

```yaml
env:
  - name: JAVA_TOOL_OPTIONS
    value: "-XX:MaxRAMPercentage=75.0"
```

For Go 1.19+, tell the runtime the ceiling so the garbage collector works against the real budget:

```yaml
env:
  - name: GOMEMLIMIT
    valueFrom:
      resourceFieldRef:
        resource: limits.memory
```

`resourceFieldRef` reads the container's own limit, so the two can never drift apart.

## The requests-versus-limits mistake behind most of it

Memory and CPU behave completely differently under pressure, and conflating them causes a lot of unnecessary OOMKills.

- **CPU is compressible.** Exceed the CPU limit and you get throttled — slower, but alive.
- **Memory is not.** Exceed the memory limit and you are killed. There is no "a bit slower" state.

That asymmetry has a direct consequence: **CPU limits are optional and often harmful; memory limits are essential.**

The second half is the Quality of Service class, which decides who gets killed first when the *node* runs out of memory:

| requests vs limits | QoS class | Eviction order |
|---|---|---|
| Not set | `BestEffort` | Killed first |
| requests < limits | `Burstable` | Middle |
| requests == limits | `Guaranteed` | Killed last |

A pod with no memory request is `BestEffort` and is the first thing evicted under node pressure — even if it was using very little. If a workload matters, give it a request. For anything latency-sensitive, set request equal to limit and get `Guaranteed`.

```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"     # equal to request -> Guaranteed
```

## Sizing it, and checking what it costs

Base the number on observation, not a guess. Use the working set over a representative window — including whatever your peak actually is:

```promql
max_over_time(
  container_memory_working_set_bytes{pod=~"my-app-.*", container!=""}[7d]
)
```

Take that peak and add headroom — commonly 20–30%, more if traffic is spiky. Note that `container_memory_working_set_bytes` is the metric the OOM killer effectively acts on, which is why it is the right one here rather than `container_memory_usage_bytes` (which includes reclaimable cache and will overstate your need).

Once you have a per-container number, the arithmetic across replicas is where mistakes creep back in — millicores and `Mi`/`Gi` units, multiplied by replica counts, summed across containers including sidecars. The [Kubernetes Resource Calculator](/kubernetes-resource-calculator/) totals CPU and memory requests and limits across containers and replicas and converts the units, so you can see what a deployment actually reserves on the cluster before you apply it.

To be clear about what that does and does not do: it will not tell you *why* a container OOMed — that comes from the metric above and the runtime's own behaviour. What it answers is the question that follows, which is whether the limit you just chose, multiplied by every replica, still fits the nodes you have.

## A working order

1. `kubectl describe pod` and read `Reason`. `OOMKilled` is memory; `Error` with 137 is a shutdown-grace problem instead.
2. Check whether time-to-OOM scales with the limit. If it does, you have a leak or a runtime ignoring the cgroup — fix that, don't raise the ceiling.
3. If the runtime is the JVM, Node or Go, make it container-aware before touching limits.
4. Size from `max_over_time(container_memory_working_set_bytes[7d])` plus headroom.
5. Set a memory *request* as well as a limit, so the pod isn't `BestEffort` and first to be evicted.
6. Total it across replicas and confirm it still fits the node pool.

The recurring theme: exit code 137 is a report that something exceeded a boundary, not a description of the bug. The useful question is never "how much memory should I add" but "does this workload's memory grow with time, and does its runtime know what its ceiling is".

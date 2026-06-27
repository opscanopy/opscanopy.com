---
title: "Kubernetes isn't that scary — you really only need 8 objects (and to read 3 errors)"
published: false
description: "K8s felt like alphabet soup until it clicked. Here are the 8 objects that actually matter and the 3 errors you WILL hit, with the exact kubectl to debug them."
tags: kubernetes, devops, beginners, tutorial
cover_image: ""
canonical_url: ""
---

The first time I opened a Kubernetes manifest, I closed my laptop. Pods, ReplicaSets, DaemonSets, StatefulSets, CRDs, operators, service meshes — it read like someone had thrown a dictionary into a YAML file and called it a platform. I was a backend dev who could ship a Docker container fine, and suddenly everyone on the team was talking about "the cluster" like it was a person.

Here's what nobody told me back then, and what I want to tell you now: **you do not need to learn all of Kubernetes to be productive in it.** You need maybe eight objects and the ability to read three error messages. That's the working set. Everything else you pick up the day you actually need it.

So let me hand you the mental model I wish I'd had.

> **TL;DR:** Learn Pod, Deployment, Service, Ingress, ConfigMap, Secret, Namespace, and resource requests/limits. Then learn to debug `CrashLoopBackOff`, `ImagePullBackOff`, and `OOMKilled` with `kubectl describe` and `kubectl logs`. That's 90% of daily k8s.

One prerequisite, said plainly: you should be comfortable with containers first. If "image vs container" is fuzzy, spend an afternoon with the [Docker for DevOps guide](https://opscanopy.com/learn/guides/docker-for-devops) before this. Kubernetes runs containers — it does not replace knowing what one is.

> 🖼️ **[IMAGE PROMPT]:** Clean modern isometric infrastructure diagram, a friendly ship's helm (Kubernetes wheel) at the center steering several cargo nodes, each node a translucent box containing small glowing pods. Soft emerald-green (#10b981) accents on a dark slate background, subtle grid floor, calm and approachable mood, thin labeled connector lines. Flat-but-dimensional vector style, no text clutter, no photorealism. Aspect ratio 1200x630.

## Part 1: The 8 objects that actually matter

### 1. Pod — one running thing

A Pod is the smallest unit Kubernetes will schedule. Think of it as a single seat on a bus: usually one container sits in it, occasionally a couple of containers that genuinely need to ride together (a main app plus a tiny sidecar). The bus is the node. K8s decides which seat on which bus your app gets.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: hello
spec:
  containers:
    - name: web
      image: nginx:1.27
```

You'll rarely write a raw Pod like this in production, though. Which brings us to the object you actually use.

### 2. Deployment — the manager who keeps Pods alive

If a Pod is one worker, a Deployment is the shift manager who guarantees "I always want three of these running, and when I hand you a new version, roll it out without dropping traffic." Kill a Pod by hand and the Deployment quietly spins up a replacement. That self-healing is the whole point.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27
```

Notice the `selector` and the `labels` matching. That's not boilerplate you can skip — the Deployment finds its Pods by label. Mismatch them and you get zero running Pods and zero errors, which is a fun afternoon. (Ask me how I know.)

### 3. Service — a stable address for a moving target

Pods are cattle, not pets. They die, get rescheduled, change IPs constantly. So how does Pod A reliably talk to Pod B? A Service. It's a fixed phone number that always forwards to whichever Pods are currently healthy. You call the Service name; it load-balances behind the scenes.

There are three flavours worth knowing:

- **ClusterIP** (the default) — reachable only *inside* the cluster. Most internal services live here.
- **NodePort** — opens the same port on every node. Crude, but handy for quick testing.
- **LoadBalancer** — asks your cloud provider for a real external load balancer. This is how the outside world reaches you on a managed cluster.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web      # same label as the Deployment's Pods
  ports:
    - port: 80
      targetPort: 80
```

### 4. Ingress — the front-desk router for HTTP

A LoadBalancer per service gets expensive and messy fast. Ingress fixes that: it's one HTTP(S) router sitting at the edge, mapping hostnames and paths to the right Service. `api.example.com` goes here, `app.example.com/admin` goes there, and TLS termination happens in one place. You need an ingress controller running (nginx-ingress, Traefik, or your cloud's) for the Ingress object to mean anything — the YAML is just the routing table; the controller is the actual receptionist.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
```

### 5 and 6. ConfigMap and Secret — pulling config out of your image

You don't bake the database URL into your image. You inject it. ConfigMap holds non-sensitive config (feature flags, log levels, that database *host*); Secret holds the sensitive stuff (passwords, API tokens).

They look almost identical to use. But one honest warning, because this trips people up constantly:

> **Footgun:** A Kubernetes Secret is only **base64-encoded**, not encrypted. Anyone who can read the Secret can `base64 -d` it in two seconds. By default it sits in etcd unencrypted too. To make Secrets actually secret, you need encryption-at-rest enabled on etcd plus tight RBAC. Treat "Secret" as "marked sensitive," not "safe."

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  LOG_LEVEL: "info"
  DB_HOST: "postgres.internal"
```

A Secret is the same shape with `kind: Secret` and base64 values under `data:`. Use one for the password, the ConfigMap for everything else.

### 7. Namespace — rooms in the same house

A Namespace is a logical partition inside one cluster. `dev`, `staging`, `prod`, or a namespace per team. Names only need to be unique *within* a namespace, so two teams can both have a Service called `web` without colliding. It's also where you hang quotas and access rules. Small concept, saves a lot of arguments.

```bash
kubectl create namespace staging
kubectl get pods -n staging
```

### 8. Resource requests and limits — the most-skipped, most-important setting

This is the one beginners ignore and then page themselves at 2am over. Every container can declare two numbers for CPU and memory:

- **request** — what the scheduler reserves for you. It's used to decide which node has room.
- **limit** — the hard ceiling. Go over the memory limit and the kernel kills your container (more on that in Part 2).

```yaml
resources:
  requests:
    cpu: "250m"      # 0.25 of a CPU core
    memory: "256Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"
```

These numbers also decide your Pod's **QoS class**, which determines who gets evicted first when a node runs out of memory:

- **Guaranteed** — requests equal limits for every resource. Last to be killed.
- **Burstable** — requests set, limits higher (or partial). The common middle ground.
- **BestEffort** — nothing set at all. First against the wall when memory gets tight.

Guessing these numbers is genuinely hard, and "I'll set it later" usually means "never." If you want sane starting values without spreadsheet math, OpsCanopy has a [free in-browser Kubernetes resource calculator](https://opscanopy.com/kubernetes-resource-calculator) — punch in what your app roughly needs and it gives you requests/limits you can paste straight into the manifest. No signup, runs entirely in your browser.

While we're here: **liveness and readiness probes** are worth a mention even though they're not on the core-8 list. A readiness probe tells the Service "don't send me traffic until I'm warmed up." A liveness probe tells the kubelet "if this check fails, restart me." Get them backwards and you'll restart healthy pods or route traffic into cold ones. Learn them right after you're comfortable with the eight above.

> 🖼️ **[IMAGE PROMPT]:** Isometric cutaway of three worker nodes side by side, each holding pods drawn as small containers with little fuel-gauge meters labeled "request" and "limit". One node's pod meter is overflowing red while the others sit calm green. Dark background, emerald (#10b981) and amber accent palette, clean technical illustration style, thin labels, instructive and slightly playful mood. Aspect ratio 1200x675.

## Part 2: The 3 errors you WILL hit

You will see these. Not "might." The good news is they're readable once you know where to look, and the where-to-look is almost always the same two commands:

```bash
kubectl get pods                 # spot the bad pod and its status
kubectl describe pod <name>      # the Events section is gold
```

### CrashLoopBackOff — your container keeps dying on startup

This means the container starts, exits, gets restarted, exits again, and Kubernetes is now backing off (waiting longer between each retry) so it doesn't hammer a doomed process. The status sounds dramatic; it just means "your app won't stay up."

It's almost never Kubernetes' fault. It's your app crashing — a missing env var, a bad config, an unreachable database, a typo'd start command. So read your app's own logs:

```bash
kubectl logs <pod-name>
kubectl logs <pod-name> --previous   # logs from the crashed instance, before the restart
```

That `--previous` flag is the trick most people miss. By the time you run `kubectl logs`, the current container may be a fresh restart with nothing useful in it. `--previous` shows you the instance that actually died — that's where your stack trace lives.

### ImagePullBackOff — Kubernetes can't get your image

Different beast entirely. The container never even started, because the node couldn't pull the image. Same backoff idea (it's retrying with increasing delays), different cause. Usual suspects:

- A typo in the image name or tag (`ngnix:1.27` instead of `nginx`)
- The tag doesn't exist in the registry
- It's a private registry and you didn't give the cluster pull credentials (`imagePullSecrets`)

The exact reason is sitting in the events:

```bash
kubectl describe pod <pod-name>
# scroll to Events — you'll see the real message,
# e.g. "Failed to pull image ... not found" or "unauthorized"
```

When something cluster-wide feels off and a single pod's events aren't enough, widen the lens:

```bash
kubectl get events --sort-by=.lastTimestamp
```

That gives you a chronological feed of what the cluster's been doing — often the clearest narrative of what broke and when.

### OOMKilled — your container ate too much memory

OOM = Out Of Memory. Your container tried to use more memory than its **limit**, and the kernel killed it. (That's the OOM killer doing exactly what you told it to.) You'll spot it in the pod's state:

```bash
kubectl describe pod <pod-name>
# Look for: State: Terminated   Reason: OOMKilled
```

Here's the part that connects back to Part 1: OOMKilled is the direct consequence of memory limits, so the fix is rarely "give it infinite memory." It's setting the *right* limit. Too low and you get killed under normal load. Too high and the scheduler over-commits the node and everyone suffers. This is exactly why guessing requests/limits by hand is risky, and why I'll point you one more time at that [resource calculator](https://opscanopy.com/kubernetes-resource-calculator) to get a defensible starting point instead of a vibe.

Sometimes OOMKilled is a real memory leak in your app, and no limit will save you — but the limit is what turns "node falls over and takes ten other apps with it" into "one pod restarts cleanly." That blast-radius containment is the feature, not the bug.

> 🖼️ **[IMAGE PROMPT]:** A clean labeled error-state diagram, three pod icons in a row each showing a distinct failure: one looping in a restart cycle labeled "CrashLoopBackOff", one with a broken download/cloud icon labeled "ImagePullBackOff", one with a popped/overfilled memory bar labeled "OOMKilled". Beneath each, a small terminal chip showing the key kubectl command. Dark slate background, emerald (#10b981) headings with red/amber error accents, monospace labels, technical-explainer style, no photorealism. Aspect ratio 1200x675.

## Where to go from here

That's the honest core of Kubernetes. Eight objects, three errors, two debugging commands you'll type a thousand times. You're not "done" — nobody is — but you can now read a manifest, deploy something, and figure out why it broke without spiralling. That's the threshold where k8s stops being scary and starts being useful.

When you're ready to go deeper — probes done properly, rollouts and rollbacks, StatefulSets, RBAC, the bits I deliberately skipped — the [Kubernetes for DevOps guide](https://opscanopy.com/learn/guides/kubernetes-for-devops) on OpsCanopy walks through all of it with working YAML, and the [Kubernetes roadmap](https://opscanopy.com/learn/roadmaps/kubernetes) lays out a sane order to learn things so you're not jumping around. Both are free, no account needed, and they sit alongside the rest of the [Learn hub](https://opscanopy.com/learn) if you're picking up DevOps more broadly.

Open a manifest. Deploy something small. Break it on purpose and read the error. That loop is how it finally clicked for me, and it'll click for you faster than you think.

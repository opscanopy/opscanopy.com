---
title: "Kubernetes for DevOps: Pods, Deployments, Services & More"
description: "Learn Kubernetes for DevOps — pods, deployments, services, ingress, configmaps, secrets, resource requests and limits, probes, and kubectl, with YAML examples."
track: kubernetes
order: 1
difficulty: intermediate
updatedDate: 2026-06-27
tags: ["kubernetes", "k8s", "devops", "containers", "kubectl"]
relatedTools: ["kubernetes-resource-calculator", "promql-explainer", "prometheus-relabel-tester"]
seoTitle: "Kubernetes for DevOps: Core Concepts Guide"
metaDescription: "Learn Kubernetes for DevOps — pods, deployments, services, ingress, configmaps, secrets, resource limits, and kubectl. Concepts plus YAML examples."
faqs:
  - q: "What is the difference between a Pod and a Deployment?"
    a: "A Pod is the smallest deployable unit (one or more containers sharing network/storage). A Deployment manages a ReplicaSet that keeps a desired number of identical Pods running and handles rollouts."
  - q: "What are the types of Kubernetes Services?"
    a: "ClusterIP (internal-only, default), NodePort (exposes a port on every node), and LoadBalancer (provisions an external load balancer). Ingress sits in front for HTTP routing."
  - q: "What is the difference between a Service and an Ingress?"
    a: "A Service gives Pods a stable network identity and load-balances to them; an Ingress is an HTTP(S) router that maps hostnames/paths to Services, usually via an ingress controller."
  - q: "When should I use a ConfigMap vs a Secret?"
    a: "Use ConfigMaps for non-sensitive configuration and Secrets for sensitive data (passwords, tokens, keys). Secrets are base64-encoded and can be encrypted at rest and access-controlled via RBAC."
  - q: "What is the difference between a resource request and a limit?"
    a: "A request is the guaranteed amount the scheduler reserves; a limit is the hard ceiling the container can use. Requests affect scheduling and QoS; exceeding a memory limit gets the container OOM-killed."
  - q: "What are the most useful kubectl commands for beginners?"
    a: "kubectl get/describe (inspect), kubectl apply -f (declarative changes), kubectl logs and kubectl exec (debugging), kubectl rollout status/undo (deployments), and kubectl get events."
---

Kubernetes (K8s) has become the standard runtime fabric for containerised workloads. Whether you are deploying a single microservice or coordinating hundreds of them across multiple availability zones, K8s gives you a consistent, declarative API to describe what should run, where it should run, and how it should behave. This guide walks through the core concepts a DevOps engineer needs day-to-day — cluster architecture, workload primitives, networking, configuration, observability, and troubleshooting — with working YAML and `kubectl` commands throughout.

## Why Kubernetes?

Running containers in production with plain Docker quickly exposes a set of operational problems: who restarts a crashed container, how do you roll out a new image version without downtime, how do you balance traffic across multiple replicas, and how do you ensure a container on a node with 64 GB RAM does not starve a neighbouring container of memory?

Kubernetes solves these problems through the **desired-state model**: you tell the cluster what the end state should look like (a YAML manifest), and controllers continuously reconcile actual state toward that goal. This gives you:

- **Self-healing** — crashed containers are restarted; failed nodes trigger Pod rescheduling.
- **Horizontal scaling** — add replicas with one command or automatically via HPA.
- **Rolling updates and rollbacks** — new versions roll out gradually; one command reverts them.
- **Service discovery and load balancing** — Pods get stable DNS names without static IPs.
- **Declarative configuration** — your entire infrastructure lives in version-controlled YAML.

> **Note:** Kubernetes does not replace a CI/CD pipeline. It is the runtime target; tools like Argo CD, Flux, or Jenkins deploy to it.

## Cluster Architecture

Understanding the architecture prevents a lot of confusion when things go wrong.

### Control Plane

The control plane is the brain of the cluster. In managed services (EKS, GKE, AKS) it is operated for you; in self-managed setups you are responsible for its reliability.

| Component | Role |
|---|---|
| **kube-apiserver** | Single entry point for all cluster operations. Validates and persists objects to etcd. Every `kubectl` command talks to this. |
| **etcd** | Distributed key-value store. Holds all cluster state. Losing etcd without a backup loses your cluster. |
| **kube-scheduler** | Watches for new Pods with no assigned node and picks the best node based on resource requests, taints, affinity rules, and topology spread. |
| **kube-controller-manager** | Runs core controllers: ReplicaSet, Deployment, Node, Endpoints, ServiceAccount, and others. Each controller reconciles its resource type. |
| **cloud-controller-manager** | (Cloud clusters only) Interfaces with cloud provider APIs — creates load balancers, routes, storage volumes. |

### Worker Nodes

Every node that runs workloads must have three components:

| Component | Role |
|---|---|
| **kubelet** | Agent on each node. Receives PodSpec from the API server and instructs the container runtime to start/stop containers. Reports node and Pod status. |
| **kube-proxy** | Maintains iptables/ipvs rules that implement Service networking — forwarding traffic to the correct Pod IPs. |
| **Container runtime** | Actually runs containers. Kubernetes supports any CRI-compatible runtime: containerd (most common), CRI-O, or Docker (via cri-dockerd shim). |

> **Tip:** In production, the control plane nodes are typically tainted so user workloads do not schedule on them. Managed services do this automatically.

### How a Pod Gets Scheduled

1. You run `kubectl apply -f pod.yaml`.
2. `kube-apiserver` validates the manifest and stores it in etcd.
3. `kube-scheduler` notices a Pod with no `nodeName` and selects a node.
4. `kubelet` on that node watches the API server, sees the Pod assigned to it, pulls the image, and starts the container.
5. `kube-proxy` updates network rules so the Pod is reachable via its Service.

## Pods

A Pod is the smallest schedulable unit in Kubernetes. It wraps one or more containers that share:

- **Network namespace** — all containers in a Pod share the same IP address and port space.
- **Storage** — volumes are declared at the Pod level and mounted into individual containers.
- **Lifecycle** — all containers start and stop together with the Pod.

### Minimal Pod Manifest

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-pod
  labels:
    app: web
spec:
  containers:
    - name: nginx
      image: nginx:1.27
      ports:
        - containerPort: 80
```

```bash
kubectl apply -f pod.yaml
kubectl get pods
kubectl describe pod web-pod
kubectl delete pod web-pod
```

### Pod Lifecycle

A Pod moves through these phases:

| Phase | Meaning |
|---|---|
| `Pending` | Pod accepted by the cluster; containers not yet started (pulling images, waiting for node). |
| `Running` | At least one container is running or starting. |
| `Succeeded` | All containers exited with code 0 (typical for Jobs). |
| `Failed` | At least one container exited with non-zero code and will not restart. |
| `Unknown` | Node communication lost; state cannot be determined. |

### Multi-Container Patterns

Pods can host multiple containers. The three canonical patterns are:

- **Sidecar** — a helper container that augments the main one (e.g., a log-shipper or a service mesh proxy like Envoy/Istio).
- **Init container** — runs to completion *before* the main containers start (e.g., database migration, config rendering from a vault).
- **Ambassador** — a proxy container that abstracts external services (e.g., a Redis proxy in front of a remote cluster).

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-sidecar
spec:
  initContainers:
    - name: init-migrate
      image: migrate-tool:v1
      command: ["./migrate", "--up"]
  containers:
    - name: app
      image: myapp:v2
      ports:
        - containerPort: 8080
    - name: log-shipper
      image: fluent/fluent-bit:3.0
      volumeMounts:
        - name: app-logs
          mountPath: /var/log/app
  volumes:
    - name: app-logs
      emptyDir: {}
```

### Why You Rarely Create Bare Pods

Bare Pods are not rescheduled if the node they are on fails. You should almost always use a higher-level workload controller (Deployment, StatefulSet, DaemonSet) that manages Pods on your behalf.

## ReplicaSets and Deployments

### ReplicaSet

A ReplicaSet ensures a specified number of identical Pod replicas are running at any time. It uses a label selector to identify the Pods it owns. If a Pod dies, the ReplicaSet creates a replacement.

> **Note:** You almost never create ReplicaSets directly. Deployments create and manage ReplicaSets for you, adding rollout history.

### Deployments

A Deployment wraps a ReplicaSet and adds rollout logic: you update the Pod template and the Deployment gradually replaces old Pods with new ones according to the configured strategy.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-deployment
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: myapp:v2
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
```

Key fields:

- `selector.matchLabels` — the Deployment manages any Pod with these labels. Must match `template.metadata.labels`.
- `strategy.rollingUpdate.maxUnavailable` — how many Pods can be unavailable during a rollout (absolute or percentage).
- `strategy.rollingUpdate.maxSurge` — how many extra Pods can be created above the desired count during a rollout.

```bash
# Apply or update
kubectl apply -f deployment.yaml

# Watch rollout progress
kubectl rollout status deployment/web-deployment

# Scale manually
kubectl scale deployment web-deployment --replicas=5

# View rollout history
kubectl rollout history deployment/web-deployment

# Rollback one version
kubectl rollout undo deployment/web-deployment
```

> **Tip:** Always set `resources.requests` and `resources.limits`. Without them, the scheduler cannot make good placement decisions and your Pods get the lowest QoS class.

## Services

A Service gives a stable DNS name and IP to a dynamic set of Pods selected by a label selector. Even as Pods are created and destroyed, the Service's IP (`ClusterIP`) and DNS name stay constant.

### Service Types

| Type | Accessibility | Typical Use |
|---|---|---|
| `ClusterIP` (default) | Inside the cluster only | Internal microservice communication |
| `NodePort` | Cluster nodes' IPs on a static port (30000–32767) | Dev/test external access without a cloud LB |
| `LoadBalancer` | External IP via cloud provider's load balancer | Production external traffic |
| `ExternalName` | DNS alias for an external service | Pointing in-cluster workloads at external endpoints |

### ClusterIP Example

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-service
  namespace: production
spec:
  selector:
    app: web
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8080
  type: ClusterIP
```

Pods in the same namespace can reach this service at `web-service:80`; pods in other namespaces use `web-service.production.svc.cluster.local:80`.

### LoadBalancer Example

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web-lb
  namespace: production
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
spec:
  selector:
    app: web
  ports:
    - protocol: TCP
      port: 443
      targetPort: 8080
  type: LoadBalancer
```

### How kube-proxy Implements Services

`kube-proxy` watches the API server for Service and Endpoints objects. When a Service is created, it programs iptables rules (or IPVS rules in IPVS mode) on every node so that traffic to the ClusterIP is DNAT'd to one of the healthy Pod IPs in the Endpoints list.

```bash
kubectl get svc -n production
kubectl describe svc web-service -n production
kubectl get endpoints web-service -n production
```

> **Caution:** A Service with no matching Pods will have an empty Endpoints list and traffic will be silently dropped. Always check `kubectl get endpoints` when debugging connectivity.

## Ingress

A Service of type `LoadBalancer` creates a separate cloud load balancer per service — expensive at scale. An **Ingress** is a cluster-wide HTTP(S) router that multiplexes many Services behind a single load balancer using hostname and path rules.

### Ingress Controller

An Ingress object is just a configuration resource. You also need an **Ingress controller** — a Pod that reads Ingress objects and programs a reverse proxy. Common choices:

- **NGINX Ingress Controller** (most widely deployed)
- **AWS Load Balancer Controller** (for ALB on EKS)
- **Traefik** (dynamic config, good for smaller clusters)
- **Istio Gateway** (service mesh, advanced traffic management)

### Ingress Manifest with TLS

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
  namespace: production
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.example.com
      secretName: tls-app-example-com
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-service
                port:
                  number: 80
```

The `tls.secretName` field references a Kubernetes Secret of type `kubernetes.io/tls` that holds the certificate and key. Tools like **cert-manager** automate TLS certificate provisioning and renewal via Let's Encrypt.

```bash
kubectl get ingress -n production
kubectl describe ingress web-ingress -n production
```

> **Tip:** Set `ingressClassName` explicitly. Older clusters used annotations (`kubernetes.io/ingress.class`), but the `ingressClassName` field is the current standard.

## ConfigMaps

A ConfigMap stores non-sensitive configuration as key-value pairs or files. Pods consume ConfigMaps as environment variables or as mounted files.

### Creating a ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: production
data:
  LOG_LEVEL: "info"
  MAX_CONNECTIONS: "100"
  config.yaml: |
    server:
      host: 0.0.0.0
      port: 8080
    database:
      pool_size: 10
```

```bash
kubectl apply -f configmap.yaml
kubectl get configmap app-config -n production -o yaml
```

### Consuming a ConfigMap as Environment Variables

```yaml
spec:
  containers:
    - name: app
      image: myapp:v2
      envFrom:
        - configMapRef:
            name: app-config
```

Or inject individual keys:

```yaml
      env:
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: LOG_LEVEL
```

### Consuming a ConfigMap as a Mounted File

```yaml
spec:
  containers:
    - name: app
      image: myapp:v2
      volumeMounts:
        - name: config-volume
          mountPath: /etc/app
  volumes:
    - name: config-volume
      configMap:
        name: app-config
        items:
          - key: config.yaml
            path: config.yaml
```

The file `/etc/app/config.yaml` inside the container will contain the YAML defined in the ConfigMap.

> **Note:** When you update a ConfigMap that is mounted as a volume, Kubernetes eventually (within ~60 seconds) updates the file in the container. Environment variables injected via `envFrom` are **not** updated — the Pod must be restarted.

## Secrets

Secrets store sensitive data — passwords, API tokens, TLS certificates, SSH keys. They are similar to ConfigMaps but:

- Values are **base64-encoded** (not encrypted by default, but can be with encryption at rest).
- Access is controlled by **RBAC** — separate from ConfigMap access.
- They integrate with external secret stores (HashiCorp Vault, AWS Secrets Manager) via CSI drivers or operators.

### Secret Types

| Type | Use |
|---|---|
| `Opaque` (default) | Arbitrary key-value data |
| `kubernetes.io/tls` | TLS certificate and key |
| `kubernetes.io/dockerconfigjson` | Docker registry credentials |
| `kubernetes.io/service-account-token` | SA tokens (auto-managed) |
| `kubernetes.io/ssh-auth` | SSH private keys |
| `kubernetes.io/basic-auth` | Username/password pairs |

### Creating an Opaque Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
  namespace: production
type: Opaque
data:
  username: YWRtaW4=        # base64("admin")
  password: c3VwZXJzZWNyZXQ= # base64("supersecret")
```

```bash
# Encode a value
echo -n "supersecret" | base64

# Create from literal (easier)
kubectl create secret generic db-credentials \
  --from-literal=username=admin \
  --from-literal=password=supersecret \
  -n production

# View (values are base64)
kubectl get secret db-credentials -n production -o yaml

# Decode a value
kubectl get secret db-credentials -n production \
  -o jsonpath='{.data.password}' | base64 --decode
```

### Consuming a Secret in a Pod

```yaml
spec:
  containers:
    - name: app
      image: myapp:v2
      env:
        - name: DB_USERNAME
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: username
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: password
```

### Encryption at Rest and RBAC

By default, Secrets in etcd are stored base64-encoded but not encrypted. Enable encryption at rest via the API server's `--encryption-provider-config` flag using an `aescbc` or `kms` provider.

Use RBAC to restrict which service accounts can `get`, `list`, or `watch` Secrets:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: secret-reader
  namespace: production
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    resourceNames: ["db-credentials"]
    verbs: ["get"]
```

> **Caution:** Never commit Secret manifests with real values to version control. Use sealed secrets (Bitnami Sealed Secrets), External Secrets Operator, or a Vault CSI driver to inject secrets at runtime.

## Namespaces

Namespaces provide a mechanism for isolating groups of resources within a single cluster. They are soft multi-tenancy: they scope names, RBAC, and resource quotas, but do not provide strong network isolation by themselves (for that, use NetworkPolicies).

### Built-in Namespaces

| Namespace | Purpose |
|---|---|
| `default` | Default for resources with no namespace specified |
| `kube-system` | Kubernetes control plane components (CoreDNS, kube-proxy, etc.) |
| `kube-public` | Publicly readable resources (ConfigMap with cluster info) |
| `kube-node-lease` | Node heartbeat lease objects |

### Common Namespace Operations

```bash
# List all namespaces
kubectl get namespaces

# Create a namespace
kubectl create namespace staging

# Run commands in a specific namespace
kubectl get pods -n staging

# Set a default namespace for your context
kubectl config set-context --current --namespace=staging

# View resources across all namespaces
kubectl get pods --all-namespaces
# or
kubectl get pods -A
```

### ResourceQuota and LimitRange

Namespaces support `ResourceQuota` (cap total resource usage per namespace) and `LimitRange` (set default and max limits per container).

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
  namespace: staging
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 8Gi
    limits.cpu: "8"
    limits.memory: 16Gi
    count/pods: "20"
```

## Resource Requests and Limits

Getting resource configuration right is one of the highest-leverage tuning tasks in Kubernetes.

### The Concepts

- **Request**: the amount of CPU/memory the scheduler *reserves* on a node for this container. The node must have at least this much available for the Pod to be scheduled there.
- **Limit**: the maximum CPU/memory the container is allowed to use. Exceeding the CPU limit causes throttling; exceeding the memory limit causes the container to be OOM-killed.

```yaml
resources:
  requests:
    cpu: "250m"      # 250 millicores = 0.25 CPU core
    memory: "256Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"
```

CPU is expressed in cores (`1`, `0.5`) or millicores (`500m`). Memory uses binary suffixes (`Ki`, `Mi`, `Gi`).

### QoS Classes

Kubernetes assigns one of three Quality of Service classes to every Pod based on its resource configuration:

| QoS Class | Condition | Eviction Priority |
|---|---|---|
| **Guaranteed** | Every container has `requests == limits` for both CPU and memory | Last to be evicted |
| **Burstable** | At least one container has a request or limit, but not Guaranteed | Middle priority |
| **BestEffort** | No container has any request or limit | First to be evicted under pressure |

> **Tip:** For production workloads, aim for **Guaranteed** or **Burstable** QoS. Use `kubectl describe pod <name>` and look for `QoS Class:` in the output.

### Setting the Right Numbers

Right-sizing requests and limits requires profiling your actual workload under load. Size CPU/memory requests and limits with the [Kubernetes Resource Calculator](/kubernetes-resource-calculator).

Common mistakes:

- Setting limits much higher than requests creates "noisy neighbour" risk.
- Setting limits equal to very low requests may cause OOMKills under normal spikes.
- Not setting requests at all results in BestEffort Pods that are first to go under node pressure.

### Vertical Pod Autoscaler (VPA) and Horizontal Pod Autoscaler (HPA)

- **HPA** scales the *number* of replicas based on CPU utilisation, memory, or custom metrics.
- **VPA** adjusts the *requests/limits* of existing containers (requires Pod restarts).

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web-deployment
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
```

## Health Probes

Kubernetes uses three probe types to determine container health. Without probes, a container is considered healthy the moment it starts — even if the application inside is not ready yet.

### Probe Types

| Probe | Kubernetes Action on Failure |
|---|---|
| **Liveness** | Restart the container. Use for detecting deadlocks — processes that are running but stuck. |
| **Readiness** | Remove the Pod from Service endpoints. Traffic stops flowing to it, but the container is not restarted. |
| **Startup** | Disables liveness and readiness until it succeeds. Use for slow-starting apps to prevent premature liveness restarts. |

### Probe Mechanisms

Each probe type can use one of three mechanisms:

- `httpGet` — HTTP GET request; success = 2xx/3xx response.
- `tcpSocket` — TCP connection; success = port is open.
- `exec` — run a command inside the container; success = exit code 0.

### Full Probe Example

```yaml
spec:
  containers:
    - name: app
      image: myapp:v2
      ports:
        - containerPort: 8080
      startupProbe:
        httpGet:
          path: /healthz
          port: 8080
        failureThreshold: 30
        periodSeconds: 10
      readinessProbe:
        httpGet:
          path: /ready
          port: 8080
        initialDelaySeconds: 5
        periodSeconds: 10
        failureThreshold: 3
        successThreshold: 1
      livenessProbe:
        httpGet:
          path: /healthz
          port: 8080
        initialDelaySeconds: 30
        periodSeconds: 15
        failureThreshold: 3
        timeoutSeconds: 5
```

Key parameters:

| Parameter | Default | Meaning |
|---|---|---|
| `initialDelaySeconds` | 0 | Seconds after container start before first probe |
| `periodSeconds` | 10 | How often to probe |
| `failureThreshold` | 3 | Failures before action is taken |
| `successThreshold` | 1 | Successes needed to transition back to healthy |
| `timeoutSeconds` | 1 | Seconds to wait for probe response |

> **Tip:** Always implement separate `/healthz` (liveness) and `/ready` (readiness) endpoints in your application. The readiness endpoint should check downstream dependencies (database reachability, cache connection); the liveness endpoint should only check the application itself.

## Rollouts and Rollbacks

### Rolling Update Strategy

The `RollingUpdate` strategy (default for Deployments) replaces old Pods with new ones incrementally. The `Recreate` strategy terminates all old Pods before starting new ones — useful when your app cannot run two versions simultaneously.

```bash
# Trigger a rollout by updating the image
kubectl set image deployment/web-deployment \
  web=myapp:v3 -n production

# Or edit the manifest and apply
kubectl apply -f deployment.yaml

# Watch the rollout in real time
kubectl rollout status deployment/web-deployment -n production

# Pause a rollout mid-way (canary-style)
kubectl rollout pause deployment/web-deployment -n production

# Resume
kubectl rollout resume deployment/web-deployment -n production
```

### Rollback

```bash
# View rollout history with change-cause annotations
kubectl rollout history deployment/web-deployment -n production

# View a specific revision
kubectl rollout history deployment/web-deployment \
  --revision=2 -n production

# Roll back to previous version
kubectl rollout undo deployment/web-deployment -n production

# Roll back to a specific revision
kubectl rollout undo deployment/web-deployment \
  --to-revision=2 -n production
```

> **Tip:** Annotate your rollouts with a change-cause so history is readable: add `kubernetes.io/change-cause: "bump to v3, adds auth middleware"` to the Deployment's `metadata.annotations` before applying.

### Deployment Revision History

By default, Kubernetes retains 10 revisions. Control this with `spec.revisionHistoryLimit`.

```yaml
spec:
  revisionHistoryLimit: 5
```

## Observability

A Kubernetes cluster generates a rich stream of metrics, logs, and events. Building good visibility requires three layers:

### Logs

`kubectl logs` reads from the container's stdout/stderr (captured by the container runtime and available via the API server):

```bash
# Follow logs from a running Pod
kubectl logs -f deployment/web-deployment -n production

# Show last 100 lines
kubectl logs web-pod --tail=100 -n production

# Logs from a specific container in a multi-container Pod
kubectl logs web-pod -c log-shipper -n production

# Logs from a previous (crashed) container instance
kubectl logs web-pod --previous -n production
```

For persistent log aggregation, deploy a log collector DaemonSet (Fluent Bit, Fluentd) that ships container logs to a backend (Elasticsearch, Loki, CloudWatch Logs).

### Metrics and Prometheus

The Kubernetes ecosystem is deeply integrated with **Prometheus**. The `metrics-server` provides basic CPU/memory metrics for HPA and `kubectl top`. For full observability, deploy the **kube-prometheus-stack** (Prometheus + Alertmanager + Grafana) or a managed equivalent.

Key scrape targets:

- `kube-state-metrics` — Deployment replicas, Pod status, resource requests/limits, PVC state.
- `node-exporter` — node-level CPU, memory, disk, network.
- `cadvisor` — per-container CPU and memory (built into kubelet).
- Your application's `/metrics` endpoint (expose Prometheus format).

Understanding Prometheus query syntax is essential for writing alerts and dashboards. Use the [PromQL Explainer](/promql-explainer) to translate complex queries into plain English. When building scrape configurations and relabelling rules, the [Prometheus Relabel Tester](/prometheus-relabel-tester) lets you test rules against live label sets without touching production.

### Events

Kubernetes Events are the first place to look when a Pod is not starting correctly:

```bash
kubectl get events -n production --sort-by='.lastTimestamp'
kubectl get events -n production --field-selector reason=OOMKilled
```

## kubectl Essentials

| Command | What It Does |
|---|---|
| `kubectl get pods -n <ns>` | List Pods in a namespace |
| `kubectl get pods -A` | List Pods in all namespaces |
| `kubectl describe pod <name> -n <ns>` | Full details, events, conditions |
| `kubectl logs <pod> -n <ns>` | Stdout/stderr from the main container |
| `kubectl logs <pod> -c <container>` | Logs from a specific container |
| `kubectl logs <pod> --previous` | Logs from the last crashed container instance |
| `kubectl exec -it <pod> -- bash` | Interactive shell in a running container |
| `kubectl exec <pod> -- <cmd>` | Run a one-off command |
| `kubectl apply -f <file>` | Declaratively create or update resources |
| `kubectl delete -f <file>` | Delete resources defined in a manifest |
| `kubectl delete pod <name>` | Force-delete a single Pod |
| `kubectl scale deployment <name> --replicas=N` | Scale a Deployment |
| `kubectl rollout status deployment/<name>` | Watch rollout progress |
| `kubectl rollout undo deployment/<name>` | Roll back to previous version |
| `kubectl rollout history deployment/<name>` | View revision history |
| `kubectl set image deployment/<name> <c>=<img>` | Update a container image |
| `kubectl port-forward svc/<name> 8080:80` | Forward a local port to a Service |
| `kubectl port-forward pod/<name> 8080:8080` | Forward a local port to a Pod |
| `kubectl top pods -n <ns>` | Current CPU/memory usage (requires metrics-server) |
| `kubectl top nodes` | Node CPU/memory usage |
| `kubectl get events -n <ns> --sort-by=.lastTimestamp` | Recent cluster events |
| `kubectl explain deployment.spec.strategy` | Inline API documentation |
| `kubectl diff -f <file>` | Preview what `apply` would change |
| `kubectl get all -n <ns>` | All common resources in a namespace |
| `kubectl label pod <name> key=value` | Add or update a label |
| `kubectl annotate pod <name> key=value` | Add or update an annotation |
| `kubectl config get-contexts` | List available kubeconfig contexts |
| `kubectl config use-context <context>` | Switch cluster context |

> **Tip:** Install `kubectl` plugins via `krew` (the kubectl plugin manager). Useful plugins include `kubectl-neat` (clean up `get -o yaml` output), `kubectl-ctx` and `kubectl-ns` (fast context/namespace switching), and `kubectl-tree` (visualise owner references).

## Troubleshooting

### CrashLoopBackOff

A container keeps crashing and Kubernetes keeps restarting it with exponential backoff.

**Diagnose:**

```bash
# See the current state and restart count
kubectl get pod <name> -n <ns>

# Check events for the Pod
kubectl describe pod <name> -n <ns>

# Check logs from the current or previous instance
kubectl logs <name> -n <ns>
kubectl logs <name> -n <ns> --previous
```

**Common causes:** application throws an unhandled exception at startup; missing environment variable or config file; entrypoint command is wrong; dependency (database, cache) not reachable.

### ImagePullBackOff / ErrImagePull

The container image cannot be pulled.

**Diagnose:**

```bash
kubectl describe pod <name> -n <ns>
# Look for events like: Failed to pull image ... unauthorized
```

**Common causes:** image name or tag is wrong; registry is private and no `imagePullSecret` is configured; credentials in the pull secret have expired; rate-limit on Docker Hub.

**Fix a missing imagePullSecret:**

```bash
kubectl create secret docker-registry regcred \
  --docker-server=registry.example.com \
  --docker-username=<user> \
  --docker-password=<token> \
  -n production
```

Then reference it in the Pod spec:

```yaml
spec:
  imagePullSecrets:
    - name: regcred
```

### Pending Pods

A Pod stays in `Pending` and never starts.

**Diagnose:**

```bash
kubectl describe pod <name> -n <ns>
# Look for events under "Events:" — scheduler messages explain why
```

**Common causes:**

- **Insufficient resources** — no node has enough CPU or memory to satisfy the requests. Check `kubectl top nodes` and `kubectl describe nodes`.
- **Taint/toleration mismatch** — the target nodes are tainted but the Pod has no matching toleration.
- **NodeSelector or affinity** — the Pod requires specific labels on the node that no current node has.
- **PVC not bound** — a `PersistentVolumeClaim` is still `Pending` (waiting for a PV).

### OOMKilled

A container was killed by the kernel OOM killer because it exceeded its memory limit.

**Diagnose:**

```bash
kubectl get pod <name> -n <ns>
# Look for: OOMKilled in the REASON column

kubectl describe pod <name> -n <ns>
# Look for: Last State: Terminated Reason: OOMKilled
```

**Fix:** Increase the memory limit (or request, to get a Guaranteed QoS). Profile the application's actual memory use under load. Use the [Kubernetes Resource Calculator](/kubernetes-resource-calculator) to size requests and limits based on observed usage.

### Debugging Toolkit

When `kubectl logs` is not enough:

```bash
# Open a shell in the running container
kubectl exec -it <pod> -n <ns> -- sh

# Run a temporary debug Pod on a specific node
kubectl debug node/<node-name> -it --image=ubuntu:22.04

# Attach an ephemeral debug container to a running Pod (K8s 1.23+)
kubectl debug -it <pod> -n <ns> \
  --image=busybox:1.36 \
  --target=<container-name>

# Copy a file from a Pod to local
kubectl cp <ns>/<pod>:/path/to/file ./local-file
```

## Common Kubernetes Interview Questions

**Q: What is the role of the etcd in a Kubernetes cluster?**
A: etcd is the cluster's source of truth — a distributed, consistent key-value store where all cluster state (objects, configs, secrets) is persisted. If etcd is lost without a backup, the cluster's configuration is lost. The API server is the only component that reads and writes etcd directly.

**Q: How does a Kubernetes Service discover which Pods to send traffic to?**
A: Services use label selectors to identify target Pods. The Endpoints controller (or EndpointSlice controller in newer clusters) watches for Pods matching the selector and maintains an Endpoints/EndpointSlice object. `kube-proxy` reads these to program iptables/IPVS forwarding rules.

**Q: What is the difference between a StatefulSet and a Deployment?**
A: A Deployment is for stateless workloads — Pods are interchangeable. A StatefulSet is for stateful applications (databases, queues): it gives each Pod a stable, ordered hostname (`pod-0`, `pod-1`), stable storage via PVCs that survive Pod rescheduling, and ordered, graceful start/stop.

**Q: What is a DaemonSet?**
A: A DaemonSet ensures that one copy of a Pod runs on every node (or a subset via nodeSelector/tolerations). Common uses: log collectors (Fluent Bit), monitoring agents (node-exporter), CNI plugins, security agents.

**Q: How does Kubernetes handle persistent storage?**
A: Via the PersistentVolume (PV) / PersistentVolumeClaim (PVC) abstraction. A PVC is a user's request for storage (size, access mode). Kubernetes binds it to a matching PV (a piece of actual storage — EBS volume, NFS share, etc.) either statically or dynamically via a StorageClass and a CSI driver.

**Q: What is a Kubernetes Namespace and when should you use multiple namespaces?**
A: A Namespace is a virtual cluster within a cluster. Use separate namespaces for teams, environments (dev/staging/production on the same cluster), or application boundaries. Apply ResourceQuotas and RBAC per namespace to enforce isolation.

**Q: What is a Taint and Toleration?**
A: Taints are set on nodes to repel Pods. `kubectl taint nodes node1 key=value:NoSchedule` prevents any Pod without a matching Toleration from being scheduled on that node. Used to dedicate nodes for specific workloads (GPU nodes, spot nodes).

**Q: What happens when you run `kubectl apply -f deployment.yaml`?**
A: kubectl sends the manifest to the API server, which validates it and merges it with the existing object (three-way merge using the `last-applied-configuration` annotation). If the Deployment's Pod template changed, the Deployment controller creates a new ReplicaSet and performs a rolling update.

**Q: What is the difference between `kubectl apply` and `kubectl create`?**
A: `create` is imperative — it fails if the object already exists. `apply` is declarative — it creates the object if missing or updates it if it exists, using a three-way merge. Prefer `apply` for GitOps and CI/CD pipelines.

**Q: What is a Kubernetes Job vs a CronJob?**
A: A Job creates one or more Pods and tracks their completion. It retries failed Pods until the desired completions count is reached, then the Job is marked complete. A CronJob schedules Jobs on a cron expression, creating a new Job object on each trigger.

## What's Next

Coming from containers? See [Docker for DevOps](/learn/guides/docker-for-devops).

Running on AWS (EKS)? See [AWS for DevOps Engineers](/learn/guides/aws-for-devops-engineers).

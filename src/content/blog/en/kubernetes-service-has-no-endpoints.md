---
title: "Kubernetes Service has no endpoints: find the selector bug"
description: "A Kubernetes Service has no endpoints, or a Deployment says selector does not match template labels? One bug, two symptoms, and how to trace both to a fix."
pubDate: 2026-10-12
draft: true
tags: ["kubernetes", "containers", "debugging"]
relatedTool:
  name: "Kubernetes Label Selector Tester"
  href: "/kubernetes-label-selector-tester"
---

![A Service selector compared against pod labels: matching pods flow into an EndpointSlice and on to traffic, while a mismatched label leaves the Service with no endpoints](/blog/kubernetes-service-has-no-endpoints-hero.svg)
<!-- keywords: primary: kubernetes service has no endpoints (<100, KD n/a) | secondaries: selector does not match template labels, kubernetes service no endpoints, endpoints none kubernetes, kubectl get pods label selector | source: ahrefs free (2026-09-26) -->
<!-- insight: not-Ready pods stay in the EndpointSlice with ready:false (only IP-less/terminal pods drop out); a zero-match Service still gets a placeholder slice showing <unset>, so the IP's location, not the slice's existence, tells selector bug from readiness | serp-checked: 2026-09-26 -->

The pods are Running. The Service exists. Every request to it hangs or is refused, and nothing in any log says why. You describe the Service and find the one line that matters:

```text
Endpoints:                <none>
```

On current kubectl that line may be blank rather than `<none>`; it is the same problem. Your Kubernetes Service has no endpoints, and no component reports that as an error. The loud version of the same bug appears when you apply the Deployment instead:

```text
The Deployment "checkout" is invalid: spec.template.metadata.labels: Invalid value: {"app":"check-out"}: `selector` does not match template `labels`
```

Two errors, one bug: a selector that matches nothing.

> **TL;DR**
>
> - A Service selects pods by their labels. If no pod label set satisfies every key in `spec.selector`, the Service has no endpoints and nothing complains.
> - Trace it in order: the Service's selector, then `kubectl get pods -l <selector>`, then `kubectl get endpointslices -l kubernetes.io/service-name=<svc>`, then each endpoint's `ready` condition.
> - No pod IP anywhere means the selector matches nothing (or the pods have no IP yet). An IP in the slice with `ready: false` means readiness, not labels.
> - A Deployment's selector is immutable in `apps/v1`. Changing it means delete and recreate, with `--cascade=orphan` if the pods must keep running.

## What does it mean when a Kubernetes Service has no endpoints?

A Service does not know about Deployments. It holds a label map in `spec.selector`, and the EndpointSlice controller lists pods in the Service's own namespace whose labels contain every pair in that map. Those pods' IPs become the Service's endpoints.

![The Service's spec.selector is compared against each pod's labels in the same namespace; matching pods with an IP are written into an EndpointSlice, and each endpoint carries a ready condition that decides whether it receives traffic](/blog/kubernetes-service-has-no-endpoints-diagram.svg)

A Service selector is equality-only: [the labels documentation](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#service-and-replicationcontroller) says only equality-based requirements are supported, and every pair is ANDed. One extra key, one misspelled value or one wrong namespace and the match set is empty.

An empty match set is valid. The controller still writes a placeholder EndpointSlice with no ports and no endpoints, so "a slice exists" proves nothing. The silent symptom is the whole failure mode, which is why it takes so long to find. The [Services section of the Kubernetes guide](/learn/guides/kubernetes-for-devops/#services) covers the object itself if you need the background.

## How do you trace the selector to the pods?

Walk the chain one link at a time, starting with what the Service actually asks for, not what you think it asks for:

```bash
kubectl get service checkout -n shop -o jsonpath='{.spec.selector}'
kubectl get pods -n shop -l app=checkout,tier=backend
kubectl get pods -n shop --show-labels
```

The second command uses the Service's selector verbatim, joined with commas. If it returns no pods, the bug is in labels or namespace, and you can stop looking at networking. The third shows the labels the pods really carry, so you can compare them key by key.

To check both manifests before anything reaches a cluster, paste the Service into the Selector box of the [Kubernetes Label Selector Tester](/kubernetes-label-selector-tester/) (selector YAML mode) and the Deployment into `resources.yaml`.

The tester lists the Deployment and its pod template as separate rows and names the clause that fails: on the pod template row it marks `tier=frontend` with ✗ and the reason `label tier="backend" ≠ "frontend"`. One honest limit: it shows each row's namespace but never compares it, so a Service in `default` will "match" a pod in `shop`.

> **Gotcha:** read the "Pod template" row, not the headline count. When the Service selector was copied from the Deployment's own `metadata.labels`, and those differ from the template labels, the tester reports "1 of 2 resources matches" because the Deployment row matches. The Pod template row fails, and that is the one a Service selects.

The last link is the EndpointSlice. It is the controller's actual output, so it settles arguments. Query it by the label the controller stamps on every slice, as the [debug-service task](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/#does-the-service-have-any-endpointslices) does:

```bash
kubectl get endpointslices -n shop -l kubernetes.io/service-name=checkout
```

For a Service that matches nothing you get one row, the placeholder, and its ENDPOINTS column prints `<unset>` rather than `<none>`. You will not see "No resources found".

`kubectl describe service` is less direct than it looks. Since kubectl v1.31 it reads EndpointSlices, and since v1.32 its `Endpoints:` line skips endpoints that are not ready. Older kubectl printed `<none>` for an empty Endpoints object; on newer kubectl the line may simply be blank.

Avoid `kubectl get endpoints` for this. On a v1.33 or newer API server it answers with a warning first, because the v1 Endpoints API is [deprecated in favour of EndpointSlice](https://kubernetes.io/blog/2025/04/24/endpoints-deprecation/):

```text
Warning: v1 Endpoints is deprecated in v1.33+; use discovery.k8s.io/v1 EndpointSlice
```

## Is the pod in the slice but not Ready?

This is where most checklists go wrong. A pod that has an IP but is not Ready does not leave the EndpointSlice. It stays listed with `conditions.ready: false`, and consumers such as kube-proxy do not route to it. The [conditions reference](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/#conditions) describes `ready`, `serving` and `terminating`.

Pods that are Pending with no IP yet, and pods that have Succeeded or Failed, are left out entirely. So the diagnosis splits on where the IP shows up:

| What you see | Where it points |
|---|---|
| No pod IP in the slice, no pods from `get pods -l` | Selector or namespace mismatch |
| No pod IP in the slice, pods Pending with no IP | Unscheduled, or the pod sandbox is not created yet |
| IP in the slice, missing from `describe svc` | Readiness: check `conditions.ready` |

Print each endpoint's address and ready condition directly:

```bash
kubectl get endpointslices -n shop -l kubernetes.io/service-name=checkout \
  -o jsonpath='{range .items[*].endpoints[*]}{.addresses[0]}{" ready="}{.conditions.ready}{"\n"}{end}'
```

If the IPs are there with `ready=false`, the labels are fine and your [readiness probe](/learn/guides/kubernetes-for-devops/#health-probes) is the thing to debug.

## Which selector mistakes cause it, and how do you fix each?

Check these in order. Each has a tell, a fix and a way to verify.

**1. Label typo or drift.** Tell: `get pods -l` returns nothing, but `--show-labels` shows a near miss, such as `app=Checkout` against `app=checkout`. Values are case-sensitive. Fix: correct whichever side is wrong, usually the one edited last. Verify: `get pods -l` lists the pods.

**2. Selector copied from the Deployment's `metadata.labels`.** Tell: the Service selector matches the Deployment object's labels, not the pod template's. Fix: copy from `spec.template.metadata.labels`. Verify: the tester's Pod template row passes.

**3. Wrong namespace.** Tell: the pods exist, just not in `metadata.namespace` of the Service. The controller only lists pods in the Service's own namespace. Fix: move one of them. Verify: `get pods -n <service-namespace> -l ...` returns them.

**4. Pods not Ready, or no IP yet.** Tell: IPs appear with `ready=false`, or pods are Pending. Fix: the probe or the scheduling problem, not the selector. Verify: `ready=true` in the slice.

**5. An extra selector key.** Tell: every key matches except one, such as `tier: frontend` against pods labelled `tier: backend`. Fix: drop the key or add the label to the template. Verify: `get pods -l` with the full selector lists the pods.

> **In practice:** the [debug-service task](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/) names exactly this bug as a common mistake: a Service selecting `app=hostnames` while the Deployment, as older `kubectl run` versions created it, specifies `run=hostnames`.

## Why does the Deployment reject its own selector?

The loud error is the same mismatch caught one level earlier. A Deployment's `spec.selector` must match its `spec.template.metadata.labels`, and the API server enforces it in validation, so `kubectl apply` fails no matter which client you use. In `apps/v1` the selector does not default from the template, so leaving it out is not an escape: `spec.selector` is required.

The bad value prints differently by API server version. From v1.34 it renders as JSON, as in the hook. Older servers print Go syntax:

```text
The Deployment "checkout" is invalid: spec.template.metadata.labels: Invalid value: map[string]string{"app":"check-out"}: `selector` does not match template `labels`
```

Two neighbours are separate errors. An empty selector gives `empty selector is invalid for deployment`, and a missing one is reported as required on `spec.selector`. StatefulSets and DaemonSets emit the same "does not match" string. The fix is always to make the template labels a superset of the selector; the guide's [Deployments section](/learn/guides/kubernetes-for-devops/#replicasets-and-deployments) shows the matching pair.

## Can you change a Deployment's selector after creation?

No. In `apps/v1` the selector is immutable, and an update that changes it fails with `field is immutable`. On a v1.34+ server it reads:

```text
The Deployment "checkout" is invalid: spec.selector: Invalid value: {"matchLabels":{"app":"checkout","tier":"backend"}}: field is immutable
```

The [Deployment documentation](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#label-selector-updates) is explicit that `kubectl patch`, `kubectl edit`, `kubectl apply` and `helm upgrade` all hit this. The path is delete and recreate. Deleting a Deployment deletes its pods by default, which is downtime, so orphan them instead:

```bash
kubectl delete deployment checkout -n shop --cascade=orphan
kubectl apply -f deployment.yaml
kubectl get replicasets -n shop
```

The orphaned ReplicaSet keeps its pods serving while the new Deployment rolls out. Once the new pods are Ready and in the slice, delete any ReplicaSet no Deployment owns.

> **Tip:** change the Service selector last. If you add a key to it before the new pods carry that label, the Service matches nothing and its endpoints empty at once.

## Does fixing targetPort bring the endpoints back?

This is the fix that isn't a fix. A wrong numeric `targetPort` never empties the endpoint list: the controller copies the number and lists the pod anyway. Traffic then fails at the port, which looks similar from outside but is a different bug. Changing it will not make an empty slice fill.

A named `targetPort` that the pod does not declare is subtler. The EndpointSlice still lists the pod address, but the port is dropped, so the PORTS column reads `<unset>`. The legacy Endpoints controller goes further and omits the pod from that subset, so anything still reading Endpoints shows the pod as missing.

Restarting pods or recreating the Service changes neither case. If you meant a named port, check that the container declares a port with exactly that name, as the debug-service checklist asks. Otherwise leave `targetPort` alone and go back to labels.

## What should you check when a Kubernetes Service has no endpoints?

A short routine that covers every cause above, and the loud error too:

1. Print the Service's `spec.selector` with `-o jsonpath`, and note its namespace.
2. Run `kubectl get pods -n <namespace> -l <selector>`. Empty means labels or namespace.
3. Compare against `kubectl get pods --show-labels`, key by key, case included.
4. Confirm the selector was copied from `spec.template.metadata.labels`, not the Deployment's own labels.
5. Query `kubectl get endpointslices -l kubernetes.io/service-name=<svc>`. `<unset>` endpoints is the placeholder, not a result.
6. If IPs are present, read `conditions.ready`; `false` sends you to the readiness probe.
7. If a Deployment will not apply, match its selector to its template labels. If the selector itself must change, delete with `--cascade=orphan` and recreate.
8. Leave `targetPort` for last, and only suspect it when the port, not the endpoint, is missing.

For memory rather than selector trouble, the sibling post on [OOMKilled and exit code 137](/blog/kubernetes-oomkilled-exit-code-137/) follows the same confirm-then-fix routine.

Paste your Service and Deployment into the [Kubernetes Label Selector Tester](/kubernetes-label-selector-tester/) before the next apply, and read the Pod template row.

Which label has drifted in your cluster: a renamed `app`, or a `tier` nobody remembers adding?

/**
 * The five example chips. Each one is a real debugging session, not a syntax
 * demo — in chip order:
 *
 *   1. the label typo that makes a Service quietly miss two pods (BOOT SEED);
 *   2. a set-based `-l` string where an ABSENT key is what makes a pod match;
 *   3. a NetworkPolicy `podSelector` with `matchExpressions`;
 *   4. a real manifest paste — a Deployment, its pod template and a stray pod,
 *      selected by a Service's `spec.selector`;
 *   5. the empty selector, which matches everything.
 *
 * They are deliberately COMPACT: every chip has to round-trip through the
 * ~2000-character `#s=` fragment, and `engine.test.ts` fails the build if one
 * does not. Labels use YAML flow maps for the same reason.
 */
import type { SelectorExample } from './types';

export const examples: SelectorExample[] = [
  {
    id: 'label-typo',
    label: 'Service misses 2 pods',
    mode: 'expr',
    resources: `apiVersion: v1
kind: Pod
metadata:
  name: web-a
  labels: { app: web, tier: frontend }
---
apiVersion: v1
kind: Pod
metadata:
  name: web-b
  labels: { app: web, tier: frontend }
---
apiVersion: v1
kind: Pod
metadata:
  name: web-c
  labels: { app: web, tier: frontend }
---
apiVersion: v1
kind: Pod
metadata:
  name: web-d
  labels: { app: web, tier: frontnd }
---
apiVersion: v1
kind: Pod
metadata:
  name: api-a
  labels: { app: api, tier: backend }
`,
    selector: 'app=web,tier=frontend',
  },
  {
    id: 'absent-key-notin',
    label: 'notin matches a missing label',
    mode: 'expr',
    resources: `apiVersion: v1
kind: Pod
metadata:
  name: prod-pod
  labels: { app: web, env: prod }
---
apiVersion: v1
kind: Pod
metadata:
  name: dev-pod
  labels: { app: web, env: dev }
---
apiVersion: v1
kind: Pod
metadata:
  name: legacy-pod
  labels: { app: web }
`,
    selector: 'app=web,env notin (dev,staging)',
  },
  {
    id: 'networkpolicy',
    label: 'NetworkPolicy matchExpressions',
    mode: 'yaml',
    resources: `kind: Pod
metadata:
  name: api-1
  labels: { role: api }
---
kind: Pod
metadata:
  name: worker-1
  labels: { role: worker, quarantine: "true" }
---
kind: Pod
metadata:
  name: db-1
  labels: { role: db }
`,
    selector: `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-app-tier
spec:
  podSelector:
    matchExpressions:
      - key: role
        operator: In
        values: [api, worker]
      - key: quarantine
        operator: DoesNotExist
`,
  },
  {
    id: 'manifest-paste',
    label: 'Deployment + Service paste',
    mode: 'yaml',
    resources: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app.kubernetes.io/name: web }
spec:
  selector:
    matchLabels: { app: web }
  template:
    metadata:
      labels: { app: web, tier: frontend }
---
apiVersion: v1
kind: Pod
metadata:
  name: legacy-web
  labels: { app: web }
`,
    selector: `apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector: { app: web, tier: frontend }
`,
  },
  {
    id: 'empty-selector',
    label: 'Empty selector {}',
    mode: 'yaml',
    resources: `kind: Pod
metadata:
  name: labelled
  labels: { app: web }
---
kind: Pod
metadata:
  name: other
  labels: { app: api }
---
kind: Pod
metadata:
  name: no-labels-at-all
`,
    selector: '{}\n',
  },
];

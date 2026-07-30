/**
 * JSON ↔ YAML Converter — bundled examples.
 *
 * Six chips, ordered so the first one is the job most visitors arrive to do
 * (a Kubernetes manifest into JSON for `kubectl patch`), and the rest walk
 * through the traps the tool exists to expose: the YAML 1.1 boolean set,
 * anchors and merge keys, the reverse direction, multi-document streams, and a
 * kitchen sink of type surprises.
 *
 * Each example carries the direction it is meant to be read in, so tapping a
 * chip sets both the editor content and the direction — an anchors example in
 * the JSON → YAML direction would just be a parse error.
 */
import type { ConverterExample } from './types';

export const examples: ConverterExample[] = [
  {
    id: 'k8s-deployment',
    label: 'K8s Deployment → JSON',
    direction: 'yaml-to-json',
    input: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
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
          image: nginx:1.27-alpine
          ports:
            - containerPort: 80
          resources:
            limits:
              memory: 256Mi
              cpu: 500m
`,
  },
  {
    id: 'norway-problem',
    label: 'Norway problem',
    direction: 'yaml-to-json',
    input: `# In YAML 1.2 every value below is a string.
# In YAML 1.1 (PyYAML, older Kubernetes tooling) half of them are booleans.
country: NO
debug: no
sslVerify: off
featureFlag: on
shorthand: y
port: "8080"
`,
  },
  {
    id: 'anchors-merge-keys',
    label: 'Anchors + merge keys',
    direction: 'yaml-to-json',
    input: `# &defaults is reused by both jobs through the merge key <<:
defaults: &defaults
  image: node:22-alpine
  retries: 2
  timeout: 300
jobs:
  build:
    <<: *defaults
    script: npm run build
  test:
    <<: *defaults
    retries: 3
    script: npm test
`,
  },
  {
    id: 'package-json',
    label: 'package.json → YAML',
    direction: 'json-to-yaml',
    input: `{
  "name": "opscanopy-worker",
  "version": "1.4.0",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p .",
    "test": "vitest run",
    "start": "node dist/index.js"
  },
  "dependencies": { "js-yaml": "^4.2.0" }
}
`,
  },
  {
    id: 'multi-document',
    label: 'Multi-doc stream',
    direction: 'yaml-to-json',
    input: `apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config
data:
  LOG_LEVEL: debug
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  ports:
    - port: 80
      targetPort: 8080
`,
  },
  {
    id: 'tricky-types',
    label: 'Tricky types',
    direction: 'yaml-to-json',
    input: `released: 2024-01-15
mask: 0o644
legacy: 0777
hex: 0x1F
id: 9007199254740993
ratio: .inf
missing: ~
alsoMissing:
literal: "tab\\there"
`,
  },
];

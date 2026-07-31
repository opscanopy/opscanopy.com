/**
 * jq Playground — the six example chips.
 *
 * Ordered so the first one is the job most visitors arrive to do (pull one field
 * out of `kubectl get … -o json`), then the four filters an SRE actually writes
 * next, then the one that needs a flag to make sense (`@csv` with `-r`).
 *
 * Two constraints these examples deliberately satisfy:
 *
 *   1. **Example 1's input is a top-level OBJECT.** The playground boot-seeds
 *      example 1, and the calm-error contract depends on a half-typed program
 *      not erroring: `.f` against an object is `null`, but against an ARRAY it
 *      is a runtime error, which would flash red while somebody types `.foo`.
 *      `engine.test.ts` pins this.
 *   2. **Every example carries its own flags.** `@csv` prints a JSON-quoted
 *      string without `-r`, so tapping that chip has to set the flag too, the
 *      same way the JSON↔YAML chips set their direction.
 *
 * The data is invented but shaped exactly like the real API responses
 * (`kubectl get pods -o json`, the GitHub repos endpoint), because the point of
 * an example is that the program you learn here works on the real thing.
 */
import type { JqExample, JqFlags } from './types';

/**
 * Written out rather than imported from `engine.ts` on purpose: this module is
 * also read at BUILD time by the playground's frontmatter (for the chip labels),
 * and keeping it free of the engine import keeps that graph to one tiny file.
 */
const OFF: JqFlags = { rawOutput: false, slurp: false, nullInput: false, compact: false };

const PODS = `{
  "apiVersion": "v1",
  "kind": "List",
  "items": [
    {
      "metadata": { "name": "web-7d9f8c-2xk4t", "namespace": "prod" },
      "spec": { "containers": [ { "name": "web", "image": "nginx:1.27-alpine" } ] },
      "status": { "phase": "Running", "restartCount": 0 }
    },
    {
      "metadata": { "name": "web-7d9f8c-9pl2m", "namespace": "prod" },
      "spec": { "containers": [ { "name": "web", "image": "nginx:1.27-alpine" } ] },
      "status": { "phase": "Running", "restartCount": 2 }
    },
    {
      "metadata": { "name": "api-5b4c7d-qq8rn", "namespace": "prod" },
      "spec": { "containers": [
        { "name": "api", "image": "ghcr.io/acme/api:2.4.1" },
        { "name": "envoy", "image": "envoyproxy/envoy:v1.31.0" }
      ] },
      "status": { "phase": "CrashLoopBackOff", "restartCount": 14 }
    },
    {
      "metadata": { "name": "batch-1a2b3c-zzz01", "namespace": "jobs" },
      "spec": { "containers": [ { "name": "batch", "image": "ghcr.io/acme/batch:1.0.9" } ] },
      "status": { "phase": "Succeeded", "restartCount": 0 }
    }
  ]
}`;

const REQUESTS = `{
  "requests": [
    { "path": "/api/v1/orders", "status": 200, "ms": 41 },
    { "path": "/api/v1/orders", "status": 200, "ms": 38 },
    { "path": "/api/v1/orders", "status": 500, "ms": 1204 },
    { "path": "/healthz", "status": 200, "ms": 2 },
    { "path": "/api/v1/users", "status": 404, "ms": 11 },
    { "path": "/api/v1/users", "status": 500, "ms": 998 },
    { "path": "/api/v1/users", "status": 500, "ms": 1512 }
  ]
}`;

export const examples: JqExample[] = [
  {
    id: 'pluck-field',
    label: 'Pluck a field',
    program: '.items[] | .metadata.name',
    input: PODS,
    flags: { ...OFF },
  },
  {
    id: 'select-running',
    label: 'select() Running pods',
    program: '.items[]\n  | select(.status.phase == "Running")\n  | .metadata.name',
    input: PODS,
    flags: { ...OFF },
  },
  {
    id: 'group-count',
    label: 'group_by + count',
    program:
      '[.requests[].status]\n  | group_by(.)\n  | map({ status: .[0], count: length })\n  | sort_by(-.count)',
    input: REQUESTS,
    flags: { ...OFF, compact: true },
  },
  {
    id: 'unique-images',
    label: 'Pods → unique images',
    program: '[.items[].spec.containers[].image] | unique',
    input: PODS,
    flags: { ...OFF, compact: true },
  },
  {
    id: 'github-repos',
    label: 'GitHub API → names',
    program: '.[]\n  | { name: .full_name, stars: .stargazers_count, lang: .language }',
    input: `[
  {
    "id": 4103311,
    "full_name": "jqlang/jq",
    "language": "C",
    "stargazers_count": 31500,
    "archived": false
  },
  {
    "id": 22071710,
    "full_name": "stedolan/jq",
    "language": "C",
    "stargazers_count": 200,
    "archived": true
  },
  {
    "id": 90210001,
    "full_name": "acme/opscanopy",
    "language": "TypeScript",
    "stargazers_count": 12,
    "archived": false
  }
]`,
    flags: { ...OFF, compact: true },
  },
  {
    id: 'csv-report',
    label: '@csv report (needs -r)',
    program: '.deployments[]\n  | [ .name, .replicas, .image ]\n  | @csv',
    input: `{
  "deployments": [
    { "name": "web", "replicas": 3, "image": "nginx:1.27-alpine" },
    { "name": "api", "replicas": 2, "image": "ghcr.io/acme/api:2.4.1" },
    { "name": "worker", "replicas": 1, "image": "ghcr.io/acme/worker:0.9.3" }
  ]
}`,
    flags: { ...OFF, rawOutput: true },
  },
];

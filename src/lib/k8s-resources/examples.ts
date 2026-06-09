/**
 * Kubernetes Resource Calculator — bundled examples for the picker. Each spans a
 * useful case: a typical web pod (modest request, headroom in the limit), a
 * memory-heavy pod (a few cores and gigabytes of RAM), and a misconfigured pod
 * whose limit sits below its request to surface a warning.
 */
import type { K8sExample } from './types';

export const examples: K8sExample[] = [
  {
    id: 'web-pod',
    label: 'Typical web pod — 500m / 1 core, 256Mi / 512Mi × 3',
    input: {
      cpuRequest: '500m',
      cpuLimit: '1',
      memRequest: '256Mi',
      memLimit: '512Mi',
      replicas: '3',
    },
  },
  {
    id: 'memory-heavy',
    label: 'Memory-heavy pod — 2 / 4 cores, 4Gi / 8Gi × 2',
    input: {
      cpuRequest: '2',
      cpuLimit: '4',
      memRequest: '4Gi',
      memLimit: '8Gi',
      replicas: '2',
    },
  },
  {
    id: 'limit-below-request',
    label: 'Misconfigured pod — limit below request (warning)',
    input: {
      cpuRequest: '1',
      cpuLimit: '500m',
      memRequest: '1Gi',
      memLimit: '512Mi',
      replicas: '1',
    },
  },
];

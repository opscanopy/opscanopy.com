/**
 * Kubernetes Resource Calculator — shared types. `calculate()` turns a Pod's
 * CPU / memory requests & limits plus a replica count into a readable per-pod
 * and total-across-replicas breakdown. Pure + browser-safe; never throws on
 * user input — bad input yields { valid:false, error } naming the bad field.
 */

/** One rendered line in the breakdown. `mono` hints a monospace value. */
export interface K8sRow {
  label: string;
  value: string;
  mono?: boolean;
}

/** The result of a resource calculation. */
export interface K8sResult {
  valid: boolean;
  /** Present only when valid is false; names the offending field. */
  error?: string;
  /** Per-pod rows followed by totals across replicas. */
  rows: K8sRow[];
  /** Advisory notes (limit below request, no limit set, …). Never fatal. */
  warnings: string[];
}

/** The fields a caller may supply; every one is optional, at least one required. */
export interface K8sInput {
  cpuRequest?: string;
  cpuLimit?: string;
  memRequest?: string;
  memLimit?: string;
  replicas?: string;
}

/** A runnable example for the picker. */
export interface K8sExample {
  id: string;
  label: string;
  input: Required<Pick<K8sInput, 'cpuRequest' | 'cpuLimit' | 'memRequest' | 'memLimit' | 'replicas'>>;
}

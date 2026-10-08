/**
 * jq Playground — runs jq in a Web Worker with a kill timeout.
 *
 * jq-wasm is synchronous, so on the main thread a filter that never
 * terminates (`repeat(.)`, `def f: f; f`, `[range(infinite)]` before it
 * aborts) froze the tab until reload. Here every run goes to `worker.ts`; if
 * it has not answered within `JQ_RUN_TIMEOUT_MS` the worker is terminated, the
 * run resolves to a specific diagnostic, and the next run spawns a fresh one.
 *
 * Pure apart from `setTimeout`: the worker is injected through `spawn`, so the
 * timeout logic is tested in node with a fake (`runner.test.ts`). The timer
 * starts only once jq has loaded, so a slow `.wasm` download is never
 * mistaken for a filter that does not terminate.
 */
import { JQ_RUN_TIMEOUT_MS, buildFlags } from './engine';
import type { JqErr, JqRunOptions, JqRunResult } from './types';

/** The slice of `Worker` the runner uses. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

/** Worker → page messages (see `worker.ts`). */
export type WorkerReply =
  | { type: 'ready'; version: string }
  | { type: 'load-error'; message: string }
  | { type: 'result'; id: number; result: JqRunResult };

function engineError(message: string, options: JqRunOptions, version: string, elapsedMs: number): JqErr {
  return {
    ok: false,
    errorKind: 'engine',
    error: message,
    errorScope: null,
    partialOutputs: [],
    partialTruncated: false,
    totalPartialOutputs: 0,
    elapsedMs,
    flags: buildFlags(options),
    version,
    exitCode: 0,
    stderr: '',
    notices: [],
    noticesTruncated: false,
    totalNotices: 0,
  };
}

export function createJqRunner(spawn: () => WorkerLike, wasmURL: string, timeoutMs = JQ_RUN_TIMEOUT_MS) {
  let worker: WorkerLike | null = null;
  let ready: Promise<string> | null = null;
  let pending: { id: number; finish: (result: JqRunResult) => void } | null = null;
  let nextId = 0;

  function kill(): void {
    worker?.terminate();
    worker = null;
    ready = null;
  }

  /** Spawn the worker and load jq in it, once. Resolves to jq's version. */
  function load(): Promise<string> {
    if (ready) return ready;
    const w = spawn();
    worker = w;
    const loading = new Promise<string>((resolve, reject) => {
      w.onmessage = ({ data }) => {
        const msg = data as WorkerReply;
        if (msg.type === 'ready') resolve(msg.version);
        else if (msg.type === 'load-error') {
          if (worker === w) kill();
          reject(new Error(msg.message));
        } else if (msg.type === 'result' && pending?.id === msg.id) pending.finish(msg.result);
      };
      // The worker script itself failed (blocked, 404) or threw outside runJq.
      w.onerror = (event) => {
        event.preventDefault();
        // A worker already replaced must not kill its successor or fail its run.
        if (worker !== w) return;
        const message = event.message || 'the jq worker failed';
        kill();
        reject(new Error(message));
        pending?.finish(engineError(`jq hit an unexpected problem with this run: ${message}.`, {}, '', 0));
      };
      w.postMessage({ type: 'load', wasmURL });
    });
    ready = loading;
    return loading;
  }

  /** Run one program. Resolves — never rejects. A newer call supersedes an older one. */
  async function run(program: string, input: string, options: JqRunOptions = {}): Promise<JqRunResult> {
    const id = ++nextId;
    if (pending) {
      // Still running (possibly for ever): its answer is stale anyway.
      pending.finish(engineError('Superseded by a newer run.', options, '', 0));
      kill();
    }
    let version: string;
    try {
      version = await load();
    } catch (err) {
      return engineError(
        'jq could not be loaded in this browser: ' + (err instanceof Error ? err.message : 'unknown error') + '.',
        options,
        '',
        0,
      );
    }
    if (id !== nextId) return engineError('Superseded by a newer run.', options, version, 0);
    const w = worker!;
    return new Promise<JqRunResult>((resolve) => {
      const timer = setTimeout(() => {
        pending = null;
        kill();
        resolve(
          engineError(
            `Filter did not finish within ${timeoutMs / 1000}s — it may not terminate. The run was ` +
              `stopped; wrap an unbounded generator in limit(n; …) or first(…).`,
            options,
            version,
            timeoutMs,
          ),
        );
      }, timeoutMs);
      pending = {
        id,
        finish: (result) => {
          clearTimeout(timer);
          pending = null;
          resolve(result);
        },
      };
      w.postMessage({ type: 'run', id, program, input, options });
    });
  }

  return { load, run };
}

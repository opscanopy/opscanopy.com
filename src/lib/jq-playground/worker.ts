/**
 * jq Playground — the module Web Worker that owns the jq WebAssembly module,
 * so a filter that never terminates blocks this thread, not the tab.
 * `runner.ts` is the only client. The `.wasm` URL arrives in the `load`
 * message: it is Vite's hashed `jq-wasm/jq.wasm?url` asset, same-origin.
 */
import { configureJq, getJq, runJq } from './engine';
import type { WorkerReply } from './runner';
import type { JqRunOptions } from './types';

type Request =
  | { type: 'load'; wasmURL: string }
  | { type: 'run'; id: number; program: string; input: string; options: JqRunOptions };

const scope = self as unknown as {
  onmessage: ((event: { data: Request }) => void) | null;
  postMessage(message: WorkerReply): void;
};

scope.onmessage = async ({ data }) => {
  if (data.type === 'load') {
    configureJq({ wasmURL: data.wasmURL || undefined });
    try {
      scope.postMessage({ type: 'ready', version: (await getJq()).version });
    } catch (err) {
      scope.postMessage({ type: 'load-error', message: err instanceof Error ? err.message : 'unknown error' });
    }
  } else if (data.type === 'run') {
    // runJq never rejects; an Emscripten abort comes back as an engine error.
    scope.postMessage({ type: 'result', id: data.id, result: await runJq(data.program, data.input, data.options) });
  }
};

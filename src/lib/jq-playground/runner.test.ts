/**
 * jq Playground — the worker runner. The Worker itself cannot run in vitest's
 * node environment, so these tests drive the runner with a fake worker that
 * behaves like `worker.ts`: it answers `load` with `ready`, and answers `run`
 * only when the test says so. A filter that never terminates is exactly a run
 * that is never answered.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JQ_RUN_TIMEOUT_MS } from './engine';
import { createJqRunner, type WorkerLike } from './runner';
import type { JqErr, JqOk, JqRunResult } from './types';

interface FakeWorker extends WorkerLike {
  posted: Array<Record<string, unknown>>;
  terminated: boolean;
  reply(data: unknown): void;
}

function fakeSpawn(opts: { loadError?: string } = {}) {
  const spawned: FakeWorker[] = [];
  const spawn = (): WorkerLike => {
    const w: FakeWorker = {
      posted: [],
      terminated: false,
      onmessage: null,
      onerror: null,
      postMessage(msg) {
        const m = msg as Record<string, unknown>;
        w.posted.push(m);
        if (m.type === 'load') {
          queueMicrotask(() =>
            w.reply(opts.loadError ? { type: 'load-error', message: opts.loadError } : { type: 'ready', version: 'jq-1.8.2' }),
          );
        }
      },
      terminate() {
        w.terminated = true;
      },
      reply(data) {
        if (!w.terminated) w.onmessage?.({ data } as MessageEvent);
      },
    };
    spawned.push(w);
    return w;
  };
  return { spawn, spawned };
}

const okResult = { ok: true, outputs: ['1'] } as unknown as JqOk;

describe('createJqRunner', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('passes the wasm URL to the worker and reports jq’s version', async () => {
    const { spawn, spawned } = fakeSpawn();
    const runner = createJqRunner(spawn, '/_astro/jq.abc.wasm');
    await expect(runner.load()).resolves.toBe('jq-1.8.2');
    expect(spawned[0].posted[0]).toEqual({ type: 'load', wasmURL: '/_astro/jq.abc.wasm' });
  });

  it('returns the worker’s result for a run that finishes', async () => {
    const { spawn, spawned } = fakeSpawn();
    const runner = createJqRunner(spawn, '');
    const pending = runner.run('.', '1', {});
    await vi.advanceTimersByTimeAsync(0);
    const run = spawned[0].posted.find((m) => m.type === 'run')!;
    expect(run).toMatchObject({ program: '.', input: '1' });
    spawned[0].reply({ type: 'result', id: run.id, result: okResult });
    await expect(pending).resolves.toBe(okResult);
    expect(spawned[0].terminated).toBe(false);
  });

  it('terminates a non-terminating filter (repeat(.)) after the timeout and respawns', async () => {
    const { spawn, spawned } = fakeSpawn();
    const runner = createJqRunner(spawn, '');
    let settled: JqRunResult | null = null;
    void runner.run('repeat(.)', '{}', { compact: true }).then((r) => (settled = r));
    await vi.advanceTimersByTimeAsync(JQ_RUN_TIMEOUT_MS - 1);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    const err = settled as unknown as JqErr;
    expect(err.ok).toBe(false);
    expect(err.errorKind).toBe('engine');
    expect(err.error).toContain(
      `Filter did not finish within ${JQ_RUN_TIMEOUT_MS / 1000}s — it may not terminate`,
    );
    expect(err.version).toBe('jq-1.8.2');
    expect(err.flags).toEqual(['-c']);
    expect(spawned[0].terminated).toBe(true);

    // The next run gets a fresh worker, loaded again.
    const next = runner.run('.', '1', {});
    await vi.advanceTimersByTimeAsync(0);
    expect(spawned).toHaveLength(2);
    const run = spawned[1].posted.find((m) => m.type === 'run')!;
    spawned[1].reply({ type: 'result', id: run.id, result: okResult });
    await expect(next).resolves.toBe(okResult);
  });

  it('kills a run still in flight when a newer run starts', async () => {
    const { spawn, spawned } = fakeSpawn();
    const runner = createJqRunner(spawn, '');
    const first = runner.run('def f: f; f', 'null', {});
    await vi.advanceTimersByTimeAsync(0);
    const second = runner.run('.', '1', {});
    await expect(first).resolves.toMatchObject({ ok: false, errorKind: 'engine' });
    expect(spawned[0].terminated).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    const run = spawned[1].posted.find((m) => m.type === 'run')!;
    spawned[1].reply({ type: 'result', id: run.id, result: okResult });
    await expect(second).resolves.toBe(okResult);
  });

  it('turns a failed load into an engine error and retries on the next call', async () => {
    const { spawn, spawned } = fakeSpawn({ loadError: 'fetch failed' });
    const runner = createJqRunner(spawn, '');
    await expect(runner.load()).rejects.toThrow('fetch failed');
    const result = await runner.run('.', '1', {});
    expect(result).toMatchObject({ ok: false, errorKind: 'engine' });
    expect((result as JqErr).error).toContain('fetch failed');
    expect(spawned).toHaveLength(2);
  });

  it('ignores a late error from a worker it already replaced', async () => {
    const { spawn, spawned } = fakeSpawn();
    const runner = createJqRunner(spawn, '');
    void runner.run('repeat(.)', '{}', {});
    await vi.advanceTimersByTimeAsync(JQ_RUN_TIMEOUT_MS);
    let settled: JqRunResult | null = null;
    void runner.run('.', '1', {}).then((r) => (settled = r));
    await vi.advanceTimersByTimeAsync(0);
    spawned[0].onerror?.({ preventDefault() {}, message: 'late' } as ErrorEvent);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBeNull();
    expect(spawned[1].terminated).toBe(false);
    const run = spawned[1].posted.find((m) => m.type === 'run')!;
    spawned[1].reply({ type: 'result', id: run.id, result: okResult });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(okResult);
  });
});

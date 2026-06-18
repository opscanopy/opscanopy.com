/**
 * Docker Run ↔ Compose — shared types for the bidirectional converter engine.
 *
 * The converter runs ENTIRELY in the browser, with no network and no Node APIs.
 * Two pure functions translate between the two shapes developers reach for:
 *
 *   • `runToCompose(cmd)`  — a `docker run …` command line → a one-service
 *     `docker-compose.yml` snippet.
 *   • `composeToRun(yaml)` — a Compose service definition → an equivalent
 *     `docker run …` command line.
 *
 * Neither function ever throws. Failures are surfaced through `ok: false` plus a
 * human-readable `error`; lossy or ambiguous mappings are surfaced as `warnings`
 * (e.g. `--rm`/`-d` have no Compose equivalent, and `depends_on`/`build`/`deploy`
 * have no `docker run` equivalent).
 */

/** Result of converting a `docker run` command into Compose YAML. */
export interface RunToComposeResult {
  /** True when the command parsed into at least an image; false otherwise. */
  ok: boolean;
  /** Deterministic `services:` YAML — present only when `ok` is true. */
  yaml?: string;
  /** Non-fatal notes: flags that cannot be represented in Compose, etc. */
  warnings: string[];
  /** Present only when `ok` is false — a human-readable parse error. */
  error?: string;
}

/** Result of converting a Compose service into a `docker run` command. */
export interface ComposeToRunResult {
  /** True when a first service was found and reconstructed; false otherwise. */
  ok: boolean;
  /** The reconstructed `docker run …` line — present only when `ok` is true. */
  command?: string;
  /** Non-fatal notes: Compose-only keys with no `docker run` equivalent, etc. */
  warnings: string[];
  /** Present only when `ok` is false — a human-readable parse error. */
  error?: string;
}

/**
 * A loosely-typed Compose service object, as it comes out of the YAML parser.
 * Every value is `unknown` because user input is validated as the emitter reads
 * it — the engine never assumes a key has the "right" type.
 */
export type ComposeService = Record<string, unknown>;

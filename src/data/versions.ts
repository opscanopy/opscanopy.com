/**
 * Vendor versions quoted in page copy, derived from the place that pins them.
 *
 * The homepage's "how we know it's right" strip names the jq build. A number
 * typed into prose goes stale the moment the dependency moves and nothing
 * fails, so read it from package.json instead — the pin is exact
 * (`jq-wasm: "3.0.0-jq-1.8.2"`, see CLAUDE.md), and the jq version is the tail
 * of that string.
 *
 * Build-time only: this is imported from page frontmatter, never from a
 * playground `<script>`. The playground badge keeps reading `jq.version` off
 * the loaded binary, which is the real source at runtime.
 */
import pkg from '../../package.json';

function jqVersionFromPin(pin: string): string {
  // "3.0.0-jq-1.8.2" → "1.8.2"
  const m = /-jq-(\d+\.\d+(?:\.\d+)?)$/.exec(pin);
  if (!m) {
    throw new Error(
      `[versions] Could not read a jq version out of the jq-wasm pin "${pin}". ` +
        'Update src/data/versions.ts if the package changed its version scheme.',
    );
  }
  return m[1];
}

const pin = (pkg as { dependencies?: Record<string, string> }).dependencies?.['jq-wasm'];
if (!pin) {
  throw new Error('[versions] jq-wasm is not in package.json dependencies.');
}

/** The jq release the WASM build is, e.g. "1.8.2". */
export const JQ_VERSION = jqVersionFromPin(pin);

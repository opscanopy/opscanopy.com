/**
 * Wrapper around the git-derived per-tool "Updated" dates (see
 * scripts/gen-tool-meta.mjs, run as the npm `prebuild` step). The generated
 * JSON is gitignored and regenerated every build, so `import.meta.glob` (not
 * a plain static import) is used deliberately: on a fresh checkout or in
 * `astro dev` before `npm run build` has ever run, the glob matches nothing
 * and this falls back to `{}` instead of a hard import error.
 */
const modules = import.meta.glob<{ default: Record<string, string> }>('./tool-meta.generated.json', {
  eager: true,
});
const dates: Record<string, string> = Object.values(modules)[0]?.default ?? {};

/** The tool's last-updated date (YYYY-MM-DD, git-derived), or undefined if not yet generated. */
export function getToolUpdatedAt(slug: string): string | undefined {
  return dates[slug];
}

export { dates as toolUpdatedDates };

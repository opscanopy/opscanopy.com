// Pure core of the production-dependency audit gate (scripts/audit-gate.mjs).
//
// `npm audit --omit=dev --audit-level=high` is a deploy gate, and it goes red
// on its own schedule when an advisory publishes. Most of the time the fix is a
// floor bump (CLAUDE.md). When the vendor has published NO fixed version, the
// gate would block every deploy until upstream ships one; this core lets a
// named advisory through only while it is explicitly allowlisted, with a reason
// and an expiry, and keeps everything else strict:
//
//   - every high/critical advisory reachable from a production dependency fails
//     unless its id (GHSA-…) and package are on the allowlist;
//   - an allowlist entry past its `expires` date fails (forces a re-review);
//   - an allowlist entry that matches nothing fails (stale: the advisory was
//     fixed or withdrawn, so the exemption must be removed).
//
// No fs, no clock, no process: the CLI passes the audit JSON, the allowlist and
// today's date in.

const BLOCKING = new Set(['high', 'critical']);

/** GHSA id from an advisory URL, or null. */
export function advisoryId(url) {
  const m = /\/(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})\b/i.exec(url ?? '');
  return m ? m[1] : null;
}

/**
 * Every blocking advisory in an `npm audit --json` (v7+ shape). Transitive
 * entries (`via` strings naming another package) are covered by the advisory
 * objects on the package that actually carries them, so only objects count.
 * @returns {Array<{ id: string, package: string, severity: string, url: string, title: string }>}
 */
export function blockingAdvisories(audit) {
  const out = new Map();
  for (const [pkg, v] of Object.entries(audit?.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (typeof via !== 'object' || !BLOCKING.has(via.severity)) continue;
      const id = advisoryId(via.url) ?? `npm-${via.source}`;
      const key = `${id} ${via.name ?? pkg}`;
      if (!out.has(key)) out.set(key, { id, package: via.name ?? pkg, severity: via.severity, url: via.url ?? '', title: via.title ?? '' });
    }
  }
  return [...out.values()];
}

/**
 * @param {object} audit         parsed `npm audit --omit=dev --json`
 * @param {Array<{id:string, package:string, reason:string, expires:string}>} allowlist
 * @param {string} today         YYYY-MM-DD
 * @returns {{ ok: boolean, blocking: object[], allowed: object[], problems: string[] }}
 */
export function evaluate(audit, allowlist, today) {
  const problems = [];
  for (const e of allowlist) {
    if (!e.id || !e.package || !e.reason || !/^\d{4}-\d{2}-\d{2}$/.test(e.expires ?? '')) {
      problems.push(`allowlist entry is incomplete (needs id, package, reason, expires YYYY-MM-DD): ${JSON.stringify(e)}`);
    } else if (e.expires < today) {
      problems.push(`allowlist entry ${e.id} (${e.package}) expired on ${e.expires}: re-check upstream and bump the floor, or renew with a reason`);
    }
  }
  const advisories = blockingAdvisories(audit);
  const allowed = [];
  const blocking = [];
  for (const a of advisories) {
    const hit = allowlist.find((e) => e.id === a.id && e.package === a.package && e.expires >= today);
    (hit ? allowed : blocking).push(hit ? { ...a, reason: hit.reason, expires: hit.expires } : a);
  }
  for (const e of allowlist) {
    if (!advisories.some((a) => a.id === e.id && a.package === e.package)) {
      problems.push(`allowlist entry ${e.id} (${e.package}) matches no current advisory: remove it`);
    }
  }
  return { ok: blocking.length === 0 && problems.length === 0, blocking, allowed, problems };
}

/** Synthetic audit JSON for tests: { pkg: [ [ghsa, severity], … ] } plus transitive markers. */
export function fixtureAudit(map, transitive = {}) {
  const vulnerabilities = {};
  for (const [pkg, advs] of Object.entries(map)) {
    vulnerabilities[pkg] = {
      name: pkg,
      severity: advs[0]?.[1] ?? 'low',
      via: advs.map(([id, severity], i) => ({ source: 1000 + i, name: pkg, title: `t ${id}`, url: `https://github.com/advisories/${id}`, severity })),
    };
  }
  for (const [pkg, dep] of Object.entries(transitive)) {
    vulnerabilities[pkg] = { name: pkg, severity: 'high', via: [dep] };
  }
  return { vulnerabilities };
}

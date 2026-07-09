/**
 * mission-sim/filesystem — path resolution + node access over the in-memory
 * mission filesystem (a nested object rooted at '~').
 *
 * Paths are `~`-rooted strings like '~/logs/server.log'. `/`-rooted input is
 * treated as `~`-rooted (this training box has no world outside home).
 * Everything fails softly: null / false, never throws.
 */
import type { MissionFsNode } from './types';

/**
 * Resolve a user-supplied path argument against the current working directory.
 * Handles `~`, `/`-rooted, `.`, `..`, trailing and doubled slashes.
 * Returns the canonical '~'-rooted path. Never escapes above '~'.
 */
export function resolvePath(cwd: string, arg: string): string | null {
  if (typeof cwd !== 'string' || typeof arg !== 'string') return null;
  const a = arg.trim();

  // Base segments (below '~') for the starting point.
  let base: string[];
  if (a === '' ) {
    base = splitTilde(cwd);
    return join(base);
  } else if (a === '~' || a.startsWith('~/')) {
    base = [];
  } else if (a.startsWith('/')) {
    base = [];
  } else {
    base = splitTilde(cwd);
  }

  const rel = a === '~' ? '' : a.replace(/^~\//, '').replace(/^\/+/, '');
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { base.pop(); continue; }
    base.push(seg);
  }
  return join(base);
}

/** '~/a/b' → ['a','b']; '~' → []. Anything else is treated as best-effort. */
function splitTilde(path: string): string[] {
  const p = path.trim();
  if (p === '~' || p === '') return [];
  return p.replace(/^~\//, '').replace(/^\/+/, '').split('/').filter((s) => s !== '' && s !== '.');
}

function join(segs: string[]): string {
  return segs.length === 0 ? '~' : '~/' + segs.join('/');
}

/** Fetch the node (dir object or file string) at a canonical '~'-rooted path. Null if absent. */
export function getNode(fs: MissionFsNode, path: string): MissionFsNode | string | null {
  const root = fs['~'];
  if (root === undefined || typeof root === 'string') return null;
  let node: MissionFsNode | string = root;
  for (const seg of splitTilde(path)) {
    if (typeof node === 'string') return null; // tried to traverse through a file
    // hasOwnProperty (not `=== undefined`) so inherited Object.prototype keys
    // — constructor, toString, __proto__, valueOf — don't resolve as phantom
    // filesystem nodes (e.g. `cat ~/toString` must be No such file, not a dir).
    if (!Object.prototype.hasOwnProperty.call(node, seg)) return null;
    const next: MissionFsNode | string = node[seg];
    node = next;
  }
  return node;
}

/** Entry names of the directory at `path`, or null if missing / a file. */
export function listDir(fs: MissionFsNode, path: string): string[] | null {
  const node = getNode(fs, path);
  if (node === null || typeof node === 'string') return null;
  return Object.keys(node);
}

/** File contents at `path`, or null if missing / a directory. */
export function readFile(fs: MissionFsNode, path: string): string | null {
  const node = getNode(fs, path);
  return typeof node === 'string' ? node : null;
}

/**
 * Write (create or overwrite) the file at `path`. The parent directory must
 * already exist and the target must not be a directory. Mutates `fs` in place
 * (callers deep-clone per run). Returns success.
 */
export function writeFile(fs: MissionFsNode, path: string, contents: string): boolean {
  const segs = splitTilde(path);
  if (segs.length === 0) return false; // can't overwrite '~' itself
  const name = segs[segs.length - 1];
  const parentPath = join(segs.slice(0, -1));
  const parent = getNode(fs, parentPath);
  if (parent === null || typeof parent === 'string') return false;
  if (typeof parent[name] === 'object') return false; // target is a directory
  parent[name] = contents;
  return true;
}

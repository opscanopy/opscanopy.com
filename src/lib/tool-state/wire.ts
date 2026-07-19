/**
 * Shared client-side wiring for auto-restore-last-input + Save-snapshot,
 * so each of the ~25 tool playgrounds only needs a few lines of glue rather
 * than re-implementing localStorage read/write/eviction 25 times. Reuses
 * whatever the tool already reuses as its "share serializer" (a hash-state
 * key's built value, a JSON encodeState, or — for tools with none — the raw
 * input text) as the stored value.
 *
 * Each function here is DOM-touching (localStorage / Intl.DateTimeFormat on
 * the runtime locale) and therefore untested under this project's node-
 * environment vitest config, matching every other storage-writing wrapper
 * in this codebase (see hash-state.ts) — the pure logic it calls into
 * (last-input.ts, snapshots.ts) IS tested directly.
 */
import {
  LAST_INPUT_KEY,
  parseLastInputStore,
  serializeLastInputStore,
  recordLastInput,
  getLastInput,
} from './last-input';
import {
  SNAPSHOT_KEY,
  parseSnapshotStore,
  serializeSnapshotStore,
  addSnapshot,
  removeSnapshotAt,
  snapshotsForSlug,
  type Snapshot,
  type SnapshotStore,
} from './snapshots';

function readLastInputStore() {
  try {
    return parseLastInputStore(localStorage.getItem(LAST_INPUT_KEY));
  } catch {
    return parseLastInputStore(null);
  }
}

function writeLastInputStore(store: ReturnType<typeof parseLastInputStore>): void {
  try {
    localStorage.setItem(LAST_INPUT_KEY, serializeLastInputStore(store));
  } catch {
    /* storage blocked or quota exceeded — the tool just won't remember this one */
  }
}

/** Call once during init, BEFORE seeding from an example — the restored value, or null. */
export function getRestoredLastInput(slug: string): string | null {
  return getLastInput(readLastInputStore(), slug);
}

/** Call after every successful, user-initiated evaluation, for tools with autoRestore enabled. */
export function recordToolLastInput(slug: string, value: string): void {
  const store = readLastInputStore();
  const next = recordLastInput(store, slug, value, new Date().toISOString());
  if (next !== store) writeLastInputStore(next);
}

function readSnapshotStore(): SnapshotStore {
  try {
    return parseSnapshotStore(localStorage.getItem(SNAPSHOT_KEY));
  } catch {
    return parseSnapshotStore(null);
  }
}

/** Evict-oldest-retry-once on quota, across ALL tools' snapshots (one shared cap). */
function writeSnapshotStore(store: SnapshotStore): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, serializeSnapshotStore(store));
    return;
  } catch {
    /* fall through to the evict-and-retry path below */
  }
  if (store.snapshots.length === 0) return;
  const oldestIndex = store.snapshots.reduce(
    (oldest, s, i) => (s.at < store.snapshots[oldest].at ? i : oldest),
    0,
  );
  const trimmed = removeSnapshotAt(store, oldestIndex);
  try {
    localStorage.setItem(SNAPSHOT_KEY, serializeSnapshotStore(trimmed));
  } catch {
    /* give up silently — the save just doesn't persist this time */
  }
}

function formatSnapshotLabel(atIso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(atIso),
    );
  } catch {
    return atIso;
  }
}

export interface SnapshotUiOptions {
  slug: string;
  saveBtn: HTMLButtonElement;
  snapshotSelect: HTMLSelectElement;
  deleteBtn: HTMLButtonElement;
  /** The current serialized value to snapshot (reuse the tool's own share serializer). */
  getValue: () => string;
  /** Restore a snapshot's value into the tool's own input, then re-evaluate. */
  setValue: (value: string) => void;
  savedLabel?: string;
  placeholderLabel?: string;
  emptyLabel?: string;
}

/** Wire the Save-snapshot button + restore <select> + delete button for one tool instance. */
export function wireSnapshotUI(opts: SnapshotUiOptions): void {
  const {
    slug,
    saveBtn,
    snapshotSelect,
    deleteBtn,
    getValue,
    setValue,
    savedLabel = 'Saved',
    placeholderLabel = 'Load a snapshot…',
    emptyLabel = 'No snapshots yet',
  } = opts;

  function currentSnapshots(): Snapshot[] {
    return snapshotsForSlug(readSnapshotStore(), slug);
  }

  function renderOptions(): void {
    const snaps = currentSnapshots();
    snapshotSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = snaps.length > 0 ? placeholderLabel : emptyLabel;
    snapshotSelect.appendChild(placeholder);
    snaps.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = formatSnapshotLabel(s.at);
      snapshotSelect.appendChild(opt);
    });
    snapshotSelect.disabled = snaps.length === 0;
    deleteBtn.hidden = !snapshotSelect.value;
  }

  saveBtn.addEventListener('click', () => {
    const value = getValue();
    if (!value) return;
    const store = readSnapshotStore();
    const next = addSnapshot(store, slug, value, new Date().toISOString());
    if (next !== store) writeSnapshotStore(next);
    renderOptions();
    const original = saveBtn.textContent;
    const originalDisabled = saveBtn.disabled;
    saveBtn.textContent = savedLabel;
    saveBtn.disabled = true;
    setTimeout(() => {
      saveBtn.textContent = original;
      saveBtn.disabled = originalDisabled;
    }, 1500);
  });

  snapshotSelect.addEventListener('change', () => {
    deleteBtn.hidden = !snapshotSelect.value;
    const idx = Number(snapshotSelect.value);
    if (!Number.isInteger(idx)) return;
    const snap = currentSnapshots()[idx];
    if (snap) setValue(snap.value);
  });

  deleteBtn.addEventListener('click', () => {
    const idx = Number(snapshotSelect.value);
    if (!Number.isInteger(idx)) return;
    // Read the store ONCE and derive both the per-slug list and the global
    // index from that SAME instance — parseSnapshotStore() JSON.parses fresh
    // objects on every call, so comparing a snapshot read earlier against a
    // freshly re-read store's array via indexOf() would never match (always
    // a different object reference for identical content).
    const store = readSnapshotStore();
    const target = snapshotsForSlug(store, slug)[idx];
    if (!target) return;
    const globalIndex = store.snapshots.indexOf(target);
    if (globalIndex === -1) return;
    writeSnapshotStore(removeSnapshotAt(store, globalIndex));
    renderOptions();
  });

  renderOptions();
}

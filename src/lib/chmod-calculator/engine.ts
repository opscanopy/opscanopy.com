/**
 * chmod Calculator — pure, two-way bit math for Unix file permissions.
 *
 * Three entry points, all returning the SAME fully-populated ChmodResult and
 * NEVER throwing on user input (invalid input → { valid:false, error }):
 *   - parseOctal(input)    — "755" / "4755" → everything
 *   - parseSymbolic(input) — "rwxr-xr-x" / "-rwxr-xr-x" → everything
 *   - fromState(state)     — the checkbox matrix → everything
 *
 * Canonical octal (locked): the CONVENTIONAL form — 3 digits when the special
 * digit is 0 (`755`, `644`, `700`), 4 digits ONLY when a special bit is set
 * (`4755`, `2755`, `1777`). NEVER zero-padded to 4 (`0755` is wrong).
 *
 * Canonical command (locked): exactly `chmod <octal> <file>`, e.g.
 * `chmod 755 file` / `chmod 4755 file`. One format only.
 *
 * Special-bit ↔ symbolic mapping (SUS / GNU coreutils convention):
 *   - setuid shows in the USER execute slot: `s` (exec on) / `S` (exec off)
 *   - setgid shows in the GROUP execute slot: `s` / `S`
 *   - sticky shows in the OTHER execute slot: `t` / `T`
 *   lowercase = special bit set AND execute on; UPPERCASE = special bit set and
 *   execute OFF.
 */
import type { ChmodResult, ChmodState, Perm, Special } from './types';

/** The command's placeholder filename, part of the locked canonical form. */
const FILE_PLACEHOLDER = 'file';

function emptyPerm(): Perm {
  return { read: false, write: false, execute: false };
}

/** A permission triad → its 0–7 octal digit. */
function permToDigit(p: Perm): number {
  return (p.read ? 4 : 0) + (p.write ? 2 : 0) + (p.execute ? 1 : 0);
}

/** A 0–7 octal digit → a permission triad. */
function digitToPerm(d: number): Perm {
  return {
    read: (d & 4) !== 0,
    write: (d & 2) !== 0,
    execute: (d & 1) !== 0,
  };
}

/** The special bits → their 0–7 high octal digit. */
function specialToDigit(s: Special): number {
  return (s.setuid ? 4 : 0) + (s.setgid ? 2 : 0) + (s.sticky ? 1 : 0);
}

/** A 0–7 high octal digit → the special bits. */
function digitToSpecial(d: number): Special {
  return {
    setuid: (d & 4) !== 0,
    setgid: (d & 2) !== 0,
    sticky: (d & 1) !== 0,
  };
}

/**
 * Render one rwx triad as 3 symbolic chars. `slot` selects which special bit
 * (if any) rewrites the execute char: 'user' → setuid (s/S), 'group' → setgid
 * (s/S), 'other' → sticky (t/T).
 */
function permToSymbolic(p: Perm, special: Special, slot: 'user' | 'group' | 'other'): string {
  const r = p.read ? 'r' : '-';
  const w = p.write ? 'w' : '-';
  let x: string;
  const specialSet =
    (slot === 'user' && special.setuid) ||
    (slot === 'group' && special.setgid) ||
    (slot === 'other' && special.sticky);
  if (specialSet) {
    const letter = slot === 'other' ? 't' : 's';
    x = p.execute ? letter : letter.toUpperCase();
  } else {
    x = p.execute ? 'x' : '-';
  }
  return r + w + x;
}

/** The ls -l file type prefix (regular file). */
const LS_TYPE = '-';

/** Build a fully-populated ChmodResult from a validated state. */
export function fromState(state: ChmodState): ChmodResult {
  const specialDigit = specialToDigit(state.special);
  const userDigit = permToDigit(state.user);
  const groupDigit = permToDigit(state.group);
  const otherDigit = permToDigit(state.other);

  const base = `${userDigit}${groupDigit}${otherDigit}`;
  // Canonical octal: prepend the special digit only when it is non-zero.
  const octal = specialDigit === 0 ? base : `${specialDigit}${base}`;

  const symbolic =
    permToSymbolic(state.user, state.special, 'user') +
    permToSymbolic(state.group, state.special, 'group') +
    permToSymbolic(state.other, state.special, 'other');

  const lsStyle = LS_TYPE + symbolic;
  const command = `chmod ${octal} ${FILE_PLACEHOLDER}`;

  return { valid: true, state, octal, symbolic, lsStyle, command };
}

/**
 * Parse a 3- or 4-digit octal string ("755", "4755") into a full result.
 * Each digit must be 0–7; the optional high digit carries the special bits.
 */
export function parseOctal(input: string): ChmodResult {
  const trimmed = (input ?? '').trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Enter an octal mode like 755 or 4755.' };
  }
  if (!/^[0-7]{3,4}$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Octal mode must be 3 or 4 digits, each 0–7 (e.g. 755 or 4755).',
    };
  }

  const digits = trimmed.length === 3 ? `0${trimmed}` : trimmed;
  const special = digitToSpecial(Number(digits[0]));
  const user = digitToPerm(Number(digits[1]));
  const group = digitToPerm(Number(digits[2]));
  const other = digitToPerm(Number(digits[3]));

  return fromState({ special, user, group, other });
}

/**
 * Parse one 3-char symbolic triad (e.g. "rwx", "r-S", "rwt") into a Perm plus
 * the special flag it may carry. `slot` selects the allowed special letters.
 * Returns null on any invalid char/position.
 */
function parseTriad(
  triad: string,
  slot: 'user' | 'group' | 'other',
): { perm: Perm; special: boolean } | null {
  const r = triad[0];
  const w = triad[1];
  const x = triad[2];

  if (r !== 'r' && r !== '-') return null;
  if (w !== 'w' && w !== '-') return null;

  const specialLower = slot === 'other' ? 't' : 's';
  const specialUpper = slot === 'other' ? 'T' : 'S';

  let execute: boolean;
  let special = false;
  if (x === 'x') {
    execute = true;
  } else if (x === '-') {
    execute = false;
  } else if (x === specialLower) {
    execute = true;
    special = true;
  } else if (x === specialUpper) {
    execute = false;
    special = true;
  } else {
    return null;
  }

  return {
    perm: { read: r === 'r', write: w === 'w', execute },
    special,
  };
}

/**
 * Parse a symbolic mode string. Accepts a 9-char form ("rwxr-xr-x") or a
 * 10-char `ls -l` form with a leading type char ("-rwxr-xr-x", "drwx------")
 * which is stripped. Handles s/S (setuid/setgid) and t/T (sticky).
 */
export function parseSymbolic(input: string): ChmodResult {
  const trimmed = (input ?? '').trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Enter a symbolic mode like rwxr-xr-x.' };
  }

  let body = trimmed;
  if (body.length === 10) {
    // ls -l form: strip the leading file-type character.
    body = body.slice(1);
  }
  if (body.length !== 9) {
    return {
      valid: false,
      error: 'Symbolic mode must be 9 characters like rwxr-xr-x.',
    };
  }

  const userT = parseTriad(body.slice(0, 3), 'user');
  const groupT = parseTriad(body.slice(3, 6), 'group');
  const otherT = parseTriad(body.slice(6, 9), 'other');
  if (!userT || !groupT || !otherT) {
    return {
      valid: false,
      error:
        'Symbolic mode must use r, w, x, - (with s/S in the execute slots for setuid/setgid and t/T for the sticky bit).',
    };
  }

  const special: Special = {
    setuid: userT.special,
    setgid: groupT.special,
    sticky: otherT.special,
  };

  return fromState({
    special,
    user: userT.perm,
    group: groupT.perm,
    other: otherT.perm,
  });
}

/** Convenience: an all-off state (used by the playground on a full clear). */
export function emptyState(): ChmodState {
  return {
    special: { setuid: false, setgid: false, sticky: false },
    user: emptyPerm(),
    group: emptyPerm(),
    other: emptyPerm(),
  };
}

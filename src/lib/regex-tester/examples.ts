/**
 * Regex Log Tester — bundled, runnable examples for the playground.
 *
 * Each example's `pattern`/`flags` produces matches against its sample `text`
 * via `run(pattern, flags, text)` in `engine.ts`. They are log-oriented and
 * cover the features the tool showcases:
 *
 *   (a) nginx access log     — numbered capture groups (IP, method, path, status)
 *   (b) syslog level capture — a NAMED group `(?<level>INFO|WARN|ERROR)`
 *   (c) ISO-8601 timestamp   — global multi-line scan with `gm`
 *
 * Patterns are written as plain strings exactly as a user would type them into
 * the pattern field (no surrounding slashes); flags are supplied separately.
 */

export interface RegexExample {
  /** Stable id used by the playground selector. */
  id: string;
  /** Short human label for the example tab. */
  label: string;
  /** The regular-expression source, as typed (no surrounding slashes). */
  pattern: string;
  /** Flags, e.g. "gm". The engine adds `g` automatically if omitted. */
  flags: string;
  /** Sample log text the pattern is meant to run against. */
  text: string;
}

/* (a) Classic nginx "combined" access-log line. Numbered capture groups pull
   out the client IP, HTTP method, request path, and response status code. */
const nginxAccessLog: RegexExample = {
  id: 'nginx-access',
  label: 'nginx access log',
  pattern:
    '^(\\d+\\.\\d+\\.\\d+\\.\\d+) - - \\[[^\\]]+\\] "(\\w+) (\\S+) [^"]+" (\\d{3})',
  flags: 'gm',
  text: `192.168.1.24 - - [08/Jun/2026:10:15:42 +0000] "GET /api/health HTTP/1.1" 200 17 "-" "curl/8.4.0"
10.0.0.7 - - [08/Jun/2026:10:15:43 +0000] "POST /api/login HTTP/1.1" 401 92 "-" "Mozilla/5.0"
203.0.113.5 - - [08/Jun/2026:10:15:45 +0000] "GET /assets/app.css HTTP/1.1" 304 0 "-" "Mozilla/5.0"
198.51.100.22 - - [08/Jun/2026:10:15:51 +0000] "DELETE /api/items/42 HTTP/1.1" 500 128 "-" "axios/1.6.0"`,
};

/* (b) Application log lines with a severity token. The named group
   `(?<level>…)` captures the level so it shows up in the named-groups column.
   The trailing group grabs the message text. */
const levelCapture: RegexExample = {
  id: 'level-capture',
  label: 'Named level capture',
  pattern: '(?<level>INFO|WARN|ERROR)\\s+(?<message>.+)$',
  flags: 'gm',
  text: `2026-06-08T10:15:42Z INFO  starting worker pool size=8
2026-06-08T10:15:43Z WARN  queue depth high depth=4096
2026-06-08T10:15:44Z ERROR failed to flush batch err="connection reset"
2026-06-08T10:15:45Z INFO  recovered, resuming normal operation`,
};

/* (c) ISO-8601 / RFC3339 timestamps anywhere in the text. A global, multi-line
   scan finds the leading timestamp on each line. */
const isoTimestamp: RegexExample = {
  id: 'iso-timestamp',
  label: 'ISO-8601 timestamp',
  pattern: '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})',
  flags: 'gm',
  text: `2026-06-08T10:15:42Z request received
2026-06-08T10:15:42.518+00:00 db query took 12ms
2026-06-08T10:15:43Z response sent status=200
malformed line with no timestamp
2026-06-08T10:15:44.001Z cache miss key=user:42`,
};

export const examples: RegexExample[] = [
  nginxAccessLog,
  levelCapture,
  isoTimestamp,
];

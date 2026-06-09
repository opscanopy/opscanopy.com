/**
 * Timestamp Converter — bundled examples spanning every accepted input form:
 * a 10-digit epoch (seconds), a 13-digit epoch (milliseconds), an ISO 8601
 * date string, and the Unix epoch itself ("0").
 */
import type { TimeExample } from './types';

export const examples: TimeExample[] = [
  { id: 'epoch-seconds', label: '1516239022 — epoch seconds', input: '1516239022' },
  { id: 'epoch-millis', label: '1516239022000 — epoch milliseconds', input: '1516239022000' },
  { id: 'iso-8601', label: '2018-01-18T01:30:22Z — ISO 8601', input: '2018-01-18T01:30:22Z' },
  { id: 'epoch-zero', label: '0 — the Unix epoch', input: '0' },
];

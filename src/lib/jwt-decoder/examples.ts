/**
 * JWT Decoder — bundled examples for the picker. Each spans a useful case: the
 * canonical HS256 sample (verifies against "your-256-bit-secret"), a token whose
 * `exp` is in the past (renders an "expired" row), a token rich in registered
 * claims (iss/sub/aud/iat/nbf/exp/jti), and an unsecured `alg:"none"` token that
 * raises a security warning.
 */
import type { JwtExample } from './types';

export const examples: JwtExample[] = [
  {
    id: 'hs256',
    label: 'HS256 — the canonical sample token',
    token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  },
  {
    id: 'expired',
    label: 'Expired — exp is in the past',
    token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhbGljZSIsIm5hbWUiOiJBbGljZSBFeHBpcmVkIiwiaWF0IjoxNTQ2MzAwODAwLCJleHAiOjE1Nzc4MzY4MDB9.3V8Xb0aQk0Tn8wD0qP6yqLrT9z3l2k1m0n9o8p7q6r5',
  },
  {
    id: 'many-claims',
    label: 'Many claims — iss/sub/aud/iat/nbf/exp/jti',
    token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0yMDI2In0.eyJpc3MiOiJodHRwczovL2F1dGgub3BzY2Fub3B5LmRldiIsInN1YiI6InVzZXItNDIiLCJhdWQiOiJvcHNjYW5vcHktYXBpIiwiaWF0IjoxNzAwMDAwMDAwLCJuYmYiOjE3MDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwianRpIjoiYTFiMmMzZDQtZTVmNiJ9.sJ9mFqL2pXn4kQrT8vWb1cYz7dE0fG3hI6jK9lM2nO5',
  },
  {
    id: 'alg-none',
    label: 'alg "none" — unsecured token (warns)',
    token:
      'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhbm9uIiwiaWF0IjoxNzAwMDAwMDAwfQ.',
  },
];

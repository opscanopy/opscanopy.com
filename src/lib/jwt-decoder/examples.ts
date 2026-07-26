/**
 * JWT Decoder & Encoder — bundled examples for the one-click chip row. Each
 * spans a useful case: the canonical HS256 sample (its matching secret rides
 * along so verification lights up immediately), an RS256 token generated with
 * this tool's own engine (verifies with the bundled public JWK), an ES256
 * token from RFC 7515 §A.3, a token whose `exp` is in the past (demos the
 * "Expired" status pill), a token rich in registered claims, and an unsecured
 * `alg:"none"` token that raises a security warning. `chip` is the short
 * label on the chip; `label` is the full accessible name.
 */
import type { JwtExample } from './types';

export const examples: JwtExample[] = [
  {
    id: 'hs256',
    label: 'HS256 — the canonical sample token',
    chip: 'HS256',
    token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    key: 'your-256-bit-secret',
  },
  {
    id: 'rs256',
    label: 'RS256 — verifies with a public JWK',
    chip: 'RS256',
    token:
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.PLd1TCewtWTNjk764NNXFNvieqrsvYHJ5xqCBXf9FMERyGU6mpKIP4MNXYRtAZwrV7c34NiSekt1UrHV4p8JbGob4JEhnJfcEhdC60NvKCrZf1wYvkaVWEcZBCjSbnjmvsDcDlRJnSua2DsTXqTfMrp5bV8oWZiwYcQa4G-mpsJBtcjGvvmn-wqFImR8VcwBbZ-lM4DW7IlFNg-c5aKJJLBMcRodpJRKJjOQmonJyiu2ZZVVgA6TYa57OuOKXW8gV7ynoAh0ktrsaSMQQ7q3jF-6VDgXNLJAYVcphMPNrxoFfJ3qhlWWs-xGsZwOFKh4zrBPuxDc54QNd3ccLCws4Q',
    key: '{"kty":"RSA","n":"vWe9AkmEYQjk4uBHcwZO3OUAvHnuajQhtxPbojMVEAUxNE6LaHSQINmhYm_b0rRl6F8bFJ8WnBHLqww6AAP2Hq5Ln_sEnZu3Ru-VAGNPVST0IFx_2fQg3X7evy7XbwgObW2iH3amlYnDHT0KNFTXslZvvnWhodchKSsnrvNrSkQbo2XwOmmbXSGm-sPd6TF0MIg0-Y5LPfbQitQDLLQcZt0u_rnBycpRfBWJhYyOETzauxwb7DhLlR7K2sEG6MxQxnatUAlXCSwJYK1rxfx-rA7eOZo--XsGnpDAKLAs7xtNtXThr6N581ef1Nm0isfBh5Cwund_NXqCJ3lFHfAI9Q","e":"AQAB"}',
  },
  {
    id: 'es256',
    label: 'ES256 — verifies with a public JWK (RFC 7515)',
    chip: 'ES256 · JWK',
    token:
      'eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ.DtEhU3ljbEg8L38VWAfUAqOyKAM6-Xx-F4GawxaepmXFCgfTjDxw5djxLa8ISlSApmWQxfKTUJqPP3-Kg6NU1Q',
    key: '{"kty":"EC","crv":"P-256","x":"f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU","y":"x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0"}',
  },
  {
    id: 'expired',
    label: 'Expired — exp is in the past',
    chip: 'Expired',
    token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhbGljZSIsIm5hbWUiOiJBbGljZSBFeHBpcmVkIiwiaWF0IjoxNTQ2MzAwODAwLCJleHAiOjE1Nzc4MzY4MDB9.3V8Xb0aQk0Tn8wD0qP6yqLrT9z3l2k1m0n9o8p7q6r5',
  },
  {
    id: 'many-claims',
    label: 'Many claims — iss/sub/aud/iat/nbf/exp/jti',
    chip: 'Many claims',
    token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0yMDI2In0.eyJpc3MiOiJodHRwczovL2F1dGgub3BzY2Fub3B5LmRldiIsInN1YiI6InVzZXItNDIiLCJhdWQiOiJvcHNjYW5vcHktYXBpIiwiaWF0IjoxNzAwMDAwMDAwLCJuYmYiOjE3MDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMCwianRpIjoiYTFiMmMzZDQtZTVmNiJ9.sJ9mFqL2pXn4kQrT8vWb1cYz7dE0fG3hI6jK9lM2nO5',
  },
  {
    id: 'alg-none',
    label: 'alg "none" — unsecured token (warns)',
    chip: 'alg:none',
    token:
      'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhbm9uIiwiaWF0IjoxNzAwMDAwMDAwfQ.',
  },
];

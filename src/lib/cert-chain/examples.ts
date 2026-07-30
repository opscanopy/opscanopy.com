/**
 * examples.ts — the six example chips, in chip order.
 *
 * Chip 1 is also the boot seed, so it is the clean, everything-works case: a
 * correctly ordered three-certificate chain whose signatures all verify. The
 * other five are the five reasons somebody opens this tool at all.
 *
 * `hostname` is optional and deliberately absent from chip 1: the boot seed
 * should not pre-fill a field the visitor did not type into. Chip 2 carries one
 * so the hostname check is discoverable on the second tap, and it demonstrates
 * the wildcard rule (`www.shop.example.com` matches `*.shop.example.com`).
 *
 * Every PEM here is real DER from `fixtures.ts` — the demo chain is generated and
 * long-dated so a shipped example never rots into a red "expired" card, and the
 * expired and self-signed examples are genuine certificates from badssl.com.
 */
import {
  BADSSL_SELF_SIGNED_LEAF,
  DEMO_CHAIN,
  DEMO_CHAIN_MISSING_INTERMEDIATE,
  DEMO_CHAIN_ROOT_FIRST,
  EXPIRED_CHAIN,
  S_CLIENT_PASTE,
} from './fixtures';

export interface CertExample {
  id: string;
  /** Chip label — short enough to sit in a row of six on a phone. */
  label: string;
  input: string;
  /** Optional hostname to seed alongside the PEM. */
  hostname?: string;
}

export const examples: CertExample[] = [
  {
    id: 'full-chain',
    label: 'Full chain',
    input: DEMO_CHAIN,
  },
  {
    id: 'missing-intermediate',
    label: 'Missing intermediate',
    input: DEMO_CHAIN_MISSING_INTERMEDIATE,
    hostname: 'www.shop.example.com',
  },
  {
    id: 'wrong-order',
    label: 'Wrong order',
    input: DEMO_CHAIN_ROOT_FIRST,
  },
  {
    id: 'expired',
    label: 'Expired',
    input: EXPIRED_CHAIN,
  },
  {
    id: 'self-signed',
    label: 'Self-signed',
    input: BADSSL_SELF_SIGNED_LEAF,
    hostname: 'login.badssl.com',
  },
  {
    id: 's-client',
    label: 's_client paste',
    input: S_CLIENT_PASTE,
  },
];

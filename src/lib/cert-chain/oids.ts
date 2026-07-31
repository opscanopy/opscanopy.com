/**
 * oids.ts — the OID tables. Pure data plus three lookups, no parsing.
 *
 * Scope fence: only the OIDs this tool actually renders or reasons about. A
 * dump of every OID in existence would be tens of kilobytes of dead weight on a
 * page that ships its own parser to stay small — an unknown OID renders as its
 * dotted form, which is honest and still greppable.
 */

/**
 * Distinguished-name attribute short labels (RFC 4514 §3 plus the handful of
 * extras that real certificates use).
 */
export const DN_LABELS: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.4': 'SN',
  '2.5.4.5': 'serialNumber',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.9': 'STREET',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.12': 'title',
  '2.5.4.15': 'businessCategory',
  '2.5.4.17': 'postalCode',
  '2.5.4.20': 'telephoneNumber',
  '2.5.4.41': 'name',
  '2.5.4.42': 'givenName',
  '2.5.4.43': 'initials',
  '2.5.4.44': 'generationQualifier',
  '2.5.4.45': 'x500UniqueIdentifier',
  '2.5.4.46': 'dnQualifier',
  '2.5.4.65': 'pseudonym',
  '2.5.4.97': 'organizationIdentifier',
  '1.2.840.113549.1.9.1': 'emailAddress',
  '0.9.2342.19200300.100.1.25': 'DC',
  '0.9.2342.19200300.100.1.1': 'UID',
  // EV / QWAC attributes that show up in bank and government certificates.
  '1.3.6.1.4.1.311.60.2.1.1': 'jurisdictionL',
  '1.3.6.1.4.1.311.60.2.1.2': 'jurisdictionST',
  '1.3.6.1.4.1.311.60.2.1.3': 'jurisdictionC',
};

/** Extension OIDs → the short names RFC 5280 and OpenSSL both use. */
export const EXTENSION_NAMES: Record<string, string> = {
  '2.5.29.9': 'subjectDirectoryAttributes',
  '2.5.29.14': 'subjectKeyIdentifier',
  '2.5.29.15': 'keyUsage',
  '2.5.29.16': 'privateKeyUsagePeriod',
  '2.5.29.17': 'subjectAltName',
  '2.5.29.18': 'issuerAltName',
  '2.5.29.19': 'basicConstraints',
  '2.5.29.30': 'nameConstraints',
  '2.5.29.31': 'cRLDistributionPoints',
  '2.5.29.32': 'certificatePolicies',
  '2.5.29.33': 'policyMappings',
  '2.5.29.35': 'authorityKeyIdentifier',
  '2.5.29.36': 'policyConstraints',
  '2.5.29.37': 'extendedKeyUsage',
  '2.5.29.46': 'freshestCRL',
  '2.5.29.54': 'inhibitAnyPolicy',
  '1.3.6.1.5.5.7.1.1': 'authorityInfoAccess',
  '1.3.6.1.5.5.7.1.11': 'subjectInfoAccess',
  '1.3.6.1.5.5.7.1.24': 'tlsFeature',
  '1.3.6.1.5.5.7.48.1.5': 'ocspNoCheck',
  '1.3.6.1.4.1.11129.2.4.2': 'signedCertificateTimestampList',
  '1.3.6.1.4.1.11129.2.4.3': 'ctPrecertificatePoison',
};

/** extendedKeyUsage purpose OIDs → the labels OpenSSL prints. */
export const EKU_NAMES: Record<string, string> = {
  '1.3.6.1.5.5.7.3.1': 'TLS Web Server Authentication',
  '1.3.6.1.5.5.7.3.2': 'TLS Web Client Authentication',
  '1.3.6.1.5.5.7.3.3': 'Code Signing',
  '1.3.6.1.5.5.7.3.4': 'E-mail Protection',
  '1.3.6.1.5.5.7.3.5': 'IPSec End System',
  '1.3.6.1.5.5.7.3.6': 'IPSec Tunnel',
  '1.3.6.1.5.5.7.3.7': 'IPSec User',
  '1.3.6.1.5.5.7.3.8': 'Time Stamping',
  '1.3.6.1.5.5.7.3.9': 'OCSP Signing',
  '1.3.6.1.5.5.7.3.17': 'IPSec IKE',
  '1.3.6.1.4.1.311.10.3.3': 'Microsoft Server Gated Crypto',
  '1.3.6.1.4.1.311.20.2.2': 'Microsoft Smartcard Login',
  '2.16.840.1.113730.4.1': 'Netscape Server Gated Crypto',
  '2.5.29.37.0': 'Any Extended Key Usage',
};

/**
 * keyUsage bit positions, in encoding order (RFC 5280 §4.2.1.3). The order is
 * the wire order, so a rendered list always reads the way OpenSSL prints it.
 */
export const KEY_USAGE_BITS = [
  'digitalSignature',
  'nonRepudiation',
  'keyEncipherment',
  'dataEncipherment',
  'keyAgreement',
  'keyCertSign',
  'cRLSign',
  'encipherOnly',
  'decipherOnly',
] as const;

/** Reader-facing labels for the keyUsage identifiers above. */
export const KEY_USAGE_LABELS: Record<string, string> = {
  digitalSignature: 'Digital Signature',
  nonRepudiation: 'Non Repudiation',
  keyEncipherment: 'Key Encipherment',
  dataEncipherment: 'Data Encipherment',
  keyAgreement: 'Key Agreement',
  keyCertSign: 'Certificate Sign',
  cRLSign: 'CRL Sign',
  encipherOnly: 'Encipher Only',
  decipherOnly: 'Decipher Only',
};

/** Public-key algorithm OIDs. */
export const PUBLIC_KEY_OIDS: Record<string, string> = {
  '1.2.840.113549.1.1.1': 'rsaEncryption',
  '1.2.840.113549.1.1.10': 'rsassaPss',
  '1.2.840.10045.2.1': 'id-ecPublicKey',
  '1.2.840.10040.4.1': 'id-dsa',
  '1.2.840.113549.1.3.1': 'dhKeyAgreement',
  '1.3.101.110': 'X25519',
  '1.3.101.111': 'X448',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',
};

/** Named-curve OIDs → Web Crypto curve names (only the three it supports). */
export const CURVE_OIDS: Record<string, { name: string; bits: number; webCrypto: boolean }> = {
  '1.2.840.10045.3.1.7': { name: 'P-256', bits: 256, webCrypto: true },
  '1.3.132.0.34': { name: 'P-384', bits: 384, webCrypto: true },
  '1.3.132.0.35': { name: 'P-521', bits: 521, webCrypto: true },
  '1.3.132.0.10': { name: 'secp256k1', bits: 256, webCrypto: false },
  '1.2.840.10045.3.1.1': { name: 'P-192', bits: 192, webCrypto: false },
  '1.3.132.0.33': { name: 'P-224', bits: 224, webCrypto: false },
  '1.3.36.3.3.2.8.1.1.7': { name: 'brainpoolP256r1', bits: 256, webCrypto: false },
  '1.3.36.3.3.2.8.1.1.11': { name: 'brainpoolP384r1', bits: 384, webCrypto: false },
  '1.3.36.3.3.2.8.1.1.13': { name: 'brainpoolP512r1', bits: 512, webCrypto: false },
};

/** Signature algorithm OIDs → the classic OpenSSL spelling. */
export const SIGNATURE_OIDS: Record<string, string> = {
  '1.2.840.113549.1.1.2': 'md2WithRSAEncryption',
  '1.2.840.113549.1.1.4': 'md5WithRSAEncryption',
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
  '1.2.840.113549.1.1.10': 'rsassaPss',
  '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
  '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.113549.1.1.14': 'sha224WithRSAEncryption',
  '1.2.840.10045.4.1': 'ecdsa-with-SHA1',
  '1.2.840.10045.4.3.1': 'ecdsa-with-SHA224',
  '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
  '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
  '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
  '1.2.840.10040.4.3': 'dsa-with-SHA1',
  '2.16.840.1.101.3.4.3.1': 'dsa-with-SHA224',
  '2.16.840.1.101.3.4.3.2': 'dsa-with-SHA256',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',
  '1.2.643.7.1.1.3.2': 'GOST R 34.10-2012 with 256-bit key',
  '1.2.643.7.1.1.3.3': 'GOST R 34.10-2012 with 512-bit key',
};

/** `2.5.4.3` → `CN`; unknown OIDs come back as their dotted form. */
export function dnLabel(oid: string): string {
  return DN_LABELS[oid] ?? oid;
}

/** `2.5.29.17` → `subjectAltName`; unknown OIDs come back as their dotted form. */
export function extensionName(oid: string): string {
  return EXTENSION_NAMES[oid] ?? oid;
}

/** `1.3.6.1.5.5.7.3.1` → `TLS Web Server Authentication`, else the dotted form. */
export function ekuName(oid: string): string {
  return EKU_NAMES[oid] ?? oid;
}

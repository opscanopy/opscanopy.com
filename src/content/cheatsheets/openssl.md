---
title: OpenSSL cheat sheet
seoTitle: OpenSSL Cheat Sheet — keys, CSRs, certs, s_client, PKCS#12
description: OpenSSL 3 commands for keys, CSRs, self-signed certificates, checking a live TLS endpoint, format conversion and hashing, each one run before publishing.
command: openssl
verifiedWith: OpenSSL 3.6.3
pubDate: 2026-10-09
updatedDate: 2026-10-09
order: 2
relatedTools:
  - certificate-decoder
  - hash-generator
sources:
  - title: openssl-req(1)
    url: https://docs.openssl.org/3.6/man1/openssl-req/
  - title: openssl-x509(1)
    url: https://docs.openssl.org/3.6/man1/openssl-x509/
  - title: openssl-s_client(1)
    url: https://docs.openssl.org/3.6/man1/openssl-s_client/
  - title: openssl-genpkey(1)
    url: https://docs.openssl.org/3.6/man1/openssl-genpkey/
  - title: openssl-pkcs12(1)
    url: https://docs.openssl.org/3.6/man1/openssl-pkcs12/
  - title: openssl-enc(1)
    url: https://docs.openssl.org/3.6/man1/openssl-enc/
faqs:
  - q: Should I use -nodes or -noenc?
    a: Use -noenc. Both write the private key without a passphrase, but -nodes has been deprecated since OpenSSL 3.0. It still works, so old scripts keep running, but new ones should use -noenc.
  - q: How do I check when a server's certificate expires?
    a: "Pipe s_client into x509: openssl s_client -connect example.com:443 </dev/null 2>/dev/null | openssl x509 -noout -enddate. For a script, use -checkend with a number of seconds instead: it exits non-zero if the certificate expires within that window."
  - q: Why does openssl behave differently on my Mac?
    a: macOS ships LibreSSL as /usr/bin/openssl, which accepts a different set of options from OpenSSL 3. Run openssl version; if it says LibreSSL, install OpenSSL (for example with Homebrew) and call that binary by its full path.
---

The OpenSSL commands most people need are `openssl req` to make a CSR or a self-signed certificate, `openssl x509 -noout -text` to read a certificate, `openssl s_client -connect host:443` to see what a server actually sends, `openssl pkcs12` to package a key and certificate together, and `openssl dgst` to hash or sign a file. Everything below is OpenSSL 3 syntax. Every command on this page was run against the version stamped above before it was published.

Start by checking which binary you have: `openssl version -a`. If it says LibreSSL, some options here will not exist.

## Generate keys

| Command | What it does |
|---|---|
| `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out key.pem` | An ECDSA P-256 private key, the usual choice for a new TLS certificate. |
| `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out rsa.pem` | A 3072-bit RSA key, for systems that still expect RSA. |
| `openssl genpkey -algorithm ED25519 -out ed.pem` | An Ed25519 key, for signing. |
| `openssl pkey -in key.pem -pubout -out pub.pem` | Extract the public key. |
| `openssl pkey -in key.pem -noout -text` | Show the key's type, size and parameters. |
| `openssl pkey -in key.pem -aes256 -out key-enc.pem` | Write a passphrase-protected copy (it prompts for the passphrase). |
| `openssl pkey -in key-enc.pem -out key-plain.pem` | Remove the passphrase. Keep the result readable by its owner only. |

The OpenSSL docs recommend `genpkey` over the older per-algorithm commands such as `genrsa`; it takes the same shape for every key type.

## Certificate signing requests

| Command | What it does |
|---|---|
| `openssl req -new -key key.pem -out req.csr -subj '/CN=example.com' -addext 'subjectAltName=DNS:example.com,DNS:www.example.com'` | A CSR for an existing key, with the names browsers actually check in the SAN extension. |
| `openssl req -new -newkey rsa:3072 -noenc -keyout new.key -out new.csr -subj '/CN=example.com'` | A new unencrypted key and its CSR in one step. |
| `openssl req -in req.csr -noout -text -verify` | Read a CSR back and check its self-signature. |

## Self-signed certificates

One command makes a key and a certificate valid for a year, with a SAN for `localhost` and `127.0.0.1`:

```bash
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc \
  -keyout key.pem -out cert.pem -days 365 \
  -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
```

Modern TLS clients match the host name against the `subjectAltName` entries, not the CN, so that line is the part that matters. A self-signed certificate is only trusted where you add it to the trust store yourself; use it for development and internal tests, not for a public site.

## Read a certificate

| Command | What it does |
|---|---|
| `openssl x509 -in cert.pem -noout -text` | Everything: subject, issuer, validity, key, extensions. |
| `openssl x509 -in cert.pem -noout -subject -issuer -dates` | Just who it is for, who signed it, and when it is valid. |
| `openssl x509 -in cert.pem -noout -enddate` | Only the expiry date. |
| `openssl x509 -in cert.pem -noout -ext subjectAltName` | Only the host names and IPs it covers. |
| `openssl x509 -in cert.pem -noout -fingerprint -sha256` | SHA-256 fingerprint, for pinning or comparing. |
| `openssl x509 -in cert.pem -noout -serial` | Serial number, which is what revocation lists refer to. |
| `openssl x509 -in cert.pem -noout -checkend 2592000` | Exit status 0 if it is still valid 30 days (2,592,000 seconds) from now, non-zero if not. |

To check that a key and a certificate belong together, compare their public keys. No output from `diff` means they match:

```bash
diff <(openssl x509 -in cert.pem -noout -pubkey) <(openssl pkey -in key.pem -pubout)
```

Prefer a browser view? The [Certificate Decoder](/certificate-decoder/) reads a PEM chain, checks the order and verifies each signature without uploading anything.

## Test a live TLS endpoint

| Command | What it does |
|---|---|
| `openssl s_client -connect example.com:443 </dev/null` | Handshake and print the certificate, chain and session. `</dev/null` makes it exit instead of waiting for input. |
| `openssl s_client -connect example.com:443 -brief </dev/null` | Only the protocol, cipher and verification result. |
| `openssl s_client -connect example.com:443 -showcerts </dev/null` | Every certificate the server sent, in the order it sent them. |
| `openssl s_client -connect 203.0.113.10:443 -servername example.com </dev/null` | Connect by IP but ask for a specific host's certificate (SNI). |
| `openssl s_client -connect example.com:443 -tls1_3 </dev/null` | Only offer TLS 1.3, to test whether the server supports it. |
| `openssl s_client -connect example.com:443 -alpn h2 </dev/null` | Offer HTTP/2 through ALPN and show what the server picked. |
| `openssl s_client -connect example.com:443 -verify_return_error </dev/null` | Close the connection when verification fails instead of carrying on. |
| `openssl s_client -connect mail.example.com:587 -starttls smtp </dev/null` | Upgrade a plain SMTP session with STARTTLS, then show the certificate. Also works with `imap`, `pop3`, `ftp` and others. |

Expiry of a live certificate, in one line:

```bash
openssl s_client -connect example.com:443 </dev/null 2>/dev/null | openssl x509 -noout -enddate
```

## Verify a chain

| Command | What it does |
|---|---|
| `openssl verify -CAfile root.pem -untrusted intermediate.pem cert.pem` | Check that `cert.pem` chains to `root.pem` through the intermediate. |
| `openssl verify -show_chain -CAfile root.pem -untrusted intermediate.pem cert.pem` | Same, and print the chain that was built. |

## Convert between formats

| Command | What it does |
|---|---|
| `openssl x509 -in cert.pem -outform DER -out cert.der` | PEM (Base64 text) to DER (binary). |
| `openssl x509 -inform DER -in cert.der -out cert.pem` | DER back to PEM. |
| `openssl pkcs12 -export -inkey key.pem -in cert.pem -certfile chain.pem -out bundle.p12` | Key, certificate and chain in one password-protected `.p12`/`.pfx` file. |
| `openssl pkcs12 -export -legacy -inkey key.pem -in cert.pem -out legacy.p12` | The same in legacy mode, for older software that cannot read the default AES-256-CBC encryption. |
| `openssl pkcs12 -in bundle.p12 -noenc -out all.pem` | Unpack a `.p12` to PEM with the key unencrypted. |
| `openssl pkcs12 -in bundle.p12 -nokeys -clcerts -out cert.pem` | Only the leaf certificate. |

## Hash, sign and encrypt files

| Command | What it does |
|---|---|
| `openssl dgst -sha256 file.tar.gz` | SHA-256 digest of a file. Add `-r` for `sha256sum`-style output. |
| `openssl dgst -sha256 -hmac 'secret' payload.json` | HMAC-SHA256 with a shared key, as webhook signatures use. |
| `openssl dgst -sha256 -sign rsa.pem -out sig.bin file.tar.gz` | Sign a file with a private key. |
| `openssl dgst -sha256 -verify pub.pem -signature sig.bin file.tar.gz` | Check that signature with the public key; prints `Verified OK`. |
| `openssl rand -hex 32` | 32 random bytes as hex, for a token or secret. |
| `openssl rand -base64 32` | The same as Base64. |
| `openssl enc -aes-256-cbc -pbkdf2 -salt -in notes.txt -out notes.enc` | Encrypt a file with a passphrase. |
| `openssl enc -d -aes-256-cbc -pbkdf2 -in notes.enc -out notes.txt` | Decrypt it; the options must match. |
| `openssl base64 -in file.bin -out file.b64` | Base64-encode; add `-d` to decode. |
| `openssl passwd -6` | A SHA-512 crypt hash for `/etc/shadow` or cloud-init; it prompts for the password. |

To hash a quick string without a terminal, the [Hash Generator](/hash-generator/) computes MD5, SHA-1, SHA-256, SHA-512 and HMAC in the browser.

## Gotchas

> **Gotcha:** `-nodes` ("no DES") is deprecated since OpenSSL 3.0. Use `-noenc`. Both leave the private key unencrypted, so protect the file with permissions.

> **Gotcha:** `-showcerts` prints what the server sent, not a verified chain. A missing intermediate shows up as a short list here and as a verification error in the summary.

> **Gotcha:** SNI is sent automatically when `-connect` names a host. Connect by IP address and you get the server's default certificate unless you add `-servername`.

> **Gotcha:** `-out` overwrites an existing file without asking. Writing a new key over the only copy of a key in use breaks the certificate that belongs to it.

> **Gotcha:** `openssl enc` cannot do authenticated modes such as GCM, and it never will. For anything beyond a quick passphrase-protected file, use `openssl cms` or a dedicated tool like age.

Go deeper: the [Networking for DevOps guide](/learn/guides/networking-for-devops/) covers how TLS fits into DNS, ports and load balancers. Moving keys around in containers? See the [Docker cheat sheet](/cheatsheets/docker/).

---
title: "x509: certificate signed by unknown authority — why it works in your browser but not in Go, curl or Docker"
description: "The full error, what it actually means, and the four causes ranked by how often they bite. Includes the one-line openssl check that tells you whether an intermediate is missing."
pubDate: 2026-08-29
tags: ["tls","certificates","docker","go","security"]
relatedTool:
  name: "Certificate Decoder & Chain Checker"
  href: "/certificate-decoder"
---

![A TLS chain with the intermediate certificate missing: leaf and root present, the link between them broken, so verification cannot reach a trusted anchor.](/blog/x509-certificate-signed-by-unknown-authority-hero.svg)

You deploy a service, it calls an HTTPS endpoint, and the request dies:

```
x509: certificate signed by unknown authority
```

Then you open the same URL in Chrome and it loads with a padlock. Nothing is wrong with the certificate as far as your browser is concerned, so the natural conclusion is that your code, your container or your language is broken.

It usually isn't. In the large majority of cases the server really is misconfigured, and your browser is hiding it. This post explains what the error actually means, why browsers disagree with Go and curl, and the four causes ranked by how often they turn out to be the culprit.

## What the error actually means

TLS verification is a walk. Your client takes the certificate the server presented (the **leaf**) and tries to build a path from it up to a certificate it already trusts (a **root**, shipped in the system trust store). Each step is proved by a signature: the leaf is signed by an intermediate, the intermediate by the root.

`certificate signed by unknown authority` means that walk ran out of road. The client found a certificate whose issuer it could not produce, so it never reached a trusted anchor.

The wording is misleading. It rarely means the authority is genuinely unknown — DigiCert and Let's Encrypt are in every trust store on earth. It almost always means **a link in the middle is missing**, so the client never got far enough to recognise the authority it does trust.

That distinction is the whole debugging strategy: don't start by suspecting the root. Start by counting the links.

## Why your browser disagrees

This is the part that misleads people, and it is worth understanding precisely, because it explains the entire "works in Chrome, fails in Docker" class of report.

A correctly configured server sends the leaf **and every intermediate** needed to chain up to a root. It does not send the root — the client already has that.

When the server forgets the intermediate, clients diverge:

- **Browsers paper over it.** They cache intermediates they have seen before, and they follow the *Authority Information Access* (AIA) extension in the leaf, which contains a URL for the issuing certificate. Chrome will quietly fetch the missing intermediate over HTTP and complete the chain. You see a padlock.
- **Go does not.** `crypto/x509` performs no AIA fetching, by design — a verification step that makes its own outbound HTTP request is an availability and privacy problem. If the intermediate is not presented, verification fails.
- **curl and OpenSSL generally do not either**, so they fail the same way.

Because Docker, Kubernetes, Terraform, most CI runners and a large share of backend services are written in Go, "it works in the browser" is not evidence the server is fine. It is frequently evidence of exactly this bug. The browser is being generous; Go is telling you the truth.

## Diagnose it in one command

Before changing anything, count the certificates the server actually sends:

```bash
openssl s_client -connect example.com:443 -servername example.com -showcerts </dev/null 2>/dev/null \
  | grep -c "BEGIN CERTIFICATE"
```

Read the number:

- **1** — only the leaf. The intermediate is missing. This is your bug, and it is the single most common cause.
- **2 or more** — a chain is being sent. The problem is elsewhere; keep reading past cause 1.

`-servername` matters. Without it OpenSSL omits SNI, and a host serving multiple sites will hand you its default certificate rather than the one you are debugging — which sends you chasing a mismatch that does not exist in production.

To see what each certificate in that chain actually is — who issued it, what it covers, whether the order is right — paste the whole `-showcerts` output into the [Certificate Decoder & Chain Checker](/certificate-decoder/). It reads every X.509 field, reports the chain order with the reason it was wrong, and gives a per-link signature verdict, so you can see which link fails to connect rather than inferring it. It runs entirely in your browser, which matters when the chain belongs to an internal host.

## The four causes, ranked

### 1. The server is missing its intermediate

By a wide margin the most common. The admin installed only the leaf, or concatenated the files in the wrong order, or a renewal replaced a full-chain file with a leaf-only one.

**Fix it on the server, not in your client.** Nearly every issuer ships a "fullchain" file for exactly this reason:

```nginx
# nginx — ssl_certificate must be leaf + intermediates, in that order
ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;   # not cert.pem
ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
```

The ordering rule is: **leaf first, then each issuer in turn, root optional and usually omitted.** A chain assembled in reverse order fails on strict clients even though every certificate present is valid — which is precisely the failure the chain checker names for you rather than leaving you to eyeball PEM blocks.

After reloading, re-run the `grep -c` above and confirm the count went up.

### 2. Your container has no CA bundle at all

If the failure only happens inside a container, suspect the image before the network. Minimal base images ship no trust store, so *every* public certificate is signed by an unknown authority — the client has no roots whatsoever.

```dockerfile
# Alpine — no CA bundle by default
RUN apk add --no-cache ca-certificates

# Debian/Ubuntu slim — usually present, but reinstall if it was stripped
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
```

For `scratch` or distroless images, copy the bundle in from a build stage:

```dockerfile
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
```

The tell for this cause: the same binary works on the host and fails in the container, against *any* HTTPS host — not just one.

### 3. A corporate proxy is re-signing traffic

On a corporate network, an inspecting proxy terminates TLS and re-signs it with an internal CA. That CA is legitimately unknown to your container, which never received it.

The tell: the leaf's issuer is your employer, not a public CA. Decode the certificate and read the issuer — if it says something like `Issuer: CN=Acme Corp Root CA`, this is your cause.

The fix is to install the corporate root into the image's trust store, not to disable verification:

```dockerfile
COPY corp-root.crt /usr/local/share/ca-certificates/corp-root.crt
RUN update-ca-certificates
```

### 4. The certificate really is self-signed

Internal services, a local dev stack, a private registry. Here the error is correct: the certificate genuinely is not trusted by anyone.

Add the CA to the trust store as above. For a private registry specifically, the Docker daemon reads a per-registry path:

```bash
/etc/docker/certs.d/registry.internal:5000/ca.crt
```

## The fix that is not a fix

Every one of these has a tempting one-liner: `InsecureSkipVerify: true` in Go, `-k` in curl, `insecure_skip_verify` in Terraform.

These do not fix anything. They disable the check that was correctly telling you the chain is broken, and they disable it for *every* connection that code path makes, permanently, including against an attacker. The failure you are silencing is the one case where verification did its job.

If you need an escape hatch during local development, scope it to a specific CA rather than switching verification off:

```go
pool, _ := x509.SystemCertPool()
pool.AppendCertsFromPEM(internalCA)          // trust one extra CA
cfg := &tls.Config{RootCAs: pool}            // still verifies everything
```

That trusts exactly what you decided to trust, and nothing else.

## A short checklist

1. Count the certificates the server sends with `openssl s_client -showcerts`. One means a missing intermediate — fix the server.
2. If it fails only in a container, and against every host, install `ca-certificates`.
3. Read the leaf's issuer. If it is your employer, install the corporate root.
4. If it is genuinely self-signed, add that CA — do not skip verification.

The through-line: `certificate signed by unknown authority` is nearly always a chain-assembly problem, and your browser's willingness to repair it silently is what makes it look like a client bug. Count the links first, and the cause usually names itself.

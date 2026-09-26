---
title: "A jwt.io alternative: decode a JWT without pasting it into someone else's site"
description: "Looking for a jwt.io alternative? What a browser-based JWT decoder can and can't prove about your data, how to check it yourself, and an offline option."
pubDate: 2026-09-21
tags: ["security", "jwt", "developer-experience"]
relatedTool:
  name: "JWT Decoder & Encoder"
  href: "/jwt-decoder"
---

![A JSON Web Token shown as three connected segments — header, payload and signature — representing a JWT decoded entirely in the browser](/blog/jwt-io-alternative-hero.svg)
<!-- keywords: jwt.io alternative | is jwt.io safe, jwt decoder offline, decode jwt online | source: ahrefs free (2026-09-21) -->

A teammate drops a token into a Slack thread: "why is this 401ing?" You copy it, open a new tab, and you're halfway through pasting it into jwt.io before you notice what you're holding: a live production access token.

Is that fine? You probably assume so. The point of this post is to swap that assumption for something you can actually check.

> **TL;DR**
>
> - Decoding a JWT is two base64url decodes. No key, no server, and nothing that needs uploading.
> - Whether a *specific page* sends your token anywhere is something you can check in DevTools → Network in about five seconds. Do that instead of trusting any vendor, us included.
> - Air-gapped or strict-policy machine? `cut | tr | base64 -d` decodes a JWT, and `openssl dgst -hmac` recomputes an HS256 signature so you can compare it, with no browser at all.
> - Decoding is not verifying, and neither one replaces server-side verification against your real signing keys.

## Is jwt.io safe?

That's the wrong question, or at least an incomplete one. "Safe" depends on what a specific page does with your input, and you can check that rather than trust it.

The mechanic that matters: the header and payload in `header.payload.signature` are base64url-encoded JSON. There's no encryption step. So any tool that decodes them in your browser's own JavaScript engine can do the whole job without a network request.

jwt.io is a long-established, widely used debugger maintained by Auth0, and its decoding works exactly this way, in your browser.

But "decodes locally" describes one code path on one page. It doesn't guarantee anything about every request that page's origin makes. A page can decode locally and still load analytics, ads, or other third-party scripts that have nothing to do with the decode.

## The five-second Network tab check

The reliable way to know what a decoder does with your token (jwt.io, this one, or a browser extension) is to watch it:

1. Open DevTools and switch to the **Network** tab.
2. Clear the request list. Leave the filter on **All**, or at least include **Fetch/XHR** and **WS**, so WebSocket traffic shows up too.
3. Paste your token.
4. Wait a few seconds, because a beacon can fire late. Then look at what fired. If no outgoing request contains the token, or nothing fires at all when you paste, nothing was sent.

That's more convincing than any claim in a blog post, including this one.

We hold ourselves to the same standard. The [JWT decoder](/jwt-decoder/) on this site does decoding, claim parsing and signature verification entirely in-browser, with JavaScript and the Web Crypto API.

To be precise about everything else this site loads: its own static assets, Google Analytics (the gtag.js script plus page-view and event pings), and Cloudflare Web Analytics. None of them carries the token you type.

Check that in the Network tab. Don't take our word for it either.

One caveat that has nothing to do with the network: if you save a snapshot in the decoder, the token (never your keys) is stored in this browser's localStorage. On a shared machine, don't snapshot production tokens.

## Decode JWT online: what actually has to happen

Here's a worked example using the long-standing jwt.io sample token. Its header, payload and secret shipped for years as jwt.io's default example, and it's become the standard demo token for JWT tooling:

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

Split it on the two dots and base64url-decode the first two parts.

The header:

```json
{ "alg": "HS256", "typ": "JWT" }
```

The payload:

```json
{ "sub": "1234567890", "name": "John Doe", "iat": 1516239022 }
```

That's the entire "decode" step. You don't need a key because nothing here is encrypted. `iat` is a NumericDate (seconds since the Unix epoch), and 1516239022 is January 18, 2018.

*Verifying* is a different operation. It confirms the signature was produced by whoever holds the secret, here `your-256-bit-secret`. You supply that HMAC secret, and the tool recomputes `HMACSHA256(base64url(header) + "." + base64url(payload), secret)` and compares the result with the third segment.

> **Key:** a token can decode cleanly and still fail verification. That's the whole reason it has a signature.

## JWT decoder offline: no browser required

Sometimes "in the browser, checked via DevTools" isn't enough. Maybe you're on an air-gapped machine. Maybe a security review wants zero network capability, full stop, not just no observed requests. You have two honest options.

### Option 1: decode with tools you already trust

base64url differs from standard base64 in two ways: two characters are swapped (`-` for `+`, `_` for `/`) and the `=` padding is stripped. So `cut`, `tr` and `base64` get you the JSON with no browser at all:

```bash
TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
echo "$TOKEN" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null
# {"sub":"1234567890","name":"John Doe","iat":1516239022}
```

> **Gotcha:** `base64` expects input padded with `=` to a multiple of 4 characters. GNU `base64 -d` still prints this payload (it just exits non-zero), but BSD/macOS is less forgiving.

If you'd rather not depend on that, this shell function pads first:

```bash
b64url() {
  local s
  s=$(printf '%s' "$1" | tr '_-' '/+')
  while [ $(( ${#s} % 4 )) -ne 0 ]; do s="$s="; done
  printf '%s' "$s" | base64 -d; echo
}

b64url "$(echo "$TOKEN" | cut -d. -f1)"   # {"alg":"HS256","typ":"JWT"}
b64url "$(echo "$TOKEN" | cut -d. -f2)"   # {"sub":"1234567890","name":"John Doe","iat":1516239022}
```

For HS256 you can verify offline too. Recompute the HMAC over `header.payload` and compare it with the third segment:

```bash
printf '%s' "$(echo "$TOKEN" | cut -d. -f1-2)" \
  | openssl dgst -sha256 -hmac 'your-256-bit-secret' -binary \
  | base64 | tr '+/' '-_' | tr -d '='
# SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c   <- matches the signature segment
```

If you want proper flag handling and built-in verification instead of shell one-liners, there are dedicated offline CLIs. `jwt-cli` (`mike-engel/jwt-cli` on GitHub, written in Rust) is a commonly cited one.

### Option 2: a static decoder with no upload path

A plain decode is just base64url decoding in client-side JS. So a static site doesn't need a backend to do it, and this one has none: there is no server of its own to receive your token.

That doesn't mean a page *can't* talk to anything. This site's Content-Security-Policy limits outbound connections to its own origin plus the Google Analytics and Cloudflare Web Analytics endpoints, which you can read in the response headers. A policy narrows where data could go; it doesn't prove where it went. The Network tab is still the check.

## When to use which

Be honest with yourself about what each option is for:

| Option | Best for | Guarantee |
|---|---|---|
| **jwt.io** | Non-sensitive tokens: tests, tutorials, non-prod tenants | Decode path is client-side JS |
| **Browser tool + Network tab** | Real access or ID tokens | You saw nothing leave the tab (this visit) |
| **CLI decode** | Air-gapped or no-network policy | Strongest, short of writing your own |

The browser route adds claim captions, expiry checks and signature verification. The CLI route gives you raw JSON and HMAC verification, and nothing more.

> **Important:** none of these validate authorization. Decoding, even with signature verification, tells you the token is well-formed and, optionally, that it was signed by whoever holds the key you checked against. It doesn't replace server-side verification before you act on a claim in production. Your backend has to do that check against your actual signing keys, every time.

Want to go one level lower than JWT-specific tooling, to the base64url mechanics themselves? The [Base64 Encoder / Decoder](/base64-encoder-decoder/) handles arbitrary base64 and base64url payloads, not just JWTs.

## Key takeaways

- Treat "is this site safe?" as a question you answer in DevTools, not one you settle by reputation.
- Clear the Network tab, paste the token, and check that nothing carries it out.
- Decode is not verify: a readable payload proves nothing about who signed it.
- On locked-down machines, `cut | tr | base64 -d` decodes and `openssl dgst -hmac` lets you check an HS256 signature.
- Always verify server-side against your real keys before trusting a claim.

If you want the browser route with verification built in, the [JWT decoder](/jwt-decoder/) does the full job: decode, verify against a secret, PEM, JWK or JWKS, sign your own tokens, and generate test keys, with nothing uploaded. Confirm that in your own Network tab before you trust it with anything real.

What's your rule for production tokens: any decoder goes, a vetted in-house tool, or CLI only? And what made your team settle on it?

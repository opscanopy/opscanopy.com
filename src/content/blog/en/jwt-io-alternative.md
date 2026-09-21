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

You've got a JWT you need to inspect — an access token from a login flow, an ID token from an OAuth provider, something a teammate pasted into a Slack thread. jwt.io is the tool everyone reaches for, and for casual, low-stakes tokens it's fine. But if the token is a production credential, or your team has a policy about pasting auth material into third-party web pages, you want a **jwt.io alternative** you can actually reason about — one where you know, rather than assume, that nothing left your machine.

This post covers what a browser-based JWT decoder does and doesn't do with your input, how to verify that for yourself instead of taking any vendor's word for it (ours included), and what to reach for if you need something that works fully offline.

## Is jwt.io safe?

That's the wrong question, or at least an incomplete one — "safe" depends on what a specific page does with your input, and that's something you can check rather than trust. Here's the mechanic that matters: decoding a JWT is just two base64url decodes. The header and payload segments of `header.payload.signature` are base64url-encoded JSON with no encryption step, so any tool that decodes them in your browser's own JavaScript engine can do the entire job without a network request — there is nothing to upload for a plain decode. jwt.io is a long-established, widely used debugger maintained by Auth0, and the decoding portion of it works this way, in your browser.

That said, "decodes locally" is a claim about one code path on one page, not a blanket guarantee about every request that page's origin makes — a page can decode locally and still load analytics, ads, or other third-party scripts that have nothing to do with the decode itself. The reliable way to know what any decoder — jwt.io, this one, or a browser extension — actually does with a token you paste in is to open your browser's DevTools, switch to the Network tab, clear it, and paste your token. If no outgoing request contains the token or fires at all in response to your paste, nothing was sent. That's a five-second check, and it's more convincing than any claim in a blog post, including this one.

We hold ourselves to the same standard: the [JWT decoder](/jwt-decoder/) on this site runs decoding, claim parsing, and signature verification entirely with in-browser JavaScript and the Web Crypto API. The only network activity this whole site makes at all is loading its own static assets and a page-view analytics ping — neither carries the token you type. Check it yourself in the Network tab; don't take our word for that either.

## Decode JWT online: what actually has to happen

Here's the worked example, using the canonical sample token that's become the de facto standard for JWT tooling demos — it's the same header, payload and secret jwt.io itself has shipped as its default example for years:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

Split it on the two dots and base64url-decode the first two parts:

```json
// header
{ "alg": "HS256", "typ": "JWT" }

// payload
{ "sub": "1234567890", "name": "John Doe", "iat": 1516239022 }
```

That's the entire "decode" step — no key needed, because there's nothing encrypted here to unlock. `iat` is a NumericDate (seconds since the Unix epoch): 1516239022 is January 18, 2018. If you want to *verify* rather than just decode — confirm the signature was actually produced by whoever holds the secret `your-256-bit-secret` — you supply that HMAC secret and the tool recomputes `HMACSHA256(base64url(header) + "." + base64url(payload), secret)` and compares it against the third segment. Decoding and verifying are different operations; a token can decode cleanly and still fail verification, which is the whole point of having a signature at all.

## jwt decoder offline

Sometimes "in the browser, checked via DevTools" isn't enough — you're on an air-gapped machine, or a security review wants zero network capability, full stop, not just an absence of observed requests. For that, you have two honest options:

1. **A command-line decode with tools you already trust.** JWTs use base64url, which differs from standard base64 only in two substituted characters and stripped padding. A one-liner with `cut`, `tr`, and `base64` gets you the JSON with no GUI or browser at all:

```bash
TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
echo "$TOKEN" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null
# {"sub":"1234567890","name":"John Doe","iat":1516239022}
```

(Base64 wants the string padded to a multiple of 4 with `=`; add it if your `base64` complains — GNU `base64 -d` is usually forgiving, BSD/macOS less so.) There are also dedicated offline CLIs — `jwt-cli` (`mike-engel/jwt-cli` on GitHub, written in Rust) is a commonly cited one — if you want proper flag handling and verification built in rather than a shell one-liner.

2. **A statically served decoder with no upload path at all.** Because a plain decode is just base64url decoding in client-side JS, an architecture like this one's — a static page with no server-side component in the request path — has nothing to send your token to even if it tried. That's an architectural property you can confirm by reading the response headers and watching the Network tab, the same check described above, not a separate feature you have to enable.

## When to use which

Be honest with yourself about what each option is actually for:

- **jwt.io** is the fastest path for a token you don't consider sensitive — a test token, a tutorial example, something from a non-production tenant. It's well known, well maintained, and the decode path is client-side JS, as described above.
- **A browser-based tool with the Network tab open** (this one, or any other) is the right level of caution for a real access or ID token you want to inspect without a second thought about where it went — you get a UI, claim captions, expiry checks, and signature verification, and you can prove to yourself in under a minute that nothing left the tab.
- **A CLI decode** is for the air-gapped case, or when policy requires no network capability at all rather than "no requests observed." It's less convenient — no claim captions, no expiry highlighting — but it's the strongest guarantee available short of writing the decoder yourself.
- **None of these validate authorization.** Decoding, even with signature verification, tells you the token is well-formed and, optionally, that it was signed by whoever holds the key you checked against. It does not replace server-side verification before you act on any claim in production — that check has to happen on your backend, against your actual signing keys, every time.

For the base64url mechanics underneath any of this — encoding raw bytes, not just JWTs — the [Base64 Encoder / Decoder](/base64-encoder-decoder/) handles arbitrary base64 and base64url payloads if you need to go one level lower than JWT-specific tooling.

If you want the browser route with verification, claim captions, and a built-in test-key generator, the [JWT decoder](/jwt-decoder/) on this site does the full job — decode, verify against a secret, PEM, JWK or JWKS, and sign your own tokens — with nothing uploaded, which you're welcome to confirm in your own Network tab before you trust it with anything real.

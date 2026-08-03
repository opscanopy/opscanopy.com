# Security policy

## Reporting a vulnerability

Email **hello@opscanopy.com**. Please include enough detail to reproduce —
ideally the page, the input, and what you observed.

You will get an acknowledgement within a few days. If the issue is confirmed,
we will tell you when the fix ships. We do not run a paid bounty; we will credit
you by name in the changelog entry unless you prefer otherwise.

Please give us 90 days before publishing, and do not access or modify data
belonging to anyone else while testing.

## Supported versions

There is one version: whatever is live at <https://opscanopy.com>. It is a
static site with no backend and no releases to back-port to.

## In scope

- <https://opscanopy.com> and its localized paths.
- The tool engines under `src/lib/`, including any published as npm packages.
- Anything that would break the core guarantee below.

## Out of scope

- Google Analytics 4 and Cloudflare infrastructure — report those to the
  respective vendors.
- Missing headers with no demonstrated impact, and automated-scanner output
  without a working proof of concept.
- Social-engineering, physical access, and denial of service against the CDN.

## The guarantee worth attacking

Every tool runs entirely in the visitor's browser. There is no server to receive
input, no account, and nothing uploaded. `connect-src` in the
[Content-Security-Policy](public/_headers) allows only this origin plus Google
Analytics, and analytics events carry the page path only — never tool input.

**A way to get pasted input off the page is the highest-severity report we can
receive.** So is anything that makes the site execute script it did not ship:
the CSP has no `unsafe-inline`, and every injected value passes through
[`escapeHtml`](src/lib/escape-html.ts).

Some tools remember your most recent input in `localStorage` so you do not have
to retype it. That is documented key-by-key on
[/privacy](https://opscanopy.com/privacy/), tools whose input is normally a
secret never store anything, and a content guard refuses credential-shaped
values from every caller. A path that defeats that guard is in scope.

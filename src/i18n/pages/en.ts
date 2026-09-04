/**
 * Localized copy for the standalone info / legal pages — Privacy, About, Terms,
 * Contact. English is the source of truth; other locales provide a Partial of
 * this shape and fall back to English field-by-field (see ../pages.ts).
 *
 * Translate ONLY human-facing prose. Keep object keys, `href` values, the
 * `updated` ISO date, and the brand name `OpsCanopy` byte-for-byte identical
 * (see src/i18n/GLOSSARY.md).
 */

export interface PageSection {
  heading: string;
  /** Paragraphs of plain prose, rendered in order. */
  body: string[];
}

export interface PageLink {
  label: string;
  /** Absolute external URL or a locale-neutral page key. */
  href: string;
  external?: boolean;
}

export interface PageDoc {
  /** Base <title>. Layout appends " · OpsCanopy" only if it fits the length budget. */
  metaTitle: string;
  /** Meta description + OG description. */
  description: string;
  eyebrow: string;
  /** Page H1. */
  heading: string;
  /** Intro paragraph under the H1. */
  lead: string;
  /** ISO date for the "last updated" line; omit to hide it. */
  updated?: string;
  sections: PageSection[];
  /** Optional call-to-action links (Contact page). */
  links?: PageLink[];
}

export interface PagesContent {
  privacy: PageDoc;
  about: PageDoc;
  terms: PageDoc;
  security: PageDoc;
  contact: PageDoc;
  /** Shared chrome strings for the info-page template. */
  ui: {
    updatedLabel: string;
    /** Analytics opt-in toggle on /privacy (see ConsentToggle.astro). */
    consent: {
      label: string;
      on: string;
      off: string;
    };
    /** "Delete everything stored on this device" control on /privacy (see StoredDataPurge.astro). */
    purge: {
      /** Short heading above the button. */
      heading: string;
      /** Explains scope: inputs go, settings and progress stay. */
      description: string;
      /** Button label. */
      button: string;
      /** Shown when there is nothing to delete. */
      empty: string;
      /** Shown after a successful purge. */
      done: string;
    };
  };
}

const UPDATED = '2026-08-03';

const en: PagesContent = {
  ui: {
    updatedLabel: 'Last updated',
    consent: {
      label: 'Allow analytics cookies',
      on: 'Analytics cookies are on. Uncheck the box to return to cookieless mode.',
      off: 'Currently cookieless — no analytics cookie is set unless you opt in.',
    },
    purge: {
      heading: 'Erase what tools remembered',
      description:
        'Deletes the remembered inputs listed above (oc-last-v1, oc-snap-v1, oc-handoff-v1) from this browser. Your theme, language, analytics choice, and Mission 90 progress are kept.',
      button: 'Delete remembered inputs',
      empty: 'Nothing stored — no tool has remembered anything in this browser.',
      done: 'Deleted. Nothing is stored in this browser now.',
    },
  },

  privacy: {
    metaTitle: 'Privacy Policy',
    description:
      'How OpsCanopy handles your data: every tool runs entirely in your browser. Nothing you paste is uploaded, logged, or shared. No accounts, and nothing you paste leaves your device.',
    eyebrow: 'Privacy',
    heading: 'Your data never leaves your device.',
    lead: 'OpsCanopy is built privacy-first. Every tool runs entirely in your browser — there is no server to receive your input, no account to create, and nothing to upload. This policy explains exactly what that means.',
    updated: UPDATED,
    sections: [
      {
        heading: 'The short version',
        body: [
          'The text, files, and configuration you paste into any OpsCanopy tool are processed locally, inside your own browser tab. They are never sent to us or to any third party.',
          'So that you do not have to retype it, most tools remember your most recent input on your own device, in your browser’s local storage — it stays on your machine, and clearing your site data removes it. Tools whose input is normally a secret never remember anything, and on every other tool a value that looks like a credential is refused before it is written. The full list of what is stored is below.',
          'We do not run user accounts, we do not require sign-up, and we have no database of your activity.',
        ],
      },
      {
        heading: 'What we process in your browser',
        body: [
          'Each tool is a small program that runs as client-side JavaScript (or WebAssembly). When you paste a log line, an alert rule, a CIDR list, or any other input, the computation happens on your machine. The results you see are produced locally and disappear from memory when you navigate away.',
          'Because the work is local, the tools also keep working offline once the page has loaded.',
        ],
      },
      {
        heading: 'What we do not collect',
        body: [
          'We do not collect the contents of your inputs or outputs. We do not use advertising cookies, cross-site trackers, or fingerprinting. We do not sell, rent, or share personal data, because we do not gather it in the first place. Our only measurement is the cookieless-by-default analytics described below.',
          'Any preference the site remembers — such as your light/dark theme or language — is stored in your browser’s local storage on your device and is never transmitted to us.',
        ],
      },
      {
        heading: 'What the site stores on your device',
        body: [
          'Everything OpsCanopy remembers is kept in your browser’s local storage on your device, under a handful of named keys you can inspect and delete at any time. None of it is transmitted to us. Today those keys are:',
          'theme — your light or dark theme choice.',
          'oc-analytics-consent — your analytics opt-in choice from the toggle on this page.',
          'oc-m90-v1 — your Mission 90 Days DevOps progress: which days and missions you have marked done in this browser.',
          'oc-m90-backup-meta — when you last backed up that progress (and whether you dismissed the backup reminder), so the Mission 90 hub knows when a reminder is worth showing.',
          'opscanopy:tools:sort — how you last sorted the tools catalog.',
          'oc-roadmap-… (one key per learning roadmap) — which topics you have checked off on that roadmap.',
          'oc-guide-…-pos (one key per guide) — your last reading position in that guide.',
          'oc-tools-v1 — tools you have pinned, and the last few you have used, so the "Jump back in" and "Your tools" shelves can show them.',
          'oc-last-v1 — the last input you typed into a tool, restored automatically the next time you open that same tool. Never used on the five tools whose input is normally a secret — JWT Decoder, Hash Generator, Base64 Encoder/Decoder, the Env Example Checker, and the Certificate Decoder. On every other tool, a value that looks like a credential — a private key block, an API token, a JWT, or a password inside a URL — is refused before it is written, so a secret pasted somewhere unexpected is still not kept.',
          'oc-snap-v1 — snapshots you explicitly chose to keep with a "Save snapshot" button, so you can return to that exact input later. Available on every tool, including the five above, since saving one is your own deliberate action.',
          'oc-handoff-v1 — a one-time handoff when you follow a "Decode as JWT" or similar link between two tools. It lives in this tab only (sessionStorage, not localStorage) and is deleted the instant the destination tool reads it — never carried in the page URL, so it never ends up in your browsing history.',
          'Clearing your browser’s site data removes all of these. Mission 90 progress can survive a clear via the backup file or code from the Mission 90 hub.',
        ],
      },
      {
        heading: 'Hosting and server logs',
        body: [
          'OpsCanopy is served as static files from a hosting provider and content-delivery network. Like virtually all web hosts, those providers may keep short-lived, standard request logs (for example an IP address and browser user-agent) to deliver pages, mitigate abuse, and keep the service secure. These logs are operational and are not used to profile you.',
        ],
      },
      {
        heading: 'Analytics',
        body: [
          'We use Google Analytics 4 to understand which tools and guides are actually useful: page views plus a handful of anonymous product events (for example “a result was copied on this page” or “a Mission 90 day was marked complete”). These events carry only the page path — they never include anything you type or paste into a tool.',
          'By default, analytics runs in cookieless “consent denied” mode: no analytics cookie is set and no persistent identifier is stored on your device unless you explicitly opt in with the toggle below. You can change your choice at any time on this page, and the site works identically either way.',
        ],
      },
      {
        heading: 'Third-party services',
        body: [
          'Beyond the analytics script described above, we keep external dependencies to a minimum — fonts are self-hosted and pages load no other third-party code. We do not embed advertising networks or social tracking pixels.',
        ],
      },
      {
        heading: 'Changes to this policy',
        body: [
          'If this policy changes, we will update the date shown at the top of this page. Continued use of the tools after an update means you accept the revised policy.',
        ],
      },
      {
        heading: 'Questions',
        body: [
          'Privacy questions are welcome. The best way to reach us is through our public GitHub organization — see the Contact page for the link.',
        ],
      },
    ],
  },

  about: {
    metaTitle: 'About OpsCanopy',
    description:
      'OpsCanopy is a growing canopy of free, private, browser-based tools for platform and DevOps engineers — validators, converters, testers and linters that never touch a server.',
    eyebrow: 'About',
    heading: 'Free DevOps tools that run entirely in your browser.',
    lead: 'OpsCanopy is a growing collection of focused utilities for platform and DevOps engineers. Each one solves a small, real problem — and each one runs 100% client-side, so the things you paste never leave your device.',
    updated: UPDATED,
    sections: [
      {
        heading: 'Why it exists',
        body: [
          'Engineers reach for quick tools dozens of times a day: validate a workflow file, decode a token, test a regex against log lines, work out a subnet, convert a suppression file. Too many of those tools ask you to paste sensitive internal data into a website that quietly uploads it to a server.',
          'OpsCanopy takes the opposite approach. The tools are fast, free, and private by construction — nothing you paste is ever transmitted, because there is nowhere for it to go.',
          'That includes AI assistants: a chat box is a third party too, and anything you paste into one is retained on a third party’s servers. A tool that computes locally never puts you in that position.',
        ],
      },
      {
        heading: 'Principles',
        body: [
          'Local-only by construction. There is no server that could receive your input — privacy here is architecture, not a policy promise.',
          'Deterministic, not plausible. Tools compute their output with real parsers and exact arithmetic instead of predicting likely-looking text.',
          'Free forever, no accounts. No paywall, no signup, no email capture — open a tool and use it.',
          'Open source, so you can audit it. The full code is public on GitHub, and you can read exactly what each tool computes.',
        ],
      },
      {
        heading: 'How it works',
        body: [
          'The whole site is static. Every tool is a self-contained program that runs in your browser using JavaScript and, where it helps, WebAssembly. There is no backend, no API, and no account system. Once a page has loaded, most tools keep working even with the network disconnected.',
        ],
      },
      {
        heading: 'How it’s built and tested',
        body: [
          'The engines are pure TypeScript. Where correctness has an authority to answer to, the tests are pinned to it — RFC 3021 /31 subnet behaviour, NIST hash test vectors, and a versioned conformance corpus for the GitHub Actions expression tester.',
          'The engines take text in and return results — no network calls, nothing hidden — so the behaviour a tool claims is reproducible in a test.',
        ],
      },
      {
        heading: 'Who it is for',
        body: [
          'It is built for platform engineers, SREs, DevOps practitioners, and anyone who lives close to infrastructure — but the tools are useful to any developer who wants a quick, private answer without installing anything.',
        ],
      },
      {
        heading: 'Who builds it',
        body: [
          'OpsCanopy is built and maintained by Pushkar Kumar and Asif Khan — engineers who got tired of pasting sensitive config into random web tools and decided to build fast, private, client-side alternatives instead.',
          "Pushkar Kumar — a software developer and DevOps engineer interested in DevOps. He set out to create a free resource for new developers and DevOps engineers learning this path, so DevOps can be easily guided and learned — since when he started, there wasn't a free resource like this to start with.",
          "Asif Khan — a software developer and DevOps engineer interested in DevOps. He set out to create a free resource for new developers and DevOps engineers learning this path, so DevOps can be easily guided and learned — since when he started, there wasn't a free resource like this to start with.",
          'Development happens in the open on GitHub, so you can audit exactly how each tool behaves, report a bug, or suggest the next utility to add.',
        ],
      },
    ],
    links: [
      { label: 'OpsCanopy on GitHub', href: 'https://github.com/opscanopy/opscanopy.com', external: true },
      { label: 'Report an issue', href: 'https://github.com/opscanopy/opscanopy.com/issues', external: true },
      { label: 'Verify the AI', href: '/verify-ai/' },
    ],
  },

  security: {
    metaTitle: 'Security',
    description:
      'How OpsCanopy is built to keep what you paste on your machine: no backend, a hash-based CSP, and a published way to report a vulnerability.',
    eyebrow: 'Security',
    heading: 'What protects the things you paste.',
    lead: 'Every tool here runs in your own browser. This page explains what that actually buys you, what it does not, and how to check any of it yourself rather than taking our word for it.',
    updated: UPDATED,
    sections: [
      {
        heading: 'The architecture IS the guarantee',
        body: [
          'OpsCanopy is a static site. There is no server that receives your input, no database, and no account — so "we do not log what you paste" is not a policy we could quietly change, it is a thing we have no mechanism to do.',
          'That is enforced at the platform level, not just promised. The Content-Security-Policy sets `connect-src` to this origin plus Google Analytics and nothing else, so the page is not permitted to send data anywhere we have not listed. `frame-ancestors` is `none`, so no other site can embed a tool and read it. Fonts are self-hosted; there is no CDN to phone.',
          'You can watch this. Open your browser devtools, switch to the network tab, paste something into any tool, and press the button. The only third-party request is the Google Analytics script — and its events carry the page path only. We checked that specifically: a tool value written into the URL fragment does not reach analytics, because fragments are never sent in a request.',
        ],
      },
      {
        heading: 'Injected script cannot run here',
        body: [
          'Every tool builds its results as HTML and injects them, which is exactly the shape that becomes cross-site scripting when it goes wrong. Two things stand behind it.',
          'First, every value that reaches the page passes through one escaping helper — there is no tool that opts out. Second, the CSP `script-src` contains no `unsafe-inline`: it lists a SHA-256 hash for each script the build produced, so a script the build did not produce simply does not execute, even if something managed to write it into the page. `object-src` is `none` and `base-uri` is locked to this origin, which closes the two common ways around a script policy.',
        ],
      },
      {
        heading: 'What we store on your device — and what we refuse to',
        body: [
          'To save you retyping, most tools remember your most recent input in your browser’s local storage. It never leaves your machine, every key is documented by name on the privacy page, and there is a button there that erases all of it.',
          'Tools whose input is normally a secret — the JWT decoder, hash generator, Base64 encoder, .env checker and certificate decoder — never store anything at all. On every other tool, a value that looks like a credential (a private-key block, an API token, a JWT, a password inside a URL) is refused before it can be written, so a secret pasted somewhere unexpected is still not kept.',
        ],
      },
      {
        heading: 'What this does NOT protect you from',
        body: [
          'A browser extension with permission to read pages can read what you paste here, exactly as it can on any site. So can anyone with access to your unlocked machine, or malware on it. Running in your browser removes us from the picture; it does not remove everything else that is already there.',
          'Nothing here vouches for the things you paste. A certificate this tool says is valid can still be a certificate you should not trust, and a workflow this tool reports as clean can still be wrong in ways it does not check — each tool page lists what it deliberately does not look at.',
          'And be careful about the habit rather than the site: if pasting secrets into a web page becomes routine, the risk is the next page you do it on.',
        ],
      },
      {
        heading: 'Reporting something',
        body: [
          'Email hello@opscanopy.com. Include the page, the input, and what you saw. You will get a reply within a few days, and credit in the changelog when a fix ships unless you would rather not be named.',
          'The most valuable report is anything that gets pasted input off the page, or makes the site run script it did not ship. The full policy — scope, timelines, what is out of scope — is in SECURITY.md in the repository, and machine-readably at /.well-known/security.txt.',
        ],
      },
      {
        heading: 'Check it yourself',
        body: [
          'The site is MIT-licensed and the whole repository is public, including the tool engines and their tests. If a claim on this page matters to you, the code behind it is readable, and the security headers are a single file you can inspect in your browser’s network tab.',
        ],
      },
    ],
  },

  terms: {
    metaTitle: 'Terms & Conditions',
    description:
      'The plain-language terms for using OpsCanopy — free, browser-based DevOps tools provided as-is, with no warranty and no liability for how you use the output.',
    eyebrow: 'Terms',
    heading: 'Terms & Conditions.',
    lead: 'These terms govern your use of OpsCanopy and its tools. They are written in plain language and are intentionally short. By using the site, you agree to them.',
    updated: UPDATED,
    sections: [
      {
        heading: 'Acceptance of these terms',
        body: [
          'By accessing or using OpsCanopy, you agree to be bound by these terms. If you do not agree, please do not use the site.',
        ],
      },
      {
        heading: 'Use of the tools',
        body: [
          'OpsCanopy provides free utilities for your own lawful use. You may use the tools for personal and commercial work. You agree not to misuse the site — for example by attempting to disrupt it, overload it, or use it to break the law.',
          'Because every tool runs in your browser, you are responsible for the input you provide and for reviewing the output before you rely on it.',
        ],
      },
      {
        heading: 'No warranty',
        body: [
          'The tools are provided “as is” and “as available”, without warranties of any kind, whether express or implied. We do not warrant that the tools will be accurate, error-free, uninterrupted, or fit for any particular purpose. Always verify critical changes — networking, security, scheduling, and configuration output included — against your own authoritative sources before applying them.',
        ],
      },
      {
        heading: 'Limitation of liability',
        body: [
          'To the fullest extent permitted by law, OpsCanopy and its contributors are not liable for any direct, indirect, incidental, or consequential damages arising from your use of, or inability to use, the site or its tools — including any decisions made based on their output.',
        ],
      },
      {
        heading: 'Trademarks',
        body: [
          'Product and company names referenced by the tools — including Grafana, Loki, Prometheus, Kubernetes, GitHub Actions, and others — are the trademarks of their respective owners. OpsCanopy is not affiliated with or endorsed by them. Loki and Grafana are trademarks of Raintank, Inc.',
        ],
      },
      {
        heading: 'Changes to these terms',
        body: [
          'We may update these terms from time to time. When we do, we will revise the date at the top of this page. Your continued use of the site after a change means you accept the updated terms.',
        ],
      },
      {
        heading: 'Contact',
        body: [
          'If you have questions about these terms, reach us through the channels listed on the Contact page.',
        ],
      },
    ],
  },

  contact: {
    metaTitle: 'Contact',
    description:
      'Get in touch with OpsCanopy. Report a bug, request a tool, or ask a question through our public GitHub organization.',
    eyebrow: 'Contact',
    heading: 'Get in touch.',
    lead: 'OpsCanopy is built and maintained in the open. The fastest way to report a bug, request a feature, or ask a question is through our public GitHub organization.',
    sections: [
      {
        heading: 'Bugs & feature requests',
        body: [
          'Found something broken, or have an idea for a tool you wish existed? Open an issue on GitHub. Clear, reproducible reports — what you pasted, what you expected, and what happened — help us fix things fast.',
        ],
      },
      {
        heading: 'General questions',
        body: [
          'For anything else — including privacy questions or general feedback — GitHub is the best place to reach us. We read everything, even if a reply takes a little while.',
        ],
      },
    ],
    links: [
      { label: 'Email hello@opscanopy.com', href: 'mailto:hello@opscanopy.com' },
      {
        label: 'Report an issue',
        href: 'https://github.com/opscanopy/opscanopy.com/issues/new',
        external: true,
      },
      { label: 'OpsCanopy on GitHub', href: 'https://github.com/opscanopy', external: true },
      { label: '@opscanopy on X', href: 'https://twitter.com/opscanopy', external: true },
    ],
  },
};

export default en;

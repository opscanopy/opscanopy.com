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
  /** Base <title>; the page appends " — OpsCanopy". */
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
  contact: PageDoc;
  /** Shared chrome strings for the info-page template. */
  ui: {
    updatedLabel: string;
  };
}

const UPDATED = '2026-06-12';

const en: PagesContent = {
  ui: {
    updatedLabel: 'Last updated',
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
          'The text, files, and configuration you paste into any OpsCanopy tool are processed locally, inside your own browser tab. They are never sent to us or to any third party, and they are never stored after you close the tab.',
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
          'We do not collect the contents of your inputs or outputs. We do not use advertising cookies, cross-site trackers, or fingerprinting. We do not sell, rent, or share personal data, because we do not gather it in the first place.',
          'Any preference the site remembers — such as your light/dark theme or language — is stored in your browser’s local storage on your device and is never transmitted to us.',
        ],
      },
      {
        heading: 'Hosting and server logs',
        body: [
          'OpsCanopy is served as static files from a hosting provider and content-delivery network. Like virtually all web hosts, those providers may keep short-lived, standard request logs (for example an IP address and browser user-agent) to deliver pages, mitigate abuse, and keep the service secure. These logs are operational and are not used to profile you.',
        ],
      },
      {
        heading: 'Third-party services',
        body: [
          'We keep external dependencies to a minimum. The site may load assets such as web fonts needed to render pages. We do not embed advertising networks or social tracking pixels.',
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
        ],
      },
      {
        heading: 'How it works',
        body: [
          'The whole site is static. Every tool is a self-contained program that runs in your browser using JavaScript and, where it helps, WebAssembly. There is no backend, no API, and no account system. Once a page has loaded, most tools keep working even with the network disconnected.',
        ],
      },
      {
        heading: 'Free and open',
        body: [
          'OpsCanopy is free to use with no signup and no paywall. Tools are engineered against real specifications and test vectors so their output is trustworthy, and the catalog keeps growing as new utilities ship.',
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
          'Development happens in the open on GitHub, so you can audit exactly how each tool behaves, report a bug, or suggest the next utility to add.',
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
      { label: 'OpsCanopy on GitHub', href: 'https://github.com/opscanopy', external: true },
      { label: '@opscanopy on X', href: 'https://twitter.com/opscanopy', external: true },
    ],
  },
};

export default en;

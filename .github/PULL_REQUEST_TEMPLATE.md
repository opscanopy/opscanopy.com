## What this changes

<!-- One or two sentences. If it fixes a wrong answer, say what the right answer
     is and what decides it (RFC, spec, CLI output). -->

## Checklist

- [ ] `npm run test` passes
- [ ] `npm run check` reports **0 errors** (it is a CI gate; `npm run build`
      passing does not check types)
- [ ] A behaviour change comes with a test that would have failed before
- [ ] Page copy changes (H1, lead, FAQ, JSON-LD) ship to **all five locales**
- [ ] No new colours outside the `@theme` block in `src/styles/global.css`, and
      no Tailwind `dark:` variants
- [ ] Anything injected into the DOM goes through `escapeHtml()`

<!-- New tool? See CONTRIBUTING.md — engine, engine test, playground, page, and
     an entry in src/data/tools.ts. -->

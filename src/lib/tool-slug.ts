/**
 * Tool slug from a page path — the one place that knows how a tool page's URL
 * maps back to its registry slug, shared by ToolHero (breadcrumb, pin, Updated
 * date) and ToolGapVisual (category accent).
 *
 *   /subnet-calculator/        → 'subnet-calculator'
 *   /de/subnet-calculator/     → 'subnet-calculator'
 *   /, /de/                    → undefined
 *
 * The locale prefixes come from `PREFIXED_LOCALES` (src/i18n/paths.ts, derived
 * from `LOCALES` in src/i18n/config.ts) — never a hand-copied list, so adding a
 * locale cannot silently strip the breadcrumb and pin from its tool pages.
 * Pure and DOM-free; whether the slug is a registered tool is the caller's
 * question (`getTool`).
 */
import { PREFIXED_LOCALES } from '../i18n/paths';

const PREFIXES: readonly string[] = PREFIXED_LOCALES;

export function toolSlugFromPath(pathname: string): string | undefined {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return undefined;
  return PREFIXES.includes(parts[0]) ? parts[1] : parts[0];
}

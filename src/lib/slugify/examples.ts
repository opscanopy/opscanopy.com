/**
 * Slugify — bundled example chips. Each `input` exercises a different edge:
 * accents/diacritics + punctuation, a symbol-heavy heading (C++), and messy
 * leading/trailing/internal whitespace. examples[0] seeds the playground on
 * first load.
 */
import type { SlugifyExample } from './types';

export const examples: SlugifyExample[] = [
  { id: 'accented', label: 'Accented title', input: 'Blog post: Héllo Wörld!' },
  { id: 'symbols', label: 'C++ heading', input: '10 Things About C++' },
  { id: 'spacing', label: 'Messy spacing', input: '  Spaces   & Symbols  ' },
];

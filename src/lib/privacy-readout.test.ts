import { describe, expect, it } from 'vitest';
import { countCookies, countRequests, fillPrivacyReadout } from './privacy-readout';

function cell(ssr: string, text = ssr) {
  return { textContent: text as string | null, dataset: { ssr } };
}
function rootWith(req: ReturnType<typeof cell> | null, ck: ReturnType<typeof cell> | null) {
  return {
    querySelector(sel: string) {
      if (sel === '[data-pp="requests"]') return req;
      if (sel === '[data-pp="cookies"]') return ck;
      return null;
    },
  };
}

describe('countCookies', () => {
  it('is 0 for an empty cookie string', () => {
    expect(countCookies('')).toBe(0);
  });
  it('counts name=value pairs and ignores empty segments', () => {
    expect(countCookies('_ga=GA1.1.1; _ga_X=GS1.1')).toBe(2);
    expect(countCookies('a=1; ; b=2;')).toBe(2);
  });
});

describe('countRequests', () => {
  it('adds the document to the resource entries', () => {
    expect(countRequests(13, 1)).toBe(14);
  });
  it('never reports less than the SSR default', () => {
    expect(countRequests(0, 1)).toBe(1);
    expect(countRequests(0, Number.NaN)).toBe(1);
  });
});

describe('fillPrivacyReadout', () => {
  it('replaces both SSR defaults with measured values', () => {
    const req = cell('1');
    const ck = cell('0');
    fillPrivacyReadout(rootWith(req, ck), { resources: () => 9, cookie: () => '_ga=1; _ga_Y=2' });
    expect(req.textContent).toBe('10');
    expect(ck.textContent).toBe('2');
  });
  it('keeps the SSR value of a cell whose probe throws', () => {
    const req = cell('1');
    const ck = cell('0');
    fillPrivacyReadout(rootWith(req, ck), {
      resources: () => {
        throw new Error('no perf');
      },
      cookie: () => {
        throw new Error('blocked');
      },
    });
    expect(req.textContent).toBe('1');
    expect(ck.textContent).toBe('0');
  });
  it('is a no-op without a root or cells', () => {
    expect(() => fillPrivacyReadout(null, { resources: () => 1, cookie: () => '' })).not.toThrow();
    expect(() => fillPrivacyReadout(rootWith(null, null), { resources: () => 1, cookie: () => '' })).not.toThrow();
  });
});

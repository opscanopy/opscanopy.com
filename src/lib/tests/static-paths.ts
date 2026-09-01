/**
 * Shared `getStaticPaths` source for every per-test route.
 *
 * Two routes now build one path each per live test — the noindex runner at
 * `/tests/<cat>/<test>/` and the indexable review page at
 * `/tests/<cat>/<test>/review/`. The registry↔content integrity checks below are
 * the thing that makes a broken test fail the build instead of shipping, so they
 * must run identically for both. Copying them into each route would let the two
 * drift, which is precisely how a hand-mirrored type in the subnet-splitter lost a
 * field the render code depended on.
 *
 * Validates in BOTH directions and throws with an actionable message:
 *   A. every question file maps to a LIVE registry test under a LIVE category,
 *      and its filename follows "<category>__<test>.json"
 *   B. every LIVE registry test has a question file
 * plus content-key uniqueness, so a duplicate can never silently overwrite.
 */
import { getCollection } from 'astro:content';
import { liveTests, getTest, getCategory } from '../../data/tests';

export async function testStaticPaths() {
  const files = await getCollection('practiceTestQuestions');

  const byKey = new Map<string, (typeof files)[number]>();
  for (const f of files) {
    const key = `${f.data.category}/${f.data.test}`;
    const expectedId = `${f.data.category}__${f.data.test}`;
    if (f.id !== expectedId) {
      throw new Error(
        `[tests] Question file "${f.id}" must be named "${expectedId}.json" to match its category/test fields.`,
      );
    }
    if (byKey.has(key)) {
      throw new Error(
        `[tests] Duplicate question file for ${key}: "${f.id}" collides with "${byKey.get(key)!.id}".`,
      );
    }
    byKey.set(key, f);

    const t = getTest(f.data.category, f.data.test);
    if (!t) {
      throw new Error(`[tests] Question file "${f.id}" has no registry entry in src/data/tests.ts.`);
    }
    if (t.status !== 'live') {
      throw new Error(
        `[tests] Test ${key} has a question file but the registry marks it '${t.status}'.`,
      );
    }
    if (getCategory(f.data.category)?.status !== 'live') {
      throw new Error(
        `[tests] Category ${f.data.category} is not live but test ${f.data.test} has a question file.`,
      );
    }
  }

  return liveTests.map((t) => {
    const file = byKey.get(`${t.categorySlug}/${t.slug}`);
    if (!file) {
      throw new Error(
        `[tests] Registry marks ${t.categorySlug}/${t.slug} 'live' but no question file exists at src/content/tests/${t.categorySlug}__${t.slug}.json.`,
      );
    }
    return { params: { category: t.categorySlug, test: t.slug }, props: { test: t, file } };
  });
}

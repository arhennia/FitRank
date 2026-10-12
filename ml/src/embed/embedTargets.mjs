import { join } from "node:path";

import { validateCache, writeCache } from "./cache.mjs";
import { cacheKey } from "./manifest.mjs";

/**
 * Use the cache when it validates. Otherwise call embedAll once and write a new cache.
 * embedAll is not called for a valid cache.
 */
export async function ensureEmbeddings({ artifactRoot, expected, embedAll }) {
  const key = cacheKey(expected);
  const dir = join(artifactRoot, key);
  const existing = validateCache(dir, expected);
  if (existing.valid) {
    return {
      key,
      dir,
      newlyEmbedded: 0,
      reused: expected.count,
      inference: false,
      reasons: [],
    };
  }
  const vectors = await embedAll();
  if (!Array.isArray(vectors) || vectors.length !== expected.ids.length) {
    throw new Error(`Embedder returned ${vectors ? vectors.length : 0} vectors for ${expected.ids.length} ids`);
  }
  const { ids, ...stored } = expected;
  const manifest = {
    ...stored,
    createdAt: new Date().toISOString(),
    gitCommit: expected.gitCommit ?? null,
  };
  writeCache(dir, { manifest, ids, vectors });
  const written = validateCache(dir, expected);
  if (!written.valid) {
    throw new Error(`Wrote a cache that failed validation: ${written.reasons.join("; ")}`);
  }
  return {
    key,
    dir,
    newlyEmbedded: expected.ids.length,
    reused: 0,
    inference: true,
    reasons: existing.reasons,
  };
}

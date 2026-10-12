import { contentSimilarity } from "./similarity.js";
import { MMR_LAMBDA } from "./weights.js";

/** Higher score first. Equal scores break by id so input order cannot matter. */
export function rankByRelevance(results) {
  return [...results].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.product.id).localeCompare(String(b.product.id));
  });
}

/**
 * Maximal marginal relevance over an already eligible set.
 * MMR(d) = λ * relevance - (1 - λ) * max similarity to an item already chosen.
 * λ = 1 is exactly the relevance order. Similarity here is style similarity,
 * not a duplicate decision. The loop stops when the pool is empty.
 */
export function rerankMMR(results, { lambda = MMR_LAMBDA } = {}) {
  if (lambda === 1) return rankByRelevance(results);
  const pool = [...results];
  const selected = [];

  while (pool.length > 0) {
    let bestIndex = 0;
    let bestKey = null;

    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      const relevance = candidate.score / 100;
      let redundancy = 0;
      for (const chosen of selected) {
        const similarity = contentSimilarity(candidate.product, chosen.product).score;
        if (similarity > redundancy) redundancy = similarity;
      }
      const mmr = lambda * relevance - (1 - lambda) * redundancy;
      const key = { mmr, relevance, id: String(candidate.product.id), index };
      if (
        bestKey == null
        || key.mmr > bestKey.mmr + 1e-12
        || (Math.abs(key.mmr - bestKey.mmr) <= 1e-12 && key.relevance > bestKey.relevance)
        || (
          Math.abs(key.mmr - bestKey.mmr) <= 1e-12
          && key.relevance === bestKey.relevance
          && key.id.localeCompare(bestKey.id) < 0
        )
      ) {
        bestKey = key;
        bestIndex = index;
      }
    }

    selected.push(pool.splice(bestIndex, 1)[0]);
  }

  return selected;
}

import { contentSimilarity } from "./similarity.js";

function gain(relevance) {
  return 2 ** relevance - 1;
}

/** Relevant hits in the top K, divided by K. Null when nothing was recommended. */
export function precisionAtK(recommendedIds, relevantIds, k) {
  if (!Array.isArray(recommendedIds) || recommendedIds.length === 0) return null;
  const relevant = new Set(relevantIds || []);
  const hits = recommendedIds.slice(0, k).filter((id) => relevant.has(id)).length;
  return hits / k;
}

/**
 * Relevant hits in the top K, divided by the number of relevant items.
 * Null when nothing was recommended or there is no relevant item.
 */
export function recallAtK(recommendedIds, relevantIds, k) {
  if (!Array.isArray(recommendedIds) || recommendedIds.length === 0) return null;
  const relevant = [...new Set(relevantIds || [])];
  if (relevant.length === 0) return null;
  const hit = new Set(recommendedIds.slice(0, k));
  return relevant.filter((id) => hit.has(id)).length / relevant.length;
}

/**
 * NDCG@K with gains 2^rel - 1 and discount log2(rank + 1).
 * Null when the list is empty or the ideal DCG is 0.
 */
export function ndcgAtK(recommendedIds, grades, k) {
  if (!Array.isArray(recommendedIds) || recommendedIds.length === 0) return null;
  const table = grades || {};
  const rels = recommendedIds.slice(0, k).map((id) => table[id] ?? 0);
  const dcg = rels.reduce((sum, relevance, index) => sum + gain(relevance) / Math.log2(index + 2), 0);
  const ideal = Object.values(table)
    .filter((relevance) => relevance > 0)
    .sort((a, b) => b - a)
    .slice(0, k);
  const idcg = ideal.reduce((sum, relevance, index) => sum + gain(relevance) / Math.log2(index + 2), 0);
  if (idcg === 0) return null;
  return dcg / idcg;
}

export function catalogueCoverage(idLists, catalogueSize) {
  if (!catalogueSize) return null;
  const seen = new Set();
  for (const list of idLists || []) {
    for (const id of list || []) seen.add(id);
  }
  return seen.size / catalogueSize;
}

/** Mean pairwise (1 - content similarity) in the top K. Null below two items. */
export function intraListDiversity(products, k) {
  const slice = (products || []).slice(0, k);
  if (slice.length < 2) return null;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < slice.length; i += 1) {
    for (let j = i + 1; j < slice.length; j += 1) {
      sum += 1 - contentSimilarity(slice[i], slice[j]).score;
      pairs += 1;
    }
  }
  return pairs === 0 ? null : sum / pairs;
}

/** Share of recommended rows that fail the hard gates. Null for an empty list. */
export function violationRate(recommendedProducts, prefs, violates) {
  if (!Array.isArray(recommendedProducts) || recommendedProducts.length === 0) return null;
  const bad = recommendedProducts.filter((product) => violates(product, prefs)).length;
  return bad / recommendedProducts.length;
}

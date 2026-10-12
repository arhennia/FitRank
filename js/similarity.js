import { generateCandidates } from "./candidates.js";
import { validatePreferences } from "./validate.js";
import { SIMILARITY_WEIGHTS } from "./weights.js";

function tokens(value) {
  if (!Array.isArray(value)) return null;
  const list = value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return list;
}

function colourSet(product) {
  if (Array.isArray(product.colours)) return tokens(product.colours);
  if (typeof product.colour === "string" && product.colour.trim()) {
    return [product.colour.trim().toLowerCase()];
  }
  return null;
}

function materialSet(product) {
  if (typeof product.material === "string" && product.material.trim()) {
    return [product.material.trim().toLowerCase()];
  }
  return null;
}

function textToken(value) {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  return token || null;
}

function categoryToken(product) {
  if (typeof product.category !== "string") return null;
  const token = product.category.trim();
  return token || null;
}

function ratingOrNull(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
  return rating;
}

function jaccard(left, right) {
  if (left == null || right == null) return 0;
  if (left.length === 0 || right.length === 0) return 0;
  const a = new Set(left);
  const b = new Set(right);
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

/**
 * Weighted attribute similarity in [0, 1].
 * A missing feature scores 0 and its weight stays in the denominator.
 * A perfect score means the attribute vectors match. It does not mean the
 * two rows are duplicate listings.
 */
export function contentSimilarity(left, right) {
  const features = [
    {
      key: "category",
      similarity: categoryToken(left) != null && categoryToken(left) === categoryToken(right) ? 1 : 0,
    },
    { key: "style", similarity: jaccard(tokens(left.styles), tokens(right.styles)) },
    { key: "colour", similarity: jaccard(colourSet(left), colourSet(right)) },
    { key: "material", similarity: jaccard(materialSet(left), materialSet(right)) },
    {
      key: "silhouette",
      similarity: textToken(left.silhouette) != null && textToken(left.silhouette) === textToken(right.silhouette) ? 1 : 0,
    },
    { key: "occasion", similarity: jaccard(tokens(left.occasions), tokens(right.occasions)) },
    {
      key: "comfort",
      similarity: (() => {
        const a = ratingOrNull(left.comfortRating);
        const b = ratingOrNull(right.comfortRating);
        if (a == null || b == null) return 0;
        return 1 - Math.abs(a - b) / 4;
      })(),
    },
  ];

  let totalWeight = 0;
  let weighted = 0;
  const detailed = features.map((feature) => {
    const weight = SIMILARITY_WEIGHTS[feature.key];
    const contribution = weight * feature.similarity;
    totalWeight += weight;
    weighted += contribution;
    return { ...feature, weight, contribution };
  });

  const score = totalWeight === 0 ? 0 : weighted / totalWeight;
  detailed.sort((a, b) => b.contribution - a.contribution || a.key.localeCompare(b.key));
  return { score, features: detailed };
}

export function rankBySimilarity(items) {
  return [...items].sort((a, b) => {
    if (b.similarity.score !== a.similarity.score) return b.similarity.score - a.similarity.score;
    return String(a.product.id).localeCompare(String(b.product.id));
  });
}

/**
 * Related items for a source product. The source is excluded.
 * Hard constraints still apply, so an ineligible neighbour is not returned.
 */
export function similarProducts(products, sourceId, rawPrefs, k = 5) {
  const list = Array.isArray(products) ? products : [];
  const source = list.find((product) => product && product.id === sourceId);
  if (!source) return [];
  const validation = validatePreferences(rawPrefs);
  if (!validation.ok) return [];
  const { candidates } = generateCandidates(list, validation.value);
  const ranked = rankBySimilarity(
    candidates
      .filter((product) => product.id !== sourceId)
      .map((product) => ({ product, similarity: contentSimilarity(product, source) })),
  );
  return ranked.slice(0, k);
}

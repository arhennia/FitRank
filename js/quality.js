import { BAYES_M, PRIOR_FALLBACK } from "./weights.js";

export function isValidRating(rating) {
  return Number.isFinite(rating) && rating >= 1 && rating <= 5;
}

export function isValidCount(count) {
  return Number.isInteger(count) && count >= 0;
}

/**
 * Bayesian average of a synthetic rating aggregate.
 * smoothed = (n / (n + m)) * rating + (m / (n + m)) * prior
 * A count of 0 with a valid rating returns the prior. Invalid inputs do not
 * invent a score. This is not review sentiment.
 */
export function smoothedRating({ rating, count, prior, m = BAYES_M } = {}) {
  const numericRating = Number(rating);
  const numericCount = typeof count === "number" ? count : Number(count);
  const numericPrior = Number(prior);
  const numericM = Number(m);
  if (!isValidRating(numericRating) || !isValidCount(numericCount)) {
    return { ok: false, value: null };
  }
  if (!Number.isFinite(numericPrior) || !Number.isFinite(numericM) || numericM < 0) {
    return { ok: false, value: null };
  }
  const n = numericCount;
  const value = (n / (n + numericM)) * numericRating + (numericM / (n + numericM)) * numericPrior;
  return { ok: true, value };
}

/** Review-count-weighted mean of valid ratings. Falls back when none exist. */
export function cataloguePrior(products, fallback = PRIOR_FALLBACK) {
  let weighted = 0;
  let total = 0;
  for (const product of Array.isArray(products) ? products : []) {
    if (!product) continue;
    const rating = Number(product.averageRating);
    const count = product.reviewCount;
    if (!isValidRating(rating) || !isValidCount(count) || count === 0) continue;
    weighted += count * rating;
    total += count;
  }
  if (total === 0) return fallback;
  return weighted / total;
}

/** Map a smoothed 1–5 rating onto 0–1. Missing estimates stay at 0, not 1. */
export function qualityComponent(smoothed) {
  if (!Number.isFinite(smoothed)) return 0;
  return Math.min(1, Math.max(0, (smoothed - 1) / 4));
}

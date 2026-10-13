/**
 * Section 6 retrieval metrics.
 * Relevance is 1 for a class match and 0 otherwise.
 * R_q is the number of relevant items in the pool, not the number retrieved.
 * Ranks are 1-based. A missing rank is not relevant. Precision divides by K.
 */
import { cosine } from "../vector.js";

function hitsAt(relevance, k) {
  const limit = Math.min(k, relevance.length);
  let hits = 0;
  for (let index = 0; index < limit; index += 1) {
    if (relevance[index] === 1) hits += 1;
  }
  return hits;
}

/** Fraction of the top K that is relevant. An empty or short list still divides by K. */
export function precisionAtK(relevance, k) {
  if (!Number.isInteger(k) || k <= 0) throw new Error("K must be a positive integer");
  return hitsAt(relevance, k) / k;
}

/** Relevant hits in the top K, divided by R_q. Null when the pool has no relevant item. */
export function recallAtK(relevance, k, relevantInPool) {
  if (!Number.isInteger(k) || k <= 0) throw new Error("K must be a positive integer");
  if (!Number.isInteger(relevantInPool) || relevantInPool < 0) throw new Error("R_q must be a non-negative integer");
  if (relevantInPool === 0) return null;
  return hitsAt(relevance, k) / relevantInPool;
}

/** Precision at R_q. Null when the pool has no relevant item. */
export function rPrecision(relevance, relevantInPool) {
  if (!Number.isInteger(relevantInPool) || relevantInPool < 0) throw new Error("R_q must be a non-negative integer");
  if (relevantInPool === 0) return null;
  return precisionAtK(relevance, relevantInPool);
}

/** 1 when any relevant item is in the top K. */
export function hitAtK(relevance, k) {
  if (!Number.isInteger(k) || k <= 0) throw new Error("K must be a positive integer");
  return hitsAt(relevance, k) > 0 ? 1 : 0;
}

/** 1 / rank of the first relevant item. 0 when the list has none. */
export function reciprocalRank(relevance) {
  for (let index = 0; index < relevance.length; index += 1) {
    if (relevance[index] === 1) return 1 / (index + 1);
  }
  return 0;
}

function dcgOf(binary, count) {
  let sum = 0;
  for (let index = 0; index < count; index += 1) {
    if (binary[index] === 1) sum += 1 / Math.log2(index + 2);
  }
  return sum;
}

/** Sum of rel_i / log2(rank + 1) over the top K. */
export function dcgAtK(relevance, k) {
  if (!Number.isInteger(k) || k <= 0) throw new Error("K must be a positive integer");
  return dcgOf(relevance, Math.min(k, relevance.length));
}

/**
 * DCG@K divided by the ideal DCG of min(K, R_q) ones.
 * Null when R_q is 0. An empty retrieved list with R_q > 0 scores 0.
 */
export function ndcgAtK(relevance, k, relevantInPool) {
  if (!Number.isInteger(k) || k <= 0) throw new Error("K must be a positive integer");
  if (!Number.isInteger(relevantInPool) || relevantInPool < 0) throw new Error("R_q must be a non-negative integer");
  if (relevantInPool === 0) return null;
  const idealCount = Math.min(k, relevantInPool);
  const ideal = dcgOf(Array.from({ length: idealCount }, () => 1), idealCount);
  if (ideal === 0) return null;
  return dcgOf(relevance, Math.min(k, relevance.length)) / ideal;
}

/** Size of the union of top-K ids, divided by the catalogue size. */
export function coverageAtK(idLists, catalogueSize, k) {
  if (!Number.isInteger(catalogueSize) || catalogueSize <= 0) return null;
  if (!Number.isInteger(k) || k <= 0) throw new Error("K must be a positive integer");
  const seen = new Set();
  for (const list of idLists || []) {
    const limit = Math.min(k, list.length);
    for (let index = 0; index < limit; index += 1) seen.add(list[index]);
  }
  return seen.size / catalogueSize;
}

/** 1 minus the mean pairwise cosine. Null when fewer than two vectors are usable. */
export function intraListDiversity(vectors) {
  const usable = [];
  for (const vector of vectors || []) {
    if (vector && typeof vector.length === "number" && vector.length > 0) usable.push(vector);
  }
  if (usable.length < 2) return null;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < usable.length; i += 1) {
    for (let j = i + 1; j < usable.length; j += 1) {
      const similarity = cosine(usable[i], usable[j]);
      if (similarity == null) continue;
      sum += 1 - similarity;
      pairs += 1;
    }
  }
  return pairs === 0 ? null : sum / pairs;
}

export function distinctCount(labels) {
  return new Set(labels || []).size;
}

/** Returned items that fail an active gate, divided by returned items. Null when nothing was returned. */
export function violationRate(failedFlags) {
  if (!Array.isArray(failedFlags) || failedFlags.length === 0) return null;
  let failed = 0;
  for (const flag of failedFlags) if (flag) failed += 1;
  return failed / failedFlags.length;
}

/**
 * Unweighted mean of per-class means.
 * A null or non-finite value is left out of its class. A class with no finite values is left out.
 */
export function macroAverage(rows, valueOf, classOf) {
  const groups = new Map();
  for (const row of rows || []) {
    const value = valueOf(row);
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const name = classOf(row);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(value);
  }
  if (groups.size === 0) return null;
  let sum = 0;
  for (const values of groups.values()) {
    let inner = 0;
    for (const value of values) inner += value;
    sum += inner / values.length;
  }
  return sum / groups.size;
}

/** Linear interpolation. sorted is ascending. Null for an empty list. */
export function percentile(sorted, p) {
  if (!sorted || sorted.length === 0) return null;
  if (p < 0 || p > 1) throw new Error("percentile p must be between 0 and 1");
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function percentileRank(values, p) {
  const sorted = (values || []).filter((value) => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b);
  return percentile(sorted, p);
}

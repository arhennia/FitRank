import { RANDOM_SEED } from "./retrievalProtocol.js";

/** L2-normalized copy. Null when the vector is empty or has no magnitude. */
export function l2Normalize(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  let square = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) return null;
    square += value * value;
  }
  const scale = Math.sqrt(square);
  if (!Number.isFinite(scale) || scale === 0) return null;
  return values.map((value) => value / scale);
}

function vectorLength(vector) {
  if (Array.isArray(vector) || ArrayBuffer.isView(vector)) return vector.length;
  return -1;
}

/** Dot product. Callers pass L2-normalized vectors when they want cosine. */
export function cosine(left, right) {
  const length = vectorLength(left);
  if (length <= 0 || length !== vectorLength(right)) return null;
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (!Number.isFinite(left[index]) || !Number.isFinite(right[index])) return null;
    sum += left[index] * right[index];
  }
  return sum;
}

export function rankByScore(rows) {
  return [...rows].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return String(left.id).localeCompare(String(right.id));
  });
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text) {
  let hash = RANDOM_SEED >>> 0;
  const source = String(text);
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

/** Deterministic scores in [0, 1). Input order does not change the result. */
export function randomScores(ids, queryId) {
  const ordered = [...ids].map(String).sort((left, right) => left.localeCompare(right));
  const random = mulberry32(hashSeed(`${RANDOM_SEED}:${queryId}`));
  const scores = new Map();
  for (const id of ordered) scores.set(id, random());
  return scores;
}

/** Mean pairwise (1 - cosine). Null when fewer than two vectors are present. */
export function meanPairwiseDiversity(vectors) {
  const usable = (vectors || []).filter((vector) => Array.isArray(vector) || ArrayBuffer.isView(vector));
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

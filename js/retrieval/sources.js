/**
 * Retrieval score sources. None of these load a model.
 * Lexical matching uses the class-name tokens only. There is no synonym table.
 */
import { cosine, l2Normalize } from "../vector.js";
import { dotProductTopK } from "./topK.js";

function tokenize(value) {
  return String(value ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function tagged(source, hits) {
  return { source, hits };
}

export function clipImageToImage(store, queryVector, options) {
  return tagged("clip-i2i", dotProductTopK(store, queryVector, options));
}

export function clipTextToImage(store, queryVector, options) {
  return tagged("clip-t2i", dotProductTopK(store, queryVector, options));
}

function pixelVector(values, variant) {
  if (!ArrayBuffer.isView(values) && !Array.isArray(values)) return null;
  const data = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    if (!Number.isFinite(value)) return null;
    data.push(value);
  }
  if (data.length === 0) return null;
  if (variant === "mean-centered") {
    let mean = 0;
    for (const value of data) mean += value;
    mean /= data.length;
    for (let index = 0; index < data.length; index += 1) data[index] -= mean;
  } else if (variant !== "raw") {
    throw new Error(`Unknown pixel variant ${variant}`);
  }
  return l2Normalize(data);
}

/** Cosine of pixel vectors. variant is "raw" or "mean-centered". Null when a vector has no magnitude. */
export function pixelCosine(left, right, variant = "raw") {
  return cosine(pixelVector(left, variant), pixelVector(right, variant));
}

/**
 * Fraction of class-name tokens that appear in the query.
 * An empty query or an empty label scores 0. Tokens are exact, with no synonyms.
 */
export function lexicalClassScore(query, className) {
  const queryTokens = new Set(tokenize(query));
  const labelTokens = tokenize(className);
  if (queryTokens.size === 0 || labelTokens.length === 0) return 0;
  let hits = 0;
  for (const token of labelTokens) {
    if (queryTokens.has(token)) hits += 1;
  }
  return hits / labelTokens.length;
}

export function lexicalClassScores(query, items) {
  return (items || []).map((item) => ({
    id: item.id,
    score: lexicalClassScore(query, item.rawLabel ?? item.className ?? ""),
    source: "lexical",
  }));
}

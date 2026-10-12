import { DECLARED_LISTING_FIELDS, NAME_COSINE_THRESHOLD } from "./retrievalProtocol.js";

export const DUPLICATE_LABELS = [
  "probable_duplicate",
  "attribute_conflict",
  "similar_style",
  "unrelated",
];

export function normalizeName(name) {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Pair decision from the listing name and the declared attribute fields.
 * Seller copy and the hidden catalogue key are not read. A category mismatch is unrelated,
 * so a conflict that disagrees only on category is not detected.
 * Exact identity is normalized name equality. CLIP identity is name cosine
 * at the frozen threshold. Neither threshold is searched on the labelled pairs.
 */
export function decidePair(left, right, options = {}) {
  const fields = options.fields || DECLARED_LISTING_FIELDS;
  const identity = options.identity === "clip" ? "clip" : "exact";
  const threshold = Number.isFinite(options.threshold) ? options.threshold : NAME_COSINE_THRESHOLD;
  if (!left || !right || typeof left.category !== "string" || typeof right.category !== "string") {
    return { ok: false, error: "Both listings need a category." };
  }
  if (left.category !== right.category) {
    return { ok: true, label: "unrelated", identity: false };
  }
  let sameName = false;
  if (identity === "clip") {
    if (!Number.isFinite(options.nameCosine)) {
      return { ok: false, error: "CLIP name similarity is missing." };
    }
    sameName = options.nameCosine >= threshold;
  } else {
    const name = normalizeName(left.name);
    sameName = name !== "" && name === normalizeName(right.name);
  }
  if (!sameName) return { ok: true, label: "similar_style", identity: false };
  const agree = fields.every((field) => left[field] === right[field]);
  return {
    ok: true,
    label: agree ? "probable_duplicate" : "attribute_conflict",
    identity: true,
  };
}

export function scoreDecisions(pairs) {
  const labels = DUPLICATE_LABELS;
  const perLabel = {};
  for (const label of labels) {
    const gold = pairs.filter((pair) => pair.label === label).length;
    const predicted = pairs.filter((pair) => pair.predicted === label).length;
    const hits = pairs.filter((pair) => pair.label === label && pair.predicted === label).length;
    perLabel[label] = {
      gold,
      predicted,
      hits,
      precision: predicted === 0 ? null : hits / predicted,
      recall: gold === 0 ? null : hits / gold,
    };
  }
  const scored = pairs.filter((pair) => pair.predicted);
  const correct = scored.filter((pair) => pair.predicted === pair.label).length;
  return {
    n: pairs.length,
    scored: scored.length,
    correct,
    accuracy: pairs.length === 0 ? null : correct / pairs.length,
    perLabel,
    warning: "The labelled set has 13 pairs and no held-out split. Accuracy on 13 pairs is not a reliable estimate.",
  };
}

import {
  DIVERSITY_LAMBDA,
  DIVERSITY_POOL,
  HYBRID_SIGNAL_WEIGHT,
  SCORE_DEFINITION,
} from "./retrievalProtocol.js";
import { cosine, rankByScore } from "./vector.js";

export { SCORE_DEFINITION };

/**
 * Combine the query signals that exist. See SCORE_DEFINITION.
 * imageVector and textVector are query embeddings. The candidate vector is
 * its image embedding. A null cosine omits that signal for this candidate.
 */
export function hybridScore(query, candidateVector) {
  const terms = [];
  if (query?.imageVector) {
    const value = cosine(query.imageVector, candidateVector);
    if (value != null) terms.push({ name: "image", weight: HYBRID_SIGNAL_WEIGHT.image, value });
  }
  if (query?.textVector) {
    const value = cosine(query.textVector, candidateVector);
    if (value != null) terms.push({ name: "text", weight: HYBRID_SIGNAL_WEIGHT.text, value });
  }
  if (!query?.imageVector && !query?.textVector) {
    return { ok: false, error: "A text query or an inspiration image is required." };
  }
  if (terms.length === 0) return { ok: false, error: "The candidate has no usable image embedding." };
  const weight = terms.reduce((sum, term) => sum + term.weight, 0);
  const score = terms.reduce((sum, term) => sum + term.weight * term.value, 0) / weight;
  const signals = {};
  for (const term of terms) signals[term.name] = term.value;
  return { ok: true, score, signals };
}

export function activeQuerySignals(query) {
  const names = [];
  if (query?.imageVector) names.push("image");
  if (query?.textVector) names.push("text");
  return names;
}

/**
 * Score candidates that have an image embedding. Candidates without one are
 * counted and omitted. They are not given a zero.
 */
export function scoreCandidates(candidates, query, imageVectors) {
  const active = activeQuerySignals(query);
  if (active.length === 0) {
    return { ok: false, error: "A text query or an inspiration image is required.", rows: [] };
  }
  const rows = [];
  let omitted = 0;
  for (const candidate of candidates) {
    const vector = imageVectors.get(candidate.id);
    if (!vector) {
      omitted += 1;
      continue;
    }
    const scored = hybridScore(query, vector);
    if (!scored.ok) {
      omitted += 1;
      continue;
    }
    rows.push({
      id: candidate.id,
      product: candidate,
      score: scored.score,
      signals: scored.signals,
    });
  }
  if (rows.length === 0) {
    return {
      ok: false,
      error: "No candidate has a usable image embedding.",
      rows: [],
      omitted,
    };
  }
  return { ok: true, rows, omitted, activeSignals: active };
}

/**
 * MMR over image embeddings. lambda 1 matches score-then-id order.
 * Redundancy uses image-embedding cosine, not attribute similarity.
 */
export function diversify(rows, imageVectors, lambda = DIVERSITY_LAMBDA) {
  if (lambda === 1) return rankByScore(rows);
  const pool = [...rows];
  const selected = [];
  while (pool.length > 0) {
    let bestIndex = 0;
    let best = null;
    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[index];
      const vector = imageVectors.get(candidate.id);
      let redundancy = 0;
      for (const chosen of selected) {
        const similarity = cosine(vector, imageVectors.get(chosen.id));
        if (similarity != null && similarity > redundancy) redundancy = similarity;
      }
      const mmr = lambda * candidate.score - (1 - lambda) * redundancy;
      const key = { mmr, score: candidate.score, id: String(candidate.id) };
      if (
        best == null
        || key.mmr > best.mmr + 1e-12
        || (Math.abs(key.mmr - best.mmr) <= 1e-12 && key.score > best.score)
        || (
          Math.abs(key.mmr - best.mmr) <= 1e-12
          && key.score === best.score
          && key.id.localeCompare(best.id) < 0
        )
      ) {
        best = key;
        bestIndex = index;
      }
    }
    selected.push(pool.splice(bestIndex, 1)[0]);
  }
  return selected;
}

export function orderCandidates(rows, imageVectors, ranking) {
  if (ranking !== "diverse") return { rows: rankByScore(rows), diversityPoolExcluded: 0 };
  const ranked = rankByScore(rows);
  const pool = ranked.slice(0, DIVERSITY_POOL);
  return {
    rows: diversify(pool, imageVectors, DIVERSITY_LAMBDA),
    diversityPoolExcluded: Math.max(0, ranked.length - pool.length),
  };
}

export function explainRetrieval(row, constraintReport) {
  const reasons = [];
  const signals = row.signals || {};
  if (Number.isFinite(signals.image)) reasons.push(`Image similarity ${signals.image.toFixed(3)}.`);
  if (Number.isFinite(signals.text)) reasons.push(`Text similarity ${signals.text.toFixed(3)}.`);
  const used = Object.keys(signals);
  if (used.length > 0) {
    reasons.push(`Combined score ${row.score.toFixed(3)} from ${used.join(" and ")}.`);
  }
  const removed = constraintReport?.removed || {};
  if (removed.wrongCategory > 0) {
    reasons.push(`Category removed ${removed.wrongCategory} other images before scoring.`);
  }
  if (removed.overBudget > 0) reasons.push(`Budget removed ${removed.overBudget} images before scoring.`);
  if (removed.unavailable > 0) reasons.push(`Availability removed ${removed.unavailable} images before scoring.`);
  if (removed.wrongSize > 0) reasons.push(`Size removed ${removed.wrongSize} images before scoring.`);
  return reasons;
}

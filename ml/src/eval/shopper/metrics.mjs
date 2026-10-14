/**
 * Graded shopper metrics. Relevance grades are 0, 1, or 2.
 * These functions do not read judgment files.
 */
import { intraListDiversity } from "../../../../js/metrics.js";
import { bootstrapStatistic } from "../../../../js/retrieval/bootstrap.js";

function gain(grade) {
  const value = Number(grade);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return 2 ** value - 1;
}

export function dcgAtK(grades, k) {
  const limit = Math.min(k, grades.length);
  let sum = 0;
  for (let index = 0; index < limit; index += 1) {
    sum += gain(grades[index]) / Math.log2(index + 2);
  }
  return sum;
}

export function ndcgAtK(grades, k, idealGrades = null) {
  if (!Number.isInteger(k) || k <= 0) throw new Error("K must be a positive integer");
  const ideal = [...(idealGrades || grades)].map((grade) => Number(grade) || 0).sort((left, right) => right - left);
  const idealDcg = dcgAtK(ideal, k);
  if (idealDcg === 0) return null;
  return dcgAtK(grades, k) / idealDcg;
}

/** Share of the top K graded acceptable or better. Short lists still divide by K. */
export function precisionAtK(grades, k, minimum = 1) {
  if (!Number.isInteger(k) || k <= 0) throw new Error("K must be a positive integer");
  const limit = Math.min(k, grades.length);
  let hits = 0;
  for (let index = 0; index < limit; index += 1) {
    if (Number(grades[index]) >= minimum) hits += 1;
  }
  return hits / k;
}

export function kendallTau(left, right) {
  const ids = [...new Set([...(left || []), ...(right || [])])];
  const rank = (list, id) => {
    const index = list.indexOf(id);
    return index === -1 ? list.length : index;
  };
  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const leftSign = Math.sign(rank(left, ids[i]) - rank(left, ids[j]));
      const rightSign = Math.sign(rank(right, ids[i]) - rank(right, ids[j]));
      if (leftSign === 0 || rightSign === 0) continue;
      if (leftSign === rightSign) concordant += 1;
      else discordant += 1;
    }
  }
  const total = concordant + discordant;
  return total === 0 ? null : (concordant - discordant) / total;
}

/** Share of the longer top-K set that also appears in the other. Identical short lists score 1. */
export function topOverlap(left, right, k = 5) {
  const a = new Set((left || []).slice(0, k));
  const b = new Set((right || []).slice(0, k));
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const id of a) if (b.has(id)) shared += 1;
  return shared / Math.max(a.size, b.size);
}

export function listDiversity(products, k = 5) {
  return intraListDiversity(products, k);
}

export function meanMetric(rows, read) {
  const values = rows.map(read).filter((value) => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function personaBootstrap(rows, read, options = {}) {
  return bootstrapStatistic(rows, (sample) => meanMetric(sample, read), {
    samples: 1000,
    seed: 20261014,
    ...options,
  });
}

/**
 * Fuse aligned score columns and order the ids.
 * Z-score and RRF follow fuse.js, including the population standard deviation and RRF k.
 * Lambda 1 keeps fused-score order. A lower lambda reranks the top pool with MMR and leaves the tail in fused-score order.
 */
import { RRF_K } from "./fuse.js";
import { mmrSelect } from "./mmr.js";

function signalNames(weights) {
  return Object.keys(weights || {}).filter((name) => {
    const weight = weights[name];
    return typeof weight === "number" && Number.isFinite(weight) && weight > 0;
  });
}

function compareIds(left, right) {
  return String(left).localeCompare(String(right));
}

export function fuseSignalScores(ids, columns, weights, method) {
  const names = signalNames(weights);
  if (names.length === 0) throw new Error("At least one positive signal weight is required");
  const count = ids.length;
  for (const name of names) {
    const column = columns[name];
    if (!column || column.length !== count) throw new Error(`Signal ${name} does not match the id list`);
  }
  const scores = new Float64Array(count);
  if (method === "zscore") {
    const moments = {};
    for (const name of names) {
      const column = columns[name];
      let mean = 0;
      for (let index = 0; index < count; index += 1) mean += column[index];
      mean /= count;
      let square = 0;
      for (let index = 0; index < count; index += 1) {
        const delta = column[index] - mean;
        square += delta * delta;
      }
      moments[name] = { mean, stdev: Math.sqrt(square / count) };
    }
    let weightSum = 0;
    for (const name of names) weightSum += weights[name];
    for (let index = 0; index < count; index += 1) {
      let sum = 0;
      for (const name of names) {
        const { mean, stdev } = moments[name];
        const z = stdev === 0 ? 0 : (columns[name][index] - mean) / stdev;
        sum += weights[name] * z;
      }
      scores[index] = sum / weightSum;
    }
    return scores;
  }
  if (method !== "rrf") throw new Error(`Unknown fusion method ${method}`);
  const ranks = {};
  for (const name of names) {
    const column = columns[name];
    const order = Array.from({ length: count }, (_, index) => index);
    order.sort((left, right) => {
      if (column[right] !== column[left]) return column[right] - column[left];
      return compareIds(ids[left], ids[right]);
    });
    const rank = new Float64Array(count);
    for (let place = 0; place < order.length; place += 1) rank[order[place]] = place + 1;
    ranks[name] = rank;
  }
  for (let index = 0; index < count; index += 1) {
    let sum = 0;
    for (const name of names) sum += weights[name] / (RRF_K + ranks[name][index]);
    scores[index] = sum;
  }
  return scores;
}

function orderByScore(ids, scores) {
  const order = Array.from({ length: ids.length }, (_, index) => index);
  order.sort((left, right) => {
    if (scores[right] !== scores[left]) return scores[right] - scores[left];
    return compareIds(ids[left], ids[right]);
  });
  return order;
}

/**
 * ids and each column are aligned.
 * vectors is a Map from id to an embedding, used only when lambda is below 1.
 * Returns the full order as ids. Callers slice it for K and for R-precision.
 */
export function rankFromSignals(ids, columns, { weights, method = "zscore", lambda = 1, vectors = null, mmrPool = 50 } = {}) {
  if (!Array.isArray(ids)) throw new Error("ids must be an array");
  if (typeof lambda !== "number" || lambda < 0 || lambda > 1) throw new Error("lambda must be between 0 and 1");
  const scores = fuseSignalScores(ids, columns, weights, method);
  const order = orderByScore(ids, scores);
  if (lambda === 1 || order.length === 0) return order.map((index) => ids[index]);
  const pool = Math.min(mmrPool, order.length);
  const head = order.slice(0, pool).map((index) => ({ id: ids[index], score: scores[index] }));
  const reranked = mmrSelect(head, vectors || new Map(), lambda);
  const seen = new Set(reranked.map((row) => row.id));
  const tail = [];
  for (const index of order) {
    const id = ids[index];
    if (!seen.has(id)) tail.push(id);
  }
  return reranked.map((row) => row.id).concat(tail);
}

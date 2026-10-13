/**
 * Query-level bootstrap. Each resample draws queries with replacement.
 * The same draw is used for every system in a paired comparison.
 */
import { mulberry32 } from "../vector.js";
import { percentile } from "./metrics.js";

export function bootstrapStatistic(rows, statistic, { samples = 1000, seed = 20261012, random = null } = {}) {
  if (!Array.isArray(rows)) throw new Error("bootstrap rows must be an array");
  if (typeof statistic !== "function") throw new Error("bootstrap statistic is required");
  if (!Number.isInteger(samples) || samples <= 0) throw new Error("bootstrap samples must be a positive integer");
  const next = random || mulberry32(seed >>> 0);
  const count = rows.length;
  const replicates = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const drawn = new Array(count);
    for (let index = 0; index < count; index += 1) drawn[index] = rows[Math.floor(next() * count)];
    replicates.push(statistic(drawn));
  }
  const finite = replicates.filter((value) => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b);
  return {
    point: statistic(rows),
    low: percentile(finite, 0.025),
    high: percentile(finite, 0.975),
    samples,
    seed: random ? null : seed >>> 0,
  };
}

/** Paired difference statistic(left) - statistic(right) on identical query draws. */
export function pairedBootstrap(left, right, statistic, options) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    throw new Error("paired bootstrap series must have the same length");
  }
  const joined = left.map((row, index) => ({ left: row, right: right[index] }));
  return bootstrapStatistic(joined, (rows) => {
    const leftValue = statistic(rows.map((row) => row.left));
    const rightValue = statistic(rows.map((row) => row.right));
    if (leftValue == null || rightValue == null) return null;
    return leftValue - rightValue;
  }, options);
}

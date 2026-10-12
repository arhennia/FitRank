/**
 * Fusion over a gate-eligible pool.
 * A missing signal is left out of that row and the remaining weights are renormalized.
 * Pools smaller than 30 rows use a stored mean and standard deviation.
 * RRF is the comparison method. It sums weighted reciprocal ranks and does not fill a missing list with zero.
 */

export const QUERY_ZSCORE_MIN_POOL = 30;
export const RRF_K = 60;

function signalNames(weights) {
  return Object.keys(weights || {}).filter((name) => {
    const weight = weights[name];
    return typeof weight === "number" && Number.isFinite(weight) && weight > 0;
  });
}

function finiteSignal(item, name) {
  const value = item?.signals?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function poolMoments(values) {
  const finite = [];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) finite.push(value);
  }
  if (finite.length === 0) return { count: 0, mean: null, stdev: null };
  let mean = 0;
  for (const value of finite) mean += value;
  mean /= finite.length;
  let square = 0;
  for (const value of finite) {
    const delta = value - mean;
    square += delta * delta;
  }
  return { count: finite.length, mean, stdev: Math.sqrt(square / finite.length) };
}

/**
 * Z-score finite values. The pool length decides the source of the mean and standard deviation.
 * values may contain null for missing signals. Those positions stay null.
 */
export function zScoreValues(values, poolSize, stored) {
  const finite = [];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) finite.push(value);
  }
  let mean;
  let stdev;
  let source;
  if (poolSize >= QUERY_ZSCORE_MIN_POOL) {
    const moments = poolMoments(finite);
    mean = moments.mean;
    stdev = moments.stdev;
    source = "query";
  } else if (
    stored
    && typeof stored.mean === "number"
    && Number.isFinite(stored.mean)
    && typeof stored.stdev === "number"
    && Number.isFinite(stored.stdev)
    && stored.stdev >= 0
  ) {
    mean = stored.mean;
    stdev = stored.stdev;
    source = "stored";
  } else {
    return {
      ok: false,
      error: "Pool has fewer than 30 rows and no stored mean and standard deviation.",
    };
  }
  const scored = values.map((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    if (stdev === 0 || stdev == null) return 0;
    return (value - mean) / stdev;
  });
  return { ok: true, values: scored, mean, stdev, source };
}

function rankSignal(items, name) {
  const ranked = [];
  for (const item of items) {
    const value = finiteSignal(item, name);
    if (value == null) continue;
    ranked.push({ id: item.id, value });
  }
  ranked.sort((left, right) => {
    if (right.value !== left.value) return right.value - left.value;
    return String(left.id).localeCompare(String(right.id));
  });
  const ranks = new Map();
  for (let index = 0; index < ranked.length; index += 1) ranks.set(ranked[index].id, index + 1);
  return ranks;
}

export function fuseWeighted(items, weights, storedStats = {}) {
  const list = items || [];
  const names = signalNames(weights);
  const columns = {};
  const normalization = {};
  for (const name of names) {
    const column = list.map((item) => finiteSignal(item, name));
    const scored = zScoreValues(column, list.length, storedStats?.[name]);
    if (!scored.ok) return scored;
    columns[name] = scored.values;
    normalization[name] = { mean: scored.mean, stdev: scored.stdev, source: scored.source };
  }
  const rows = list.map((item, index) => {
    let weight = 0;
    let sum = 0;
    const components = {};
    const signalsUsed = [];
    for (const name of names) {
      const value = columns[name][index];
      if (value == null) continue;
      weight += weights[name];
      sum += weights[name] * value;
      components[name] = value;
      signalsUsed.push(name);
    }
    if (weight === 0) {
      return { id: item.id, score: null, components, signalsUsed, omitted: true };
    }
    return { id: item.id, score: sum / weight, components, signalsUsed, omitted: false };
  });
  return { ok: true, method: "zscore", rows, normalization };
}

/** Reciprocal rank fusion. Rank 1 contributes 1 / (k + 1). A missing signal adds no term. */
export function fuseRrf(items, weights, k = RRF_K) {
  if (!Number.isFinite(k) || k < 0) throw new Error("RRF k must be a non-negative number");
  const list = items || [];
  const names = signalNames(weights);
  const ranks = {};
  for (const name of names) ranks[name] = rankSignal(list, name);
  const rows = list.map((item) => {
    let sum = 0;
    const components = {};
    const signalsUsed = [];
    for (const name of names) {
      const rank = ranks[name].get(item.id);
      if (rank == null) continue;
      const contribution = weights[name] / (k + rank);
      sum += contribution;
      components[name] = contribution;
      signalsUsed.push(name);
    }
    if (signalsUsed.length === 0) {
      return { id: item.id, score: null, components, signalsUsed, omitted: true };
    }
    return { id: item.id, score: sum, components, signalsUsed, omitted: false };
  });
  return { ok: true, method: "rrf", k, rows };
}

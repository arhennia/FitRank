/**
 * Validation selection, applied to numbers the harness has already computed.
 * The orders and the loss budget come from the pre-registered spec.
 */

function orderIndex(list, value, label) {
  const index = list.indexOf(value);
  if (index === -1) throw new Error(`${label} ${value} is not in the pre-registered order`);
  return index;
}

function compareTuple(left, right) {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return left.length - right.length;
}

function armKey(arm, spec) {
  return [
    orderIndex(spec.preprocessOrder, arm.preprocess, "preprocess"),
    orderIndex(spec.templateOrder, arm.promptTemplate, "template"),
    orderIndex(spec.fusionOrder, arm.fusion, "fusion"),
    orderIndex(spec.alphaOrder, arm.alpha, "alpha"),
  ];
}

/**
 * Highest macro NDCG@10 among selectable arms.
 * An exact tie uses the pre-registered order: preprocess, template, fusion, alpha.
 */
export function selectHybridArm(arms, spec) {
  const candidates = (arms || []).filter((arm) => arm.selectable === true);
  if (candidates.length === 0) throw new Error("No selectable validation arm");
  let best = candidates[0];
  for (const arm of candidates.slice(1)) {
    const ndcgDiff = arm.macroNdcg - best.macroNdcg;
    if (ndcgDiff > 0 || (ndcgDiff === 0 && compareTuple(armKey(arm, spec), armKey(best, spec)) < 0)) {
      best = arm;
    }
  }
  return best;
}

/**
 * Largest lambda with a positive intra-list diversity gain and NDCG@10 loss at or below the budget.
 * The lambda-1 row is the baseline. If no other lambda qualifies, the result is 1.
 */
export function selectLambda(points, spec) {
  const budget = spec.ndcgLossBudget;
  const baseline = (points || []).find((point) => point.lambda === 1);
  if (!baseline) throw new Error("Lambda sweep has no lambda 1 baseline");
  if (typeof baseline.macroNdcg !== "number" || typeof baseline.diversity !== "number") {
    return { lambda: 1, reason: "lambda 1 has no finite NDCG or diversity, so the sweep stays at 1" };
  }
  const eligible = [];
  for (const point of points) {
    if (point.lambda === 1) continue;
    if (!spec.lambdas.includes(point.lambda)) continue;
    if (typeof point.macroNdcg !== "number" || typeof point.diversity !== "number") continue;
    const loss = baseline.macroNdcg - point.macroNdcg;
    const gain = point.diversity - baseline.diversity;
    if (gain > 0 && loss <= budget) eligible.push({ ...point, loss, gain });
  }
  if (eligible.length === 0) {
    return {
      lambda: 1,
      reason: "no lambda improved intra-list diversity while keeping NDCG@10 loss at or below the budget",
      baselineNdcg: baseline.macroNdcg,
      baselineDiversity: baseline.diversity,
    };
  }
  eligible.sort((left, right) => right.lambda - left.lambda);
  const chosen = eligible[0];
  return {
    lambda: chosen.lambda,
    reason: "largest lambda with a diversity gain and NDCG@10 loss at or below the budget",
    loss: chosen.loss,
    gain: chosen.gain,
    baselineNdcg: baseline.macroNdcg,
    baselineDiversity: baseline.diversity,
    ndcg: chosen.macroNdcg,
    diversity: chosen.diversity,
  };
}

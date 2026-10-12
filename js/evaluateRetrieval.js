import { ndcgAtK, precisionAtK, recallAtK } from "./metrics.js";

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * A failure is an empty list, precision@K of 0, or a top-1 class other than
 * the query class. Fashion-MNIST class match is the label. It is not shopper relevance.
 */
export function summariseQueries(cases, k) {
  const precision = [];
  const recall = [];
  const ndcg = [];
  const diversity = [];
  const latency = [];
  const failures = [];
  let emptyQueries = 0;
  for (const row of cases) {
    const precisionAt = precisionAtK(row.ids, row.relevantIds, k);
    const recallAt = recallAtK(row.ids, row.relevantIds, k);
    const grades = Object.fromEntries((row.relevantIds || []).map((id) => [id, 1]));
    const ndcgAt = ndcgAtK(row.ids, grades, k);
    if (precisionAt == null) emptyQueries += 1;
    else precision.push(precisionAt);
    if (recallAt != null) recall.push(recallAt);
    if (ndcgAt != null) ndcg.push(ndcgAt);
    if (Number.isFinite(row.diversity)) diversity.push(row.diversity);
    if (Number.isFinite(row.latencyMs)) latency.push(row.latencyMs);
    const topClass = row.topClass ?? null;
    const failed = precisionAt == null || precisionAt === 0 || (topClass != null && topClass !== row.className);
    if (failed) {
      failures.push({
        queryId: row.queryId,
        className: row.className,
        precisionAtK: precisionAt,
        topClass,
        top: (row.top || []).slice(0, 5),
      });
    }
  }
  return {
    queries: cases.length,
    emptyQueries,
    precisionAtK: mean(precision),
    recallAtK: mean(recall),
    ndcgAtK: mean(ndcg),
    intraListDiversity: mean(diversity),
    meanLatencyMs: mean(latency),
    failureCount: failures.length,
    failures: failures.slice(0, 20),
  };
}

export function summariseByClass(cases, k) {
  const classes = [...new Set(cases.map((row) => row.className))];
  const perClass = {};
  for (const className of classes) {
    perClass[className] = summariseQueries(cases.filter((row) => row.className === className), k);
  }
  return perClass;
}

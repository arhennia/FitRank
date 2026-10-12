import { scoreProductBaseline } from "./baseline.js";
import { generateCandidates } from "./candidates.js";
import {
  catalogueCoverage,
  intraListDiversity,
  ndcgAtK,
  precisionAtK,
  violationRate,
} from "./metrics.js";
import { rankByRelevance } from "./rank.js";
import { recommendationPool, recommend } from "./recommend.js";
import { validatePreferences } from "./validate.js";
import { EVAL_K } from "./weights.js";
import { SHOPPER_SCENARIOS } from "../test/fixtures/scenarios.js";

function failsGate(product, prefs) {
  return generateCandidates([product], prefs).candidates.length === 0;
}

export function baselineRanking(products, rawPrefs) {
  const validation = validatePreferences(rawPrefs);
  if (!validation.ok) return { ok: false, errors: validation.errors, products: [] };
  const { pool, report } = recommendationPool(products, validation.value);
  const ranked = rankByRelevance(pool.map((product) => ({
    product,
    score: scoreProductBaseline(product, validation.value).score,
  })));
  return { ok: true, products: ranked, constraintReport: report };
}

function summarise(ranked, scenario, prefs) {
  const ids = ranked.map((item) => item.product.id);
  if (ids.length === 0) {
    return {
      ids,
      precisionAtK: null,
      ndcgAtK: null,
      intraListDiversity: null,
      violationRate: null,
    };
  }
  const grades = scenario.grades || Object.fromEntries(scenario.relevantIds.map((id) => [id, 1]));
  return {
    ids,
    precisionAtK: precisionAtK(ids, scenario.relevantIds, EVAL_K),
    ndcgAtK: ndcgAtK(ids, grades, EVAL_K),
    intraListDiversity: intraListDiversity(ranked.map((item) => item.product), EVAL_K),
    violationRate: violationRate(ranked.map((item) => item.product), prefs, failsGate),
  };
}

/**
 * Compare the frozen v1 scorer with hybrid scoring plus MMR.
 * Both strategies share generateCandidates. Numbers are whatever the metrics return.
 */
function withoutRuntime(summary) {
  const { runtimeMs, ...quality } = summary;
  return quality;
}

/** Quality fields only. Runtime is machine-dependent and is not part of this snapshot. */
export function evaluationQuality(report) {
  return {
    k: report.k,
    scenarios: report.scenarios.map((row) => ({
      id: row.id,
      name: row.name,
      baseline: withoutRuntime(row.baseline),
      hybrid: withoutRuntime(row.hybrid),
    })),
    coverage: report.coverage,
    notes: report.notes,
  };
}

export function evaluateSuite(products, scenarios = SHOPPER_SCENARIOS) {
  const rows = scenarios.map((scenario) => {
    const validation = validatePreferences(scenario.preferences);
    const prefs = validation.ok ? validation.value : null;
    const hybridStarted = performance.now();
    const hybrid = recommend(products, { ...scenario.preferences, ranking: "diverse" });
    const hybridMs = performance.now() - hybridStarted;
    const baselineStarted = performance.now();
    const baseline = baselineRanking(products, scenario.preferences);
    const baselineMs = performance.now() - baselineStarted;
    return {
      id: scenario.id,
      name: scenario.name,
      baseline: { ...summarise(baseline.products || [], scenario, prefs), runtimeMs: baselineMs },
      hybrid: { ...summarise(hybrid.products || [], scenario, prefs), runtimeMs: hybridMs },
    };
  });

  return {
    k: EVAL_K,
    scenarios: rows,
    coverage: {
      baseline: catalogueCoverage(rows.map((row) => row.baseline.ids), products.length),
      hybrid: catalogueCoverage(rows.map((row) => row.hybrid.ids), products.length),
    },
    runtimeMs: {
      baseline: rows.reduce((sum, row) => sum + row.baseline.runtimeMs, 0),
      hybrid: rows.reduce((sum, row) => sum + row.hybrid.runtimeMs, 0),
    },
    notes: [
      "Labels are synthetic and were written from attributes, not from either ranker.",
      "A lower precision or NDCG for the diversity strategy is a real result, not a failure to hide.",
      "These figures are not a user study and do not measure satisfaction.",
      "Catalogue coverage counts every eligible recommendation, not only the top 5. Broad scenarios include almost the whole in-stock catalogue, so both strategies match: MMR reorders that set.",
      "Runtime covers the strategy call on this machine. The hybrid call includes explanations and labels. The baseline call scores with the frozen v1 formula and sorts by relevance. Runtime is not a quality score.",
    ],
  };
}

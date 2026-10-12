import { emptyResultMessage, generateCandidates } from "./candidates.js";
import { buildExplanation } from "./explain.js";
import { assignLabels } from "./labels.js";
import { productHasSize, sizeRequired } from "./filter.js";
import { cataloguePrior } from "./quality.js";
import { rankByRelevance, rerankMMR } from "./rank.js";
import { scoreProduct } from "./score.js";
import { validatePreferences } from "./validate.js";
import { MMR_LAMBDA } from "./weights.js";

/**
 * Eligible rows after hard gates. The liked product is removed when present
 * so a reference is not recommended as the closest thing to itself.
 */
export function recommendationPool(products, prefs) {
  const { candidates, report } = generateCandidates(products, prefs);
  const referenceId = prefs.likedProductId;
  const pool = referenceId ? candidates.filter((product) => product.id !== referenceId) : candidates;
  return {
    pool,
    report,
    excludedReference: Boolean(referenceId) && candidates.some((product) => product.id === referenceId),
  };
}

function emptyShell(partial) {
  return {
    ok: false,
    errors: [],
    products: [],
    message: null,
    constraintReport: null,
    labels: { bestOverall: null, bestBudgetFit: null, mostVersatile: null, closest: null },
    ranking: null,
    assumptions: [],
    prior: null,
    ...partial,
  };
}

export function recommend(products, rawPrefs, options = {}) {
  const validation = validatePreferences(rawPrefs);
  if (!validation.ok) {
    return emptyShell({ ok: false, errors: validation.errors });
  }

  const prefs = validation.value;
  const list = Array.isArray(products) ? products : [];
  const prior = Number.isFinite(options.prior) ? options.prior : cataloguePrior(list);
  const reference = prefs.likedProductId
    ? list.find((product) => product && product.id === prefs.likedProductId) || null
    : null;
  const { pool, report, excludedReference } = recommendationPool(list, prefs);

  const assumptions = [];
  if (prefs.flexible) {
    assumptions.push("Style and colour count less because you marked preferences as flexible.");
  }
  if (prefs.likedProductId && !reference) {
    assumptions.push("The selected reference item is not in the catalogue, so similarity was left out.");
  }
  if (excludedReference) {
    assumptions.push("Your reference item is not ranked against itself.");
  }

  const scored = pool.map((product) => {
    const { score, components } = scoreProduct(product, prefs, {
      prior,
      reference,
      m: options.m,
    });
    const similarity = components.similarity.active ? components.similarity.value : null;
    return {
      product,
      score,
      components,
      similarity,
      smoothedRating: components.quality.smoothed,
      reviewCount: components.quality.reviewCount,
    };
  });

  const lambda = prefs.ranking === "diverse" ? (options.lambda ?? MMR_LAMBDA) : 1;
  const ranked = prefs.ranking === "diverse"
    ? rerankMMR(scored, { lambda })
    : rankByRelevance(scored);

  const labels = assignLabels(ranked, { referenceResolved: Boolean(reference) });
  const productsOut = ranked.map((item) => {
    const { reasons, tradeoffs } = buildExplanation(item.product, prefs, item.components, {
      sizeMatched: sizeRequired(prefs) && productHasSize(item.product, prefs.size),
    });
    return {
      ...item,
      explanation: reasons,
      tradeoffs,
      labels: labels.byId.get(item.product.id) || [],
    };
  });

  if (productsOut.length === 0) {
    const message = excludedReference && report.eligible > 0
      ? "No other products match these constraints. The reference item is not ranked against itself."
      : emptyResultMessage(report);
    return emptyShell({
      ok: true,
      message,
      constraintReport: report,
      ranking: prefs.ranking,
      assumptions,
      prior,
    });
  }

  return {
    ok: true,
    errors: [],
    products: productsOut,
    message: null,
    constraintReport: report,
    labels: labels.ids,
    ranking: prefs.ranking,
    assumptions,
    prior,
  };
}

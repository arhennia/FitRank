import { formatInr } from "../format.js";
import { assignLabels } from "../labels.js";
import { cataloguePrior } from "../quality.js";
import { rankByRelevance, rerankMMR } from "../rank.js";
import { MMR_LAMBDA } from "../weights.js";
import { withShoppingAnnotations } from "./annotations.js";
import { buildIntentExplanation } from "./explainIntent.js";
import { applyShoppingGates, constraintNotes, emptyShoppingMessage, scanBaseCandidates } from "./gates.js";
import { interpretShoppingProfile, validateConstraints, validateQuestionnaire } from "./profile.js";
import { scoreIntentProduct } from "./scoreIntent.js";

function emptyResult(partial) {
  return {
    ok: false,
    errors: [],
    products: [],
    alternatives: [],
    profile: null,
    message: null,
    constraintReport: null,
    ranking: null,
    assumptions: [],
    spent: 0,
    ...partial,
  };
}

export function packTotalBudget(ranked, budget) {
  const chosen = [];
  const held = [];
  let spent = 0;
  for (const item of ranked) {
    const price = Number(item.product.price);
    if (Number.isFinite(price) && spent + price <= budget + 1e-9) {
      chosen.push(item);
      spent += price;
    } else {
      held.push(item);
    }
  }
  return { chosen, held, spent };
}

function buildAssumptions(profile, constraints, extras) {
  const assumptions = ["Prices, brands, and ratings in this catalogue are synthetic."];
  if (profile.compatibilityCertainty === "unknown") {
    assumptions.push("Your existing wardrobe was not provided, so outfit compatibility is uncertain.");
  }
  if ((profile.shoppingMission === "occasion" || profile.wardrobeRole === "complete-look") && !constraints.dressCode) {
    assumptions.push("No dress code was given, so none was inferred.");
  }
  if (profile.balancedTradeoff) {
    assumptions.push("Balance keeps untouched trade-offs at one shared level. It does not add a bonus on top of answers you already gave.");
  }
  if (profile.exploringAesthetic && profile.aestheticPreferences.length > 0) {
    assumptions.push(profile.ranking === "diverse"
      ? "The shortlist stays with the aesthetics you named. The order is varied inside that set."
      : "The shortlist stays with the aesthetics you named.");
  } else if (profile.exploringAesthetic) {
    assumptions.push(profile.ranking === "diverse"
      ? "You did not name an aesthetic, so aesthetic match is not scored and the order is varied."
      : "You did not name an aesthetic, so aesthetic match is not scored.");
  }
  if ((profile.preferences.quality || 0) > 0) {
    assumptions.push("Quality uses the synthetic rating aggregate. It is not a measured lifespan.");
  }
  if (constraints.budgetType === "total") {
    assumptions.push("Shown together, the recommended prices stay inside the total budget.");
  }
  if (extras.excludedReference) assumptions.push("Your reference item is not ranked against itself.");
  if (extras.noAestheticSeparation) {
    assumptions.push("None of the eligible products carry your selected aesthetic tags, so aesthetic did not separate them.");
  }
  if (extras.eligible > 0 && extras.eligible < 3) {
    assumptions.push("Only a few products passed the constraints. The constraints were not relaxed.");
  }
  if (extras.topScore != null && extras.topScore < 50) {
    assumptions.push("The strongest remaining match is still modest. Hard constraints were not relaxed.");
  }
  return assumptions;
}

/**
 * Questionnaire path:
 * validate, interpret, hard gates, score, MMR when the profile asks for it, explain.
 * Hard gates are never relaxed to fill the list.
 */
export function recommendFromIntent(products, input = {}, options = {}) {
  const validation = validateQuestionnaire(input.answers);
  const constraintsValidation = validateConstraints(input.constraints);
  if (!validation.ok || !constraintsValidation.ok) {
    return emptyResult({
      ok: false,
      errors: [...validation.errors, ...constraintsValidation.errors],
    });
  }

  const answers = validation.value;
  const constraints = constraintsValidation.value;
  const profile = interpretShoppingProfile(answers);
  const list = (Array.isArray(products) ? products : []).map(withShoppingAnnotations).filter(Boolean);
  const prior = Number.isFinite(options.prior) ? options.prior : cataloguePrior(list);
  const reference = constraints.referenceId
    ? list.find((product) => product.id === constraints.referenceId) || null
    : null;
  const avoided = constraints.avoidIds
    .map((id) => list.find((product) => product.id === id))
    .filter(Boolean);

  const scanned = scanBaseCandidates(list, constraints);
  if (scanned.candidates.length === 0) {
    return emptyResult({
      ok: true,
      profile,
      message: emptyShoppingMessage(scanned.report, { removed: {}, limiting: null }),
      constraintReport: { ...scanned.report, extra: {} },
      ranking: profile.ranking,
      assumptions: buildAssumptions(profile, constraints, { eligible: 0 }),
    });
  }

  const gated = applyShoppingGates(scanned.candidates, constraints);
  const pool = constraints.referenceId
    ? gated.candidates.filter((product) => product.id !== constraints.referenceId)
    : gated.candidates;
  const excludedReference = Boolean(constraints.referenceId) && gated.candidates.some((product) => product.id === constraints.referenceId);

  if (pool.length === 0) {
    const message = excludedReference && gated.candidates.length > 0
      ? "No other products match these constraints. The reference item is not ranked against itself."
      : emptyShoppingMessage(scanned.report, gated);
    return emptyResult({
      ok: true,
      profile,
      message,
      constraintReport: { ...scanned.report, eligible: 0, extra: gated.removed, limiting: gated.limiting || scanned.report.limiting },
      ranking: profile.ranking,
      assumptions: buildAssumptions(profile, constraints, { excludedReference, eligible: 0 }),
    });
  }

  const scored = pool.map((product) => {
    const result = scoreIntentProduct(product, profile, constraints, { prior, reference, avoided, m: options.m });
    return {
      product,
      ...result,
      similarity: result.components.similarity?.active ? result.components.similarity.value : null,
      constraintNotes: constraintNotes(product, constraints),
    };
  });

  const lambda = profile.ranking === "diverse" ? (options.lambda ?? MMR_LAMBDA) : 1;
  const ranked = profile.ranking === "diverse" ? rerankMMR(scored, { lambda }) : rankByRelevance(scored);
  const packed = constraints.budgetType === "total" ? packTotalBudget(ranked, constraints.maxBudget) : null;
  const visible = packed ? packed.chosen : ranked;
  const labels = assignLabels(visible.map((item) => ({
    ...item,
    components: {
      ...item.components,
      versatility: item.components.versatility?.active ? item.components.versatility : { value: null },
      budgetFit: { value: null },
    },
  })), { referenceResolved: Boolean(reference) });
  const noAestheticSeparation = profile.aestheticPreferences.length > 0
    && visible.every((item) => item.components.aesthetic?.missing || item.components.aesthetic?.matched?.length === 0);

  const explainContext = { profile, constraints, ranked: visible };
  const productsOut = visible.map((item) => {
    const { reasons, tradeoffs } = buildIntentExplanation(item, explainContext);
    const awarded = labels.byId.get(item.product.id) || [];
    return {
      ...item,
      explanation: reasons,
      tradeoffs,
      labels: item.score < 60 ? awarded.filter((label) => label !== "Best overall match") : awarded,
    };
  });

  const alternatives = (packed ? packed.held : []).slice(0, 5).map((item) => {
    const { reasons, tradeoffs } = buildIntentExplanation(item, { profile, constraints, ranked: visible, held: true });
    tradeoffs.unshift(`Eligible on its own at ${formatInr(item.product.price)}, but it does not fit the remaining total budget.`);
    return { ...item, explanation: reasons, tradeoffs, labels: [] };
  });

  const assumptions = buildAssumptions(profile, constraints, {
    excludedReference,
    noAestheticSeparation,
    eligible: pool.length,
    topScore: productsOut[0]?.score ?? null,
  });

  return {
    ok: true,
    errors: [],
    products: productsOut,
    alternatives,
    profile,
    message: null,
    constraintReport: {
      ...scanned.report,
      eligible: pool.length,
      shown: productsOut.length,
      extra: gated.removed,
      limiting: null,
    },
    labels: labels.ids,
    ranking: profile.ranking,
    assumptions,
    spent: packed ? packed.spent : null,
    prior,
  };
}

import { formatInr, formatList } from "./format.js";
import { BAYES_M, FORMALITY_MENTION_AT, OCCASION_LABELS, STYLE_LABELS, TRADEOFF_BELOW } from "./weights.js";

function labels(list, table) {
  return list.map((token) => table[token] || token);
}

function pushTradeoff(lines, component, text) {
  if (component?.active && component.value < TRADEOFF_BELOW) lines.push(text);
}

/**
 * Sentences come from recorded components and gates already passed.
 * Unmatched colours, styles, and occasions are omitted.
 * Budget fit is described as a preference score, never as a fair market price.
 */
export function buildExplanation(product, prefs, components, extra = {}) {
  const reasons = [];
  const tradeoffs = [];

  if (components.occasion?.matched?.length > 0) {
    reasons.push(`Suited to ${formatList(labels(components.occasion.matched, OCCASION_LABELS))}.`);
  }
  if (
    components.occasion?.formality != null
    && components.occasion.formalityFit >= FORMALITY_MENTION_AT
  ) {
    reasons.push(`Formality ${components.occasion.formality}/5 is close to this occasion.`);
  }
  if (components.style?.active && components.style.matched.length > 0) {
    reasons.push(`Style fit: ${formatList(labels(components.style.matched, STYLE_LABELS))}.`);
  }
  if (components.colour?.active && components.colour.matched.length > 0 && !components.colour.disliked) {
    reasons.push(`Colour ${components.colour.matched[0]} is one of your preferences.`);
  }
  if (components.material?.active && components.material.value > 0) {
    if (prefs.priority === "craftsmanship") {
      reasons.push(`Material ${product.material} supports your craftsmanship priority.`);
    } else if (components.material.matched.length > 0) {
      reasons.push(`Material ${components.material.matched[0]} matches your material preference.`);
    }
  }
  if (components.statement?.active && components.statement.value > 0) {
    reasons.push(`Styles include ${formatList(labels(components.statement.matched, STYLE_LABELS))}, which supports a statement look.`);
  }

  const comfort = Number(product.comfortRating);
  const comfortStated = prefs.priority === "comfort" || prefs.emphasis === "comfort";
  if (Number.isFinite(comfort) && comfort >= 1 && comfort <= 5 && components.comfort?.value >= TRADEOFF_BELOW) {
    const supports = comfortStated && components.comfort.value >= 0.6;
    reasons.push(
      supports
        ? `Comfort rating ${comfort}/5 supports your comfort priority.`
        : `Comfort rating ${comfort}/5.`,
    );
  }

  if (components.quality?.smoothed != null && components.quality.reviewCount != null) {
    reasons.push(
      `Synthetic review estimate ${components.quality.smoothed.toFixed(2)} from ${components.quality.reviewCount} reviews (Bayesian smooth, m=${BAYES_M}, prior=${Number(components.quality.prior).toFixed(2)}). Not verified customer sentiment.`,
    );
  }

  if (components.budgetFit?.active && components.budgetFit.value >= TRADEOFF_BELOW) {
    reasons.push("Budget fit uses the review estimate and room under your budget. It is not a fair-price judgement.");
  }

  const features = components.similarity?.features || [];
  const top = features.filter((feature) => feature.contribution > 0).slice(0, 3);
  if (components.similarity?.active && top.length > 0) {
    const name = components.similarity.referenceName || "your reference item";
    reasons.push(`Closest attributes to ${name}: ${formatList(top.map((feature) => feature.key))}.`);
  }

  if (Array.isArray(prefs.categories) && prefs.categories.includes(product.category)) {
    reasons.push(`Category: ${product.category}.`);
  }
  if (prefs.requireInStock !== false && product.availability === "in_stock") {
    reasons.push("In stock.");
  }
  if (extra.sizeMatched) {
    reasons.push(`Available in size ${prefs.size}.`);
  }
  reasons.push(`Priced at ${formatInr(product.price)}, within your ${formatInr(prefs.maxBudget)} budget.`);

  pushTradeoff(tradeoffs, components.occasion, "Occasion coverage is limited.");
  if (components.style?.disliked) tradeoffs.push("Includes a style you dislike.");
  else pushTradeoff(tradeoffs, components.style, "Style overlap is limited.");
  pushTradeoff(tradeoffs, components.colour, "Does not match a preferred colour.");
  if (components.comfort?.active && components.comfort.value < TRADEOFF_BELOW) {
    tradeoffs.push(
      components.comfort.rating == null
        ? "Comfort rating is missing, so that part of the score is 0."
        : `Comfort rating ${components.comfort.rating}/5 is low for this search.`,
    );
  }
  pushTradeoff(tradeoffs, components.versatility, "Versatility is limited for this search.");
  if (components.quality?.active && components.quality.value < TRADEOFF_BELOW) {
    tradeoffs.push(
      components.quality.smoothed == null
        ? "No usable synthetic rating, so quality scores 0."
        : "The smoothed review estimate is modest.",
    );
  }
  pushTradeoff(
    tradeoffs,
    components.budgetFit,
    "Budget fit is modest. This is not a fair-price judgement.",
  );
  pushTradeoff(tradeoffs, components.similarity, "Not especially close to your reference item.");
  pushTradeoff(tradeoffs, components.material, "Material does not support the material preference.");
  pushTradeoff(tradeoffs, components.statement, "Not tagged as a statement piece.");

  return { reasons, tradeoffs };
}

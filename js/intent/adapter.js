import { recommendFromIntent } from "../shopping/recommendIntent.js";

function first(list) {
  return Array.isArray(list) && list.length > 0 ? list[0] : null;
}

/** Rebuild the questionnaire answers that produced this profile. */
export function answersFromIntent(intent) {
  const provenance = intent?.provenance || {};
  return {
    trigger: first(provenance.trigger),
    outcome: first(provenance.outcome),
    role: first(provenance.role),
    discovery: first(provenance.discovery),
    contexts: [...(provenance.contexts || [])],
    aesthetics: [...(provenance.aesthetics || [])],
    priorities: [...(provenance.priorities || [])],
  };
}

/**
 * Rebuild only the hard fields the profile recorded.
 * Colour, material, and the other optional gates are omitted when they
 * were not part of the profile, rather than filled in.
 */
export function constraintsFromIntent(intent) {
  const hard = intent?.hard || {};
  const constraints = {};
  if (hard.budget != null) constraints.maxBudget = hard.budget;
  if (hard.budgetType) constraints.budgetType = hard.budgetType;
  if (Array.isArray(hard.category)) constraints.categories = [...hard.category];
  if (Array.isArray(hard.sizes) && hard.sizes.length > 0) constraints.size = hard.sizes[0];
  if (typeof hard.inStockOnly === "boolean") constraints.requireInStock = hard.inStockOnly;
  return constraints;
}

/**
 * Run the current shopper scorer from an IntentProfile.
 * This does not reimplement scoring. It restores the answers and hard
 * fields and calls recommendFromIntent.
 */
export function rankFromIntent(products, intent, options) {
  return recommendFromIntent(products, {
    answers: answersFromIntent(intent),
    constraints: constraintsFromIntent(intent),
  }, options);
}

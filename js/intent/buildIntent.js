import { interpretShoppingProfile, normaliseAnswers, scoringPreferences } from "../shopping/profile.js";
import { renderQueryText, templateVersion } from "./queryText.js";

const SINGLE = ["trigger", "outcome", "role", "discovery"];
const MULTI = ["contexts", "aesthetics", "priorities"];
const SCORE_PRIORITY_KEYS = ["versatility", "comfort", "distinctiveness", "quality", "value", "price"];

function finiteNumber(value) {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function present(source, key) {
  return Boolean(source) && Object.prototype.hasOwnProperty.call(source, key);
}

/**
 * Answers and constraints in, one IntentProfile out.
 * Missing inputs stay null. They are not replaced with catalogue defaults.
 * scoringProfile is the existing interpreter's object, not a second formula.
 */
export function buildIntent(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const hasAnswers = present(source, "answers") && source.answers && typeof source.answers === "object";
  const hasConstraints = present(source, "constraints") && source.constraints && typeof source.constraints === "object";
  const answers = hasAnswers ? normaliseAnswers(source.answers) : null;
  const constraints = hasConstraints ? source.constraints : null;
  const missing = [];

  const provenance = {};
  if (!hasAnswers) {
    missing.push("answers");
    for (const id of [...SINGLE, ...MULTI]) provenance[id] = [];
  } else {
    for (const id of SINGLE) {
      if (answers[id]) provenance[id] = [answers[id]];
      else {
        provenance[id] = [];
        missing.push(id);
      }
    }
    for (const id of MULTI) {
      provenance[id] = [...(answers[id] || [])];
      if (provenance[id].length === 0) missing.push(id);
    }
  }

  const scoringProfile = hasAnswers ? interpretShoppingProfile(answers) : null;
  const preferences = scoringProfile ? scoringPreferences(scoringProfile) : null;
  const priorities = {};
  if (preferences) {
    for (const key of SCORE_PRIORITY_KEYS) {
      if ((preferences[key] || 0) > 0) priorities[key] = preferences[key];
    }
  }

  let budget = null;
  let budgetType = null;
  let category = null;
  let sizes = null;
  let inStockOnly = null;
  if (!hasConstraints) {
    missing.push("budget", "category", "sizes", "inStockOnly");
  } else {
    budget = finiteNumber(constraints.maxBudget);
    if (budget == null && typeof constraints.maxBudget === "string" && constraints.maxBudget.trim()) {
      const parsed = Number(String(constraints.maxBudget).replace(/[₹,\s]/g, ""));
      budget = Number.isFinite(parsed) ? parsed : null;
    }
    if (budget == null) missing.push("budget");
    if (constraints.budgetType === "item" || constraints.budgetType === "total") budgetType = constraints.budgetType;
    else missing.push("budgetType");
    if (present(constraints, "categories") && Array.isArray(constraints.categories)) category = [...constraints.categories];
    else {
      category = null;
      missing.push("category");
    }
    if (typeof constraints.size === "string" && constraints.size.trim() && constraints.size.trim().toLowerCase() !== "any") {
      sizes = [constraints.size.trim()];
    } else {
      sizes = null;
      missing.push("sizes");
    }
    if (typeof constraints.requireInStock === "boolean") inStockOnly = constraints.requireInStock;
    else {
      inStockOnly = null;
      missing.push("inStockOnly");
    }
  }

  const hard = { budget, budgetType, category, sizes, inStockOnly };
  const soft = scoringProfile
    ? {
      aesthetics: [...scoringProfile.aestheticPreferences],
      occasions: [...scoringProfile.occasionContexts],
      priorities,
      purchaseTrigger: scoringProfile.purchaseTrigger,
      desiredOutcome: scoringProfile.desiredOutcome,
      wardrobeRole: scoringProfile.wardrobeRole,
      discoveryMode: scoringProfile.discoveryMode,
      exploringAesthetic: scoringProfile.exploringAesthetic,
      balancedTradeoff: scoringProfile.balancedTradeoff,
    }
    : {
      aesthetics: null,
      occasions: null,
      priorities: null,
      purchaseTrigger: null,
      desiredOutcome: null,
      wardrobeRole: null,
      discoveryMode: null,
      exploringAesthetic: null,
      balancedTradeoff: null,
    };

  const query = {
    text: scoringProfile ? renderQueryText(soft, hard) : null,
    imageSeed: null,
    template: templateVersion(),
  };

  return {
    hard,
    soft,
    query,
    provenance: { ...provenance, missing },
    scoringProfile,
  };
}

import { formatInr } from "../format.js";
import { parseBudget } from "../validate.js";
import {
  AESTHETICS,
  AVOIDS,
  CONTEXTS,
  DRESS_CODES,
  DIVERSE_DISCOVERY,
  FITS,
  MATERIALS,
  MISSION_LABELS,
  MISSION_ORDER,
  QUESTIONS,
  SEASONS,
  SHOP_CATEGORIES,
  SIGNAL_CAP,
  aestheticById,
  optionById,
  questionById,
  shopCategoryById,
} from "./vocabulary.js";
import { COLOURS } from "../weights.js";

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function asIdList(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

/**
 * Evidence is divided by SIGNAL_CAP and clamped to 1.
 * Another mention after the cap does not raise the scoring weight.
 */
export function saturate(evidence, cap = SIGNAL_CAP) {
  const amount = Number(evidence);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(1, amount / cap);
}

function addEffects(bucket, effects) {
  if (!effects) return;
  for (const [key, value] of Object.entries(effects)) {
    if (key === "mission" && value && typeof value === "object") {
      for (const [mission, amount] of Object.entries(value)) {
        bucket.mission[mission] = (bucket.mission[mission] || 0) + amount;
      }
    } else if (typeof value === "number") {
      bucket.evidence[key] = (bucket.evidence[key] || 0) + value;
    } else if (typeof value === "string") {
      bucket.fields[key] = value;
    }
  }
}

function pickMission(scores) {
  const entries = Object.entries(scores).filter(([, amount]) => amount > 0);
  if (entries.length === 0) return "unspecified";
  entries.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return MISSION_ORDER.indexOf(a[0]) - MISSION_ORDER.indexOf(b[0]);
  });
  return entries[0][0];
}

function orderedOptions(questionId, ids) {
  const question = questionById(questionId);
  if (!question) return unique(ids);
  const allowed = new Set(ids);
  return question.options.map((option) => option.id).filter((id) => allowed.has(id));
}

/**
 * Normalise questionnaire answers. Partial objects are allowed here;
 * validateQuestionnaire is what requires every question.
 */
export function normaliseAnswers(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const answers = {};
  for (const question of QUESTIONS) {
    if (question.selection === "single") {
      const value = typeof source[question.id] === "string" ? source[question.id].trim() : "";
      answers[question.id] = value || null;
    } else {
      answers[question.id] = orderedOptions(question.id, asIdList(source[question.id]));
    }
  }
  return answers;
}

export function validateQuestionnaire(raw) {
  const answers = normaliseAnswers(raw);
  const errors = [];
  for (const question of QUESTIONS) {
    if (question.selection === "single") {
      if (!answers[question.id]) {
        errors.push(`Choose an answer for “${question.prompt}”`);
      } else if (!optionById(question.id, answers[question.id])) {
        errors.push(`“${answers[question.id]}” is not an option for “${question.prompt}”`);
      }
      if (Array.isArray(raw?.[question.id])) {
        errors.push(`“${question.prompt}” accepts one answer.`);
      }
    } else if (answers[question.id].length === 0) {
      errors.push(`Choose at least one option for “${question.prompt}”`);
    } else {
      for (const id of asIdList(raw?.[question.id])) {
        if (!optionById(question.id, id)) errors.push(`“${id}” is not an option for “${question.prompt}”`);
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors, value: null };
  return { ok: true, errors: [], value: answers };
}

export function defaultConstraints() {
  return {
    categories: [],
    budgetType: "item",
    maxBudget: "15000",
    size: "",
    fit: "",
    colours: [],
    materials: [],
    avoid: [],
    seasons: [],
    dressCode: "",
    brands: [],
    requireInStock: true,
    referenceId: "",
    avoidIds: [],
    detailsOpen: false,
  };
}

function cleanToken(value, lower = true) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return lower ? trimmed.toLowerCase() : trimmed;
}

export function validateConstraints(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const errors = [];
  const categories = unique(asIdList(source.categories));
  const colours = unique(asIdList(source.colours).map((colour) => colour.toLowerCase()));
  const materials = unique(asIdList(source.materials).map((material) => material.toLowerCase()));
  const avoid = unique(asIdList(source.avoid));
  const seasons = unique(asIdList(source.seasons));
  const brands = unique(asIdList(source.brands).map((brand) => brand.trim())).filter(Boolean);
  const budgetType = cleanToken(source.budgetType || "item");
  const maxBudget = parseBudget(source.maxBudget);
  const size = typeof source.size === "string" ? source.size.trim() : "";
  const fit = cleanToken(source.fit || "");
  const dressCode = cleanToken(source.dressCode || "");

  if (!Number.isFinite(maxBudget) || maxBudget <= 0) errors.push("Enter a budget greater than 0.");
  if (budgetType !== "item" && budgetType !== "total") errors.push("Choose a per-item budget or a total budget.");
  for (const category of categories) {
    if (!shopCategoryById(category)) errors.push(`Category “${category}” is not a recognised option.`);
  }
  for (const colour of colours) {
    if (!COLOURS.includes(colour)) errors.push(`Colour “${colour}” is not a recognised option.`);
  }
  for (const material of materials) {
    if (!MATERIALS.includes(material)) errors.push(`Material “${material}” is not a recognised option.`);
  }
  for (const id of avoid) {
    if (!AVOIDS.some((item) => item.id === id)) errors.push(`Avoid option “${id}” is not recognised.`);
  }
  for (const season of seasons) {
    if (!SEASONS.some((item) => item.id === season)) errors.push(`Season “${season}” is not recognised.`);
  }
  if (fit && !FITS.some((item) => item.id === fit)) errors.push("Fit preference is not recognised.");
  if (dressCode && !DRESS_CODES.some((item) => item.id === dressCode)) errors.push("Dress code is not recognised.");

  if (errors.length > 0) return { ok: false, errors, value: null };

  const requireInStock = !(source.requireInStock === false || source.requireInStock === "false");
  return {
    ok: true,
    errors: [],
    value: {
      categories,
      budgetType,
      maxBudget,
      size: !size || size.toLowerCase() === "any" ? "" : size,
      fit,
      colours,
      materials,
      avoid,
      seasons,
      dressCode,
      brands,
      requireInStock,
      referenceId: typeof source.referenceId === "string" ? source.referenceId.trim() : "",
      avoidIds: unique(asIdList(source.avoidIds)),
      detailsOpen: source.detailsOpen === true,
    },
  };
}

const PREFERENCE_KEYS = ["versatility", "comfort", "distinctiveness", "quality", "value", "price", "fit", "novelty", "discovery", "occasionFit", "basics", "focus", "wardrobeUncertainty"];

const BALANCED_KEYS = ["versatility", "comfort", "distinctiveness", "quality", "value", "price"];

/**
 * Turn questionnaire answers into one inspectable shopping profile.
 * The same answers always produce the same profile. No model is called.
 */
export function interpretShoppingProfile(raw) {
  const answers = normaliseAnswers(raw);
  const bucket = { mission: {}, evidence: {}, fields: {} };
  let exploringAesthetic = false;
  let balancedTradeoff = false;
  const contexts = [];
  const aesthetics = [];
  const priorities = [];

  for (const question of QUESTIONS) {
    if (question.selection === "single") {
      const option = optionById(question.id, answers[question.id]);
      if (option) addEffects(bucket, option.effects);
      continue;
    }
    if (question.id === "priorities" && answers.priorities.includes("balance")) {
      balancedTradeoff = true;
      priorities.push(...answers.priorities);
      continue;
    }
    for (const id of answers[question.id]) {
      if (question.id === "aesthetics" && id === "open") {
        exploringAesthetic = true;
        continue;
      }
      const option = optionById(question.id, id);
      if (!option) continue;
      if (question.id === "contexts") contexts.push(id);
      if (question.id === "aesthetics") aesthetics.push(id);
      if (question.id === "priorities") priorities.push(id);
      addEffects(bucket, option.effects);
    }
  }

  const preferences = {};
  for (const key of PREFERENCE_KEYS) preferences[key] = saturate(bucket.evidence[key] || 0);

  const shoppingMission = pickMission(bucket.mission);
  const discoveryMode = bucket.fields.discoveryMode || null;
  const ranking = bucket.fields.purchaseTrigger === "explore" || DIVERSE_DISCOVERY.has(discoveryMode)
    ? "diverse"
    : "relevance";

  const profile = {
    shoppingMission,
    missionLabel: MISSION_LABELS[shoppingMission] || MISSION_LABELS.unspecified,
    purchaseTrigger: bucket.fields.purchaseTrigger || null,
    desiredOutcome: bucket.fields.desiredOutcome || null,
    wardrobeRole: bucket.fields.wardrobeRole || null,
    discoveryMode,
    occasionContexts: contexts,
    aestheticPreferences: aesthetics,
    priorityTradeoffs: priorities,
    exploringAesthetic,
    balancedTradeoff,
    redundancySensitivity: preferences.novelty,
    versatilityPreference: preferences.versatility,
    preferences,
    evidence: { ...bucket.evidence },
    missionScores: { ...bucket.mission },
    ranking,
    wardrobeKnown: false,
    compatibilityCertainty: (bucket.evidence.wardrobeUncertainty || 0) > 0 ? "unknown" : "not-requested",
  };
  return profile;
}

/**
 * Scoring weights use saturated preferences.
 * Balance fills untouched trade-offs at one shared moderate level.
 * It does not add that level on top of evidence that is already present,
 * and the fit priority is recorded but not scored: the catalogue has no
 * measurement of a flattering fit.
 */
export function scoringPreferences(profile) {
  const preferences = { ...profile.preferences, fit: 0 };
  if (!profile.balancedTradeoff) return preferences;
  for (const key of BALANCED_KEYS) {
    if (preferences[key] === 0) preferences[key] = 0.5;
  }
  return preferences;
}

export function labelFor(questionId, optionId) {
  return optionById(questionId, optionId)?.label || optionId;
}

export function contextLabel(id) {
  return CONTEXTS.find((context) => context.id === id)?.label || id;
}

export function aestheticLabel(id) {
  return aestheticById(id)?.label || id;
}

export function categoryLabel(id) {
  return shopCategoryById(id)?.label || id;
}

export function reviewModel(answers, constraints) {
  const profile = interpretShoppingProfile(answers);
  const parsedBudget = parseBudget(constraints?.maxBudget);
  const budget = Number.isFinite(parsedBudget) ? formatInr(parsedBudget) : String(constraints?.maxBudget ?? "");
  const budgetText = constraints?.budgetType === "total"
    ? `Total budget ${budget}`
    : `Budget per item ${budget}`;
  const rows = [
    { label: "Shopping mission", value: profile.missionLabel, step: 0 },
    { label: "What brought you here", value: labelFor("trigger", answers.trigger), step: 0 },
    { label: "Worth it if", value: labelFor("outcome", answers.outcome), step: 1 },
    { label: "Wardrobe role", value: labelFor("role", answers.role), step: 2 },
    { label: "How you want to shop", value: labelFor("discovery", answers.discovery), step: 3 },
    { label: "Where you'll wear it", value: (answers.contexts || []).map(contextLabel).join(" "), step: 4 },
    {
      label: "Aesthetics",
      value: profile.exploringAesthetic && profile.aestheticPreferences.length === 0
        ? "Exploring, no fixed aesthetic"
        : [
          profile.aestheticPreferences.map(aestheticLabel).join(" "),
          profile.exploringAesthetic ? "Also open to pieces outside one aesthetic." : "",
        ].filter(Boolean).join(" "),
      step: 5,
    },
    {
      label: "Trade-offs",
      value: profile.balancedTradeoff
        ? "A balance of several of these. Other ticked trade-offs are not stacked on top."
        : (answers.priorities || []).map((id) => labelFor("priorities", id)).join(" "),
      step: 6,
    },
    {
      label: "Categories",
      value: constraints?.categories?.length ? constraints.categories.map(categoryLabel).join(", ") : "Any category",
      step: 7,
    },
    { label: "Budget", value: budgetText, step: 7 },
  ];
  if (constraints?.size) rows.push({ label: "Size", value: constraints.size, step: 7 });
  if (constraints?.fit) rows.push({ label: "Fit", value: constraints.fit, step: 7 });
  if (constraints?.colours?.length) rows.push({ label: "Colours", value: constraints.colours.join(", "), step: 7 });
  if (constraints?.materials?.length) rows.push({ label: "Materials", value: constraints.materials.join(", "), step: 7 });
  if (constraints?.seasons?.length) rows.push({ label: "Season", value: constraints.seasons.join(", "), step: 7 });
  if (constraints?.dressCode) rows.push({ label: "Dress code", value: constraints.dressCode, step: 7 });
  if (constraints?.brands?.length) rows.push({ label: "Brands", value: constraints.brands.join(", "), step: 7 });
  if (constraints?.avoid?.length) rows.push({ label: "Avoid", value: constraints.avoid.join(", "), step: 7 });
  rows.push({
    label: "Stock",
    value: constraints?.requireInStock === false ? "Include out-of-stock rows" : "In stock only",
    step: 7,
  });
  return { profile, rows };
}

export function knownAestheticIds() {
  return AESTHETICS.map((aesthetic) => aesthetic.id);
}

export function knownCategoryIds() {
  return SHOP_CATEGORIES.map((category) => category.id);
}

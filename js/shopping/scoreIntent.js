import { cataloguePrior, qualityComponent, smoothedRating } from "../quality.js";
import { contentSimilarity } from "../similarity.js";
import { BAYES_M } from "../weights.js";
import { scoringPreferences } from "./profile.js";
import { CONTEXTS, INTENT_WEIGHTS, aestheticById } from "./vocabulary.js";

function tokens(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function ratingOrNull(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
  return rating;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function readAesthetics(product) {
  if (!Array.isArray(product.aesthetics)) return [];
  const entries = [];
  for (const entry of product.aesthetics) {
    if (typeof entry === "string" && entry.trim()) {
      entries.push({ id: entry.trim(), relevance: 1 });
    } else if (entry && typeof entry.id === "string" && entry.id.trim()) {
      const relevance = Number(entry.relevance);
      entries.push({
        id: entry.id.trim(),
        relevance: Number.isFinite(relevance) ? clamp01(relevance) : 1,
      });
    }
  }
  return entries;
}

export function versatilitySignal(product) {
  const rating = ratingOrNull(product.versatilityRating);
  if (rating != null) return { value: rating / 5, known: true, fallback: false };
  if (Array.isArray(product.occasions)) {
    return { value: Math.min(1, tokens(product.occasions).length / 4), known: true, fallback: true };
  }
  return { value: 0, known: false, fallback: false };
}

export function distinctivenessSignal(product) {
  const styles = tokens(product.styles);
  const styleKnown = Array.isArray(product.styles);
  let stylePart = 0;
  if (styles.includes("artistic")) stylePart += 0.6;
  if (styles.includes("bold")) stylePart += 0.4;
  stylePart = Math.min(1, stylePart);
  const versatility = versatilitySignal(product);
  const rarity = versatility.known ? 1 - versatility.value : 0;
  let aestheticPart = 0;
  for (const entry of readAesthetics(product)) {
    const spec = aestheticById(entry.id);
    if (!spec) continue;
    aestheticPart = Math.max(aestheticPart, entry.relevance * (spec.distinctiveness || 0));
  }
  if (!styleKnown && readAesthetics(product).length === 0) {
    return { value: 0, missing: true };
  }
  return {
    value: clamp01(0.5 * stylePart + 0.25 * rarity + 0.25 * aestheticPart),
    missing: false,
  };
}

function consumedByRole(role) {
  if (role === "versatile" || role === "basic") return ["versatility"];
  if (role === "statement" || role === "complete-look") return ["distinctiveness"];
  if (role === "different") return ["versatility", "distinctiveness"];
  return [];
}

/**
 * One weight per signal. A role that already uses versatility or
 * distinctiveness suppresses the second copy of that component.
 * Value already includes price headroom, so a separate price component
 * is left off while value is active.
 */
export function intentWeights(profile, { similarity = false, avoid = false } = {}) {
  const preferences = scoringPreferences(profile);
  const weights = {};
  const consumed = new Set(consumedByRole(profile.wardrobeRole));
  if (profile.occasionContexts.length > 0) weights.context = INTENT_WEIGHTS.context;
  if (profile.aestheticPreferences.length > 0) weights.aesthetic = INTENT_WEIGHTS.aesthetic;
  const scaled = ["versatility", "distinctiveness", "comfort", "quality", "value"];
  for (const key of scaled) {
    if (consumed.has(key)) continue;
    const level = preferences[key] || 0;
    if (level > 0) weights[key] = INTENT_WEIGHTS[key] * level;
  }
  if ((preferences.price || 0) > 0 && (preferences.value || 0) <= 0) {
    weights.price = INTENT_WEIGHTS.price * preferences.price;
  }
  if (profile.wardrobeRole) {
    const levels = [...consumed].map((key) => preferences[key] || 0);
    const level = levels.length > 0 ? Math.max(...levels) : 1;
    weights.wardrobeRole = INTENT_WEIGHTS.wardrobeRole * (levels.length > 0 ? 0.5 + 0.5 * level : 1);
  }
  if (similarity) weights.similarity = INTENT_WEIGHTS.similarity;
  if (avoid) weights.avoid = INTENT_WEIGHTS.avoid;
  return weights;
}

function blank(key, active, value, extra = {}) {
  return { key, active, value, weight: 0, contribution: 0, matched: [], missing: false, ...extra };
}

export function contextSignal(product, contextIds) {
  const selected = CONTEXTS.filter((context) => contextIds.includes(context.id));
  if (selected.length === 0) return { value: 0, missing: false, matched: [], formalityMissing: false };
  if (!Array.isArray(product.occasions)) {
    return { value: 0, missing: true, matched: [], formalityMissing: ratingOrNull(product.formalityRating) == null };
  }
  const owned = new Set(tokens(product.occasions));
  const formality = ratingOrNull(product.formalityRating);
  let total = 0;
  const matched = [];
  for (const context of selected) {
    let covered = 0;
    let weight = 0;
    for (const [occasion, occasionWeight] of Object.entries(context.occasions)) {
      weight += occasionWeight;
      if (owned.has(occasion)) covered += occasionWeight;
    }
    const coverage = weight === 0 ? 0 : covered / weight;
    let score = coverage;
    if (formality == null) score = coverage * 0.85;
    else score = 0.75 * coverage + 0.25 * (1 - Math.abs(formality - context.formality) / 4);
    total += clamp01(score);
    if (coverage > 0) matched.push(context.id);
  }
  return {
    value: total / selected.length,
    missing: false,
    matched,
    formalityMissing: formality == null,
  };
}

export function aestheticSignal(product, selectedIds) {
  if (selectedIds.length === 0) return { value: 0, missing: false, matched: [] };
  const entries = readAesthetics(product);
  if (entries.length === 0) return { value: 0, missing: true, matched: [] };
  const byId = new Map(entries.map((entry) => [entry.id, entry.relevance]));
  const matched = [];
  let sum = 0;
  for (const id of selectedIds) {
    const relevance = byId.get(id) ?? 0;
    sum += relevance;
    if (relevance > 0) matched.push({ id, relevance });
  }
  return { value: sum / selectedIds.length, missing: false, matched };
}

export function roleSignal(product, role) {
  const versatility = versatilitySignal(product);
  const distinctiveness = distinctivenessSignal(product);
  const occasions = tokens(product.occasions);
  const formality = ratingOrNull(product.formalityRating);
  if (role === "versatile") return { value: versatility.value, missing: !versatility.known, uncertainWardrobe: false };
  if (role === "basic") {
    return {
      value: versatility.known ? versatility.value * (1 - distinctiveness.value) : 0,
      missing: !versatility.known,
      uncertainWardrobe: false,
    };
  }
  if (role === "connector") {
    return {
      value: occasions.length >= 2 ? Math.min(1, occasions.length / 3) : 0,
      missing: !Array.isArray(product.occasions),
      uncertainWardrobe: true,
    };
  }
  if (role === "statement") return { value: distinctiveness.value, missing: distinctiveness.missing, uncertainWardrobe: false };
  if (role === "different") {
    return {
      value: clamp01(distinctiveness.value * 0.7 + (versatility.known ? (1 - versatility.value) * 0.3 : 0)),
      missing: distinctiveness.missing && !versatility.known,
      uncertainWardrobe: true,
    };
  }
  if (role === "complete-look") {
    if (formality == null) return { value: distinctiveness.value * 0.5, missing: true, uncertainWardrobe: false, missingFormality: true };
    return {
      value: clamp01((formality / 5) * 0.6 + distinctiveness.value * 0.4),
      missing: false,
      uncertainWardrobe: false,
    };
  }
  return { value: 0, missing: true, uncertainWardrobe: false };
}

function headroomOf(product, budget) {
  const price = Number(product.price);
  if (!Number.isFinite(budget) || budget <= 0 || !Number.isFinite(price)) return 0;
  return 1 - Math.min(1, Math.max(0, price / budget));
}

function valueSignal(qualityKnown, qualityValue, headroom) {
  if (!qualityKnown) return { value: headroom * 0.35, missingQuality: true };
  return { value: Math.sqrt(clamp01(qualityValue) * clamp01(headroom)), missingQuality: false };
}

/**
 * Score one eligible product against an interpreted profile.
 * prefs-style weights are already saturated, so repeated answers do not
 * add another copy of the same component.
 */
export function scoreIntentProduct(product, profile, constraints, context = {}) {
  const preferences = scoringPreferences(profile);
  const reference = context.reference || null;
  const avoided = Array.isArray(context.avoided) ? context.avoided.filter(Boolean) : [];
  const weights = intentWeights(profile, {
    similarity: Boolean(reference),
    avoid: avoided.length > 0,
  });
  const components = {};

  const contextResult = contextSignal(product, profile.occasionContexts);
  components.context = blank("context", weights.context != null, contextResult.value, contextResult);

  const aestheticResult = aestheticSignal(product, profile.aestheticPreferences);
  components.aesthetic = blank("aesthetic", weights.aesthetic != null, aestheticResult.value, aestheticResult);

  const versatility = versatilitySignal(product);
  components.versatility = blank("versatility", weights.versatility != null, versatility.value, {
    missing: !versatility.known,
    fallback: versatility.fallback,
  });

  const distinctiveness = distinctivenessSignal(product);
  components.distinctiveness = blank("distinctiveness", weights.distinctiveness != null, distinctiveness.value, {
    missing: distinctiveness.missing,
  });

  const comfort = ratingOrNull(product.comfortRating);
  components.comfort = blank("comfort", weights.comfort != null, comfort == null ? 0 : comfort / 5, {
    missing: comfort == null,
    rating: comfort,
  });

  const prior = Number.isFinite(context.prior) ? context.prior : cataloguePrior([]);
  const smoothed = smoothedRating({
    rating: product.averageRating,
    count: product.reviewCount,
    prior,
    m: context.m ?? BAYES_M,
  });
  const qualityValue = qualityComponent(smoothed.ok ? smoothed.value : null);
  components.quality = blank("quality", weights.quality != null, qualityValue, {
    missing: !smoothed.ok,
    smoothed: smoothed.ok ? smoothed.value : null,
    prior,
    reviewCount: Number.isInteger(product.reviewCount) ? product.reviewCount : null,
  });

  const headroom = headroomOf(product, constraints.maxBudget);
  const value = valueSignal(smoothed.ok, qualityValue, headroom);
  components.value = blank("value", weights.value != null, value.value, {
    missing: value.missingQuality,
    headroom,
    missingQuality: value.missingQuality,
  });
  if (weights.price != null) {
    components.price = blank("price", true, headroom, { headroom });
  }

  const role = roleSignal(product, profile.wardrobeRole);
  components.wardrobeRole = blank("wardrobeRole", weights.wardrobeRole != null, role.value, role);

  if (weights.similarity != null && reference) {
    const similarity = contentSimilarity(product, reference);
    components.similarity = blank("similarity", true, similarity.score, {
      referenceId: reference.id,
      referenceName: reference.name,
    });
  }

  if (weights.avoid != null) {
    let maxSimilarity = 0;
    for (const other of avoided) {
      maxSimilarity = Math.max(maxSimilarity, contentSimilarity(product, other).score);
    }
    components.avoid = blank("avoid", true, 1 - maxSimilarity, { maxSimilarity });
  }

  let weighted = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const component = components[key];
    if (!component) continue;
    component.weight = weight;
    weighted += weight * component.value;
    totalWeight += weight;
  }
  for (const component of Object.values(components)) {
    component.contribution = totalWeight === 0 ? 0 : (100 * component.weight * component.value) / totalWeight;
  }
  const score = totalWeight === 0 ? 0 : Math.round((100 * weighted) / totalWeight);
  return {
    score,
    components,
    smoothedRating: smoothed.ok ? smoothed.value : null,
    reviewCount: Number.isInteger(product.reviewCount) ? product.reviewCount : null,
  };
}

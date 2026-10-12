import { cataloguePrior, qualityComponent, smoothedRating } from "./quality.js";
import { contentSimilarity } from "./similarity.js";
import {
  BAYES_M,
  COMPONENT_LABELS,
  FORMALITY_TARGETS,
  MATERIAL_CRAFTSMANSHIP,
  OPTIONAL_WEIGHTS,
  VERSATILITY_FULL_AT,
  WEIGHTS,
} from "./weights.js";

function tokens(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function productColours(product) {
  if (Array.isArray(product.colours)) return tokens(product.colours);
  if (typeof product.colour === "string" && product.colour.trim()) return [product.colour.trim().toLowerCase()];
  return [];
}

function ratingOrNull(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
  return rating;
}

function overlap(productTokens, selected) {
  const wanted = new Set(selected);
  return productTokens.filter((token) => wanted.has(token));
}

/**
 * Active weights for this shopper. Every candidate uses the same map.
 * Optional signals are omitted instead of scoring 1 for everyone.
 */
export function componentWeights(prefs, { referenceResolved = false } = {}) {
  const scaled = { ...WEIGHTS };
  const emphasis = prefs.emphasis && prefs.emphasis !== "balanced" ? prefs.emphasis : null;
  if (emphasis === "appearance") {
    scaled.style *= 1.6;
    scaled.colour *= 1.6;
  } else if (emphasis && Object.prototype.hasOwnProperty.call(scaled, emphasis)) {
    scaled[emphasis] *= 2;
  }
  if (prefs.flexible) {
    scaled.style *= 0.5;
    scaled.colour *= 0.5;
    scaled.comfort *= 1.25;
    scaled.versatility *= 1.25;
  }
  if (prefs.priority === "comfort") scaled.comfort *= 2;
  if (prefs.priority === "versatility") scaled.versatility *= 2;

  const weights = {
    occasion: scaled.occasion,
    comfort: scaled.comfort,
    versatility: scaled.versatility,
    quality: scaled.quality,
    budgetFit: scaled.budgetFit,
  };
  if (Array.isArray(prefs.styles) && prefs.styles.length > 0) weights.style = scaled.style;
  const colourPrefs = (prefs.colours?.length || 0) + (prefs.dislikedColours?.length || 0);
  if (colourPrefs > 0) weights.colour = scaled.colour;
  if (referenceResolved) weights.similarity = OPTIONAL_WEIGHTS.similarity;
  const wantsMaterial = prefs.priority === "craftsmanship" || (prefs.materials?.length > 0 && prefs.priority !== "craftsmanship");
  if (wantsMaterial) weights.material = OPTIONAL_WEIGHTS.material;
  if (prefs.priority === "statement") weights.statement = OPTIONAL_WEIGHTS.statement;
  return weights;
}

function blank(key, active, value, extra = {}) {
  return {
    key,
    label: COMPONENT_LABELS[key] || key,
    active,
    value,
    weight: 0,
    contribution: 0,
    matched: [],
    ...extra,
  };
}

/**
 * Score one candidate. prefs must already be normalised.
 * context.prior defaults to the fallback prior. context.reference is the liked product.
 * Missing product attributes on an active component score 0, never 1.
 */
export function scoreProduct(product, prefs, context = {}) {
  const occasions = Array.isArray(prefs.occasions) ? prefs.occasions : [];
  const styles = Array.isArray(prefs.styles) ? prefs.styles : [];
  const colours = Array.isArray(prefs.colours) ? prefs.colours : [];
  const dislikedColours = Array.isArray(prefs.dislikedColours) ? prefs.dislikedColours : [];
  const dislikedStyles = Array.isArray(prefs.dislikedStyles) ? prefs.dislikedStyles : [];
  const materials = Array.isArray(prefs.materials) ? prefs.materials : [];
  const reference = context.reference || null;
  const weights = componentWeights(prefs, { referenceResolved: Boolean(reference) });

  const productOccasions = tokens(product.occasions);
  const productStyles = tokens(product.styles);
  const matchedOccasions = overlap(productOccasions, occasions);
  const matchedStyles = overlap(productStyles, styles);
  const dislikedStyle = productStyles.some((style) => dislikedStyles.includes(style));

  const formality = ratingOrNull(product.formalityRating);
  const target = occasions.length
    ? occasions.reduce((sum, occasion) => sum + (FORMALITY_TARGETS[occasion] ?? 3), 0) / occasions.length
    : null;
  const formalityFit = formality == null || target == null ? 0 : 1 - Math.abs(formality - target) / 4;
  const occasionOverlap = occasions.length === 0 ? 0 : matchedOccasions.length / occasions.length;
  const occasionValue = 0.7 * occasionOverlap + 0.3 * formalityFit;

  const components = {
    occasion: blank("occasion", true, occasionValue, {
      matched: matchedOccasions,
      formalityFit,
      formality,
    }),
  };

  if (weights.style != null) {
    const styleValue = dislikedStyle || styles.length === 0 ? 0 : matchedStyles.length / styles.length;
    components.style = blank("style", true, styleValue, {
      matched: dislikedStyle ? [] : matchedStyles,
      disliked: dislikedStyle,
    });
  } else {
    components.style = blank("style", false, 0);
  }

  const ownedColours = productColours(product);
  if (weights.colour != null) {
    const disliked = ownedColours.some((colour) => dislikedColours.includes(colour));
    let colourValue = 0;
    let matched = [];
    if (ownedColours.length === 0 || disliked) {
      colourValue = 0;
    } else if (colours.length === 0) {
      colourValue = 1;
      matched = ownedColours;
    } else {
      matched = ownedColours.filter((colour) => colours.includes(colour));
      colourValue = matched.length > 0 ? 1 : 0;
    }
    components.colour = blank("colour", true, colourValue, { matched, disliked });
  } else {
    components.colour = blank("colour", false, 0);
  }

  const comfort = ratingOrNull(product.comfortRating);
  components.comfort = blank("comfort", true, comfort == null ? 0 : comfort / 5, {
    rating: comfort,
  });

  const explicitVersatility = ratingOrNull(product.versatilityRating);
  let versatilityValue = 0;
  if (explicitVersatility != null) versatilityValue = explicitVersatility / 5;
  else if (Array.isArray(product.occasions)) {
    versatilityValue = Math.min(1, tokens(product.occasions).length / VERSATILITY_FULL_AT);
  }
  components.versatility = blank("versatility", true, versatilityValue, {
    rating: explicitVersatility,
    occasionCount: Array.isArray(product.occasions) ? tokens(product.occasions).length : null,
  });

  const prior = Number.isFinite(context.prior) ? context.prior : cataloguePrior([]);
  const smoothed = smoothedRating({
    rating: product.averageRating,
    count: product.reviewCount,
    prior,
    m: context.m ?? BAYES_M,
  });
  components.quality = blank("quality", true, qualityComponent(smoothed.ok ? smoothed.value : null), {
    smoothed: smoothed.ok ? smoothed.value : null,
    prior,
    reviewCount: Number.isInteger(product.reviewCount) ? product.reviewCount : null,
  });

  const budget = Number(prefs.maxBudget);
  const price = Number(product.price);
  const headroom = Number.isFinite(budget) && budget > 0 && Number.isFinite(price)
    ? 1 - Math.min(1, Math.max(0, price / budget))
    : 0;
  const budgetFit = (components.quality.value + headroom) / 2;
  components.budgetFit = blank("budgetFit", true, budgetFit, { headroom });

  if (weights.similarity != null && reference) {
    const similarity = contentSimilarity(product, reference);
    components.similarity = blank("similarity", true, similarity.score, {
      features: similarity.features,
      referenceId: reference.id,
      referenceName: reference.name,
    });
  } else {
    components.similarity = blank("similarity", false, 0);
  }

  if (weights.material != null) {
    const material = typeof product.material === "string" ? product.material.trim().toLowerCase() : "";
    let materialValue = 0;
    if (prefs.priority === "craftsmanship") {
      materialValue = Object.prototype.hasOwnProperty.call(MATERIAL_CRAFTSMANSHIP, material)
        ? MATERIAL_CRAFTSMANSHIP[material]
        : 0;
    } else {
      materialValue = material && materials.includes(material) ? 1 : 0;
    }
    components.material = blank("material", true, materialValue, {
      matched: materialValue > 0 && material ? [material] : [],
    });
  } else {
    components.material = blank("material", false, 0);
  }

  if (weights.statement != null) {
    const statementTags = productStyles.filter((style) => style === "bold" || style === "artistic");
    components.statement = blank("statement", true, statementTags.length > 0 ? 1 : 0, {
      matched: statementTags,
    });
  } else {
    components.statement = blank("statement", false, 0);
  }

  let weighted = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const component = components[key];
    component.weight = weight;
    weighted += weight * component.value;
    totalWeight += weight;
  }
  for (const component of Object.values(components)) {
    component.contribution = totalWeight === 0 ? 0 : (100 * component.weight * component.value) / totalWeight;
  }

  const score = totalWeight === 0 ? 0 : Math.round((100 * weighted) / totalWeight);
  return { score, components, smoothed, prior };
}

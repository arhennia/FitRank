import { MATERIAL_CRAFTSMANSHIP, VERSATILITY_FULL_AT, WEIGHTS } from "./weights.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function tokens(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function overlap(productTokens, selected) {
  const wanted = new Set(selected);
  return productTokens.filter((token) => wanted.has(token));
}

function comfortRatio(product) {
  if (product.comfortRating == null || product.comfortRating === "") return null;
  const value = Number(product.comfortRating);
  if (!Number.isFinite(value)) return null;
  return clamp(value / 5, 0, 1);
}

function versatilityRatio(product) {
  if (!Array.isArray(product.occasions)) return null;
  return clamp(tokens(product.occasions).length / VERSATILITY_FULL_AT, 0, 1);
}

function priorityValue(product, priority, productStyles) {
  if (priority === "comfort") return comfortRatio(product) ?? 0;
  if (priority === "versatility") return versatilityRatio(product) ?? 0;
  if (priority === "craftsmanship") {
    const material = typeof product.material === "string" ? product.material.trim().toLowerCase() : "";
    return Object.prototype.hasOwnProperty.call(MATERIAL_CRAFTSMANSHIP, material)
      ? MATERIAL_CRAFTSMANSHIP[material]
      : 0;
  }
  if (priority === "statement") {
    return productStyles.some((style) => style === "bold" || style === "artistic") ? 1 : 0;
  }
  return 0;
}

/**
 * Average of the two signals. A missing signal is left out of the average
 * rather than counted as zero. If both are missing, the component is zero.
 */
function comfortVersatilityValue(product) {
  const comfort = comfortRatio(product);
  const versatility = versatilityRatio(product);
  if (comfort == null && versatility == null) return 0;
  if (comfort == null) return versatility;
  if (versatility == null) return comfort;
  return (comfort + versatility) / 2;
}

/**
 * Score one eligible product.
 * prefs must already be normalised: arrays present, colours lowercased,
 * priority null or a known value, maxBudget a positive number.
 */
export function scoreProduct(product, prefs) {
  const occasions = Array.isArray(prefs.occasions) ? prefs.occasions : [];
  const styles = Array.isArray(prefs.styles) ? prefs.styles : [];
  const categories = Array.isArray(prefs.categories) ? prefs.categories : [];
  const colours = Array.isArray(prefs.colours) ? prefs.colours : [];
  const priority = prefs.priority || null;

  const productOccasions = tokens(product.occasions);
  const productStyles = tokens(product.styles);
  const matchedOccasions = overlap(productOccasions, occasions);
  const matchedStyles = overlap(productStyles, styles);

  const components = {
    occasion: {
      active: true,
      value: occasions.length === 0 ? 0 : matchedOccasions.length / occasions.length,
      matched: matchedOccasions,
    },
    style: styles.length > 0
      ? { active: true, value: matchedStyles.length / styles.length, matched: matchedStyles }
      : { active: false, value: 0, matched: [] },
    category: categories.length > 0
      ? {
          active: true,
          value: categories.includes(product.category) ? 1 : 0,
          matched: categories.includes(product.category) ? [product.category] : [],
        }
      : { active: false, value: 0, matched: [] },
  };

  const colourText = typeof product.colour === "string" ? product.colour.trim() : "";
  const colourMatched = colourText !== "" && colours.includes(colourText.toLowerCase());
  components.colour = colours.length > 0
    ? { active: true, value: colourMatched ? 1 : 0, matched: colourMatched ? [colourText] : [] }
    : { active: false, value: 0, matched: [] };

  const priorityScore = priority ? priorityValue(product, priority, productStyles) : 0;
  components.priority = priority
    ? { active: true, value: priorityScore, matched: priorityScore > 0 ? [priority] : [] }
    : { active: false, value: 0, matched: [] };

  components.comfortVersatility = {
    active: true,
    value: comfortVersatilityValue(product),
    matched: [],
  };

  let weighted = 0;
  let totalWeight = 0;
  for (const [key, component] of Object.entries(components)) {
    if (!component.active) continue;
    const weight = WEIGHTS[key];
    weighted += weight * component.value;
    totalWeight += weight;
  }

  const score = totalWeight === 0 ? 0 : Math.round((100 * weighted) / totalWeight);
  return { score, components };
}

import {
  EMPHASIS,
  OCCASIONS,
  PRIORITIES,
  RANKING_MODES,
  SITUATIONS,
  STYLES,
} from "./weights.js";

function uniqueStrings(value, { lower = false } = {}) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const token = lower ? trimmed.toLowerCase() : trimmed;
    if (seen.has(token)) continue;
    seen.add(token);
    result.push(token);
  }
  return result;
}

/**
 * Accepts 15000, "15000", "15,000", and "₹15,000".
 * Anything else becomes NaN so the caller can reject it.
 */
export function parseBudget(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  const cleaned = value.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

export function validatePreferences(prefs) {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) {
    return { ok: false, errors: ["Preferences are missing."], value: null };
  }

  const errors = [];
  const occasions = uniqueStrings(prefs.occasions, { lower: true });
  const styles = uniqueStrings(prefs.styles, { lower: true });
  const dislikedStyles = uniqueStrings(prefs.dislikedStyles, { lower: true });
  const categories = uniqueStrings(prefs.categories);
  const colours = uniqueStrings(prefs.colours, { lower: true });
  const dislikedColours = uniqueStrings(prefs.dislikedColours, { lower: true });
  const materials = uniqueStrings(prefs.materials, { lower: true });
  const priorityRaw = typeof prefs.priority === "string" ? prefs.priority.trim().toLowerCase() : "";
  const emphasisRaw = typeof prefs.emphasis === "string" ? prefs.emphasis.trim() : "";
  const rankingRaw = typeof prefs.ranking === "string" ? prefs.ranking.trim().toLowerCase() : "";
  const situationRaw = typeof prefs.situation === "string" ? prefs.situation.trim().toLowerCase() : "";
  const maxBudget = parseBudget(prefs.maxBudget);
  const sizeRaw = typeof prefs.size === "string" ? prefs.size.trim() : "";
  const likedRaw = typeof prefs.likedProductId === "string" ? prefs.likedProductId.trim() : "";

  if (occasions.length === 0) errors.push("Select at least one occasion.");
  for (const occasion of occasions) {
    if (!OCCASIONS.includes(occasion)) errors.push(`Occasion "${occasion}" is not a recognised option.`);
  }
  for (const style of [...styles, ...dislikedStyles]) {
    if (!STYLES.includes(style)) errors.push(`Style "${style}" is not a recognised option.`);
  }
  if (!Number.isFinite(maxBudget) || maxBudget <= 0) {
    errors.push("Enter a maximum budget greater than 0.");
  }
  if (priorityRaw && !PRIORITIES.includes(priorityRaw)) {
    errors.push("Priority must be comfort, versatility, craftsmanship, statement, or left unset.");
  }
  if (emphasisRaw && !EMPHASIS.includes(emphasisRaw)) {
    errors.push("Emphasis must be balanced, comfort, versatility, appearance, quality, budget fit, or left unset.");
  }
  if (rankingRaw && !RANKING_MODES.includes(rankingRaw)) {
    errors.push("Ranking must be relevance or diverse.");
  }
  if (situationRaw && !SITUATIONS.includes(situationRaw)) {
    errors.push("Situation is not a recognised option.");
  }

  if (errors.length > 0) return { ok: false, errors, value: null };

  const requireInStock = !(prefs.requireInStock === false || prefs.requireInStock === "false");
  const flexible = prefs.flexible === true || prefs.flexible === "true";

  return {
    ok: true,
    errors: [],
    value: {
      situation: situationRaw || null,
      occasions,
      styles,
      dislikedStyles,
      categories,
      colours,
      dislikedColours,
      materials,
      maxBudget,
      requireInStock,
      size: !sizeRaw || sizeRaw.toLowerCase() === "any" ? null : sizeRaw,
      emphasis: emphasisRaw || null,
      priority: priorityRaw || null,
      likedProductId: likedRaw || null,
      flexible,
      ranking: rankingRaw || "relevance",
    },
  };
}

/** Gate predicates. Candidate generation lives in candidates.js and calls these in order. */

export function isWellFormed(product) {
  if (!product || typeof product !== "object") return false;
  if (typeof product.id !== "string" || product.id.trim() === "") return false;
  if (typeof product.name !== "string" || product.name.trim() === "") return false;
  if (typeof product.category !== "string" || product.category.trim() === "") return false;
  return Number.isFinite(Number(product.price));
}

export function sizeRequired(prefs) {
  if (typeof prefs.size !== "string") return false;
  const size = prefs.size.trim().toLowerCase();
  return size !== "" && size !== "any";
}

export function productHasSize(product, size) {
  if (!Array.isArray(product.sizes)) return false;
  return product.sizes.includes(size);
}

/**
 * The first gate a row fails, or null when it passes every active gate.
 * Order matches generateCandidates.
 */
export function firstFailingGate(product, prefs) {
  if (!isWellFormed(product)) return "malformed";
  if (!(Number(product.price) <= prefs.maxBudget)) return "overBudget";
  const categories = Array.isArray(prefs.categories) ? prefs.categories : [];
  if (categories.length > 0 && !categories.includes(product.category)) return "wrongCategory";
  if (prefs.requireInStock !== false && product.availability !== "in_stock") return "unavailable";
  if (sizeRequired(prefs) && !productHasSize(product, prefs.size)) return "wrongSize";
  return null;
}

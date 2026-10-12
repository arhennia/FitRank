/** A row must be identifiable, named, categorised, and priced before it can rank. */
export function isWellFormed(product) {
  if (!product || typeof product !== "object") return false;
  if (typeof product.id !== "string" || product.id.trim() === "") return false;
  if (typeof product.name !== "string" || product.name.trim() === "") return false;
  if (typeof product.category !== "string" || product.category.trim() === "") return false;
  return Number.isFinite(Number(product.price));
}

/**
 * Hard constraints only. Budget always applies. Category applies only when
 * the user selected at least one category.
 */
export function filterProducts(products, prefs) {
  const list = Array.isArray(products) ? products : [];
  const categories = Array.isArray(prefs.categories) ? prefs.categories : [];

  return list.filter((product) => {
    if (!isWellFormed(product)) return false;
    if (Number(product.price) > prefs.maxBudget) return false;
    if (categories.length > 0 && !categories.includes(product.category)) return false;
    return true;
  });
}

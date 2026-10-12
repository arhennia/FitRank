import { buildExplanation } from "./explain.js";
import { filterProducts } from "./filter.js";
import { scoreProduct } from "./score.js";
import { validatePreferences } from "./validate.js";

export const EMPTY_RESULT_MESSAGE =
  "No products match these constraints. Raise your budget or clear a category filter, then try again.";

/** Higher score first. Equal scores break by id so the order never depends on input order. */
export function rankResults(results) {
  return [...results].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.product.id).localeCompare(String(b.product.id));
  });
}

export function recommend(products, rawPrefs) {
  const validation = validatePreferences(rawPrefs);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, products: [], message: null };
  }

  const prefs = validation.value;
  const ranked = rankResults(
    filterProducts(products, prefs).map((product) => {
      const { score, components } = scoreProduct(product, prefs);
      return {
        product,
        score,
        components,
        explanation: buildExplanation(product, prefs, components),
      };
    }),
  );

  if (ranked.length === 0) {
    return { ok: true, errors: [], products: [], message: EMPTY_RESULT_MESSAGE };
  }

  return { ok: true, errors: [], products: ranked, message: null };
}

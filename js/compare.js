export const MAX_COMPARISON = 3;

/**
 * Add or remove a product id. Returns a new id list and never mutates the input.
 * A fourth distinct id is rejected and the previous three stay selected.
 */
export function toggleComparison(selectedIds, productId) {
  const ids = Array.isArray(selectedIds) ? [...selectedIds] : [];
  const index = ids.indexOf(productId);

  if (index !== -1) {
    ids.splice(index, 1);
    return { ok: true, selectedIds: ids, error: null };
  }

  if (ids.length >= MAX_COMPARISON) {
    return {
      ok: false,
      selectedIds: ids,
      error: "You can compare up to 3 products. Remove one to add another.",
    };
  }

  ids.push(productId);
  return { ok: true, selectedIds: ids, error: null };
}

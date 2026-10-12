export const LABEL_TEXT = {
  bestOverall: "Best overall match",
  bestBudgetFit: "Best budget fit",
  mostVersatile: "Most versatile",
  closest: "Closest to the selected item",
};

function uniqueWinner(results, read) {
  let bestValue = null;
  let bestId = null;
  let tied = false;
  for (const item of results) {
    const value = read(item);
    if (!Number.isFinite(value)) continue;
    if (bestValue == null || value > bestValue) {
      bestValue = value;
      bestId = item.product.id;
      tied = false;
    } else if (value === bestValue) {
      tied = true;
    }
  }
  if (tied || bestId == null) return null;
  return bestId;
}

/**
 * Labels require a unique winning calculation. Ties get no exclusive label.
 * The highest raw rating is intentionally not a label.
 */
export function assignLabels(results, { referenceResolved = false } = {}) {
  const ids = {
    bestOverall: uniqueWinner(results, (item) => item.score),
    bestBudgetFit: uniqueWinner(results, (item) => item.components?.budgetFit?.value),
    mostVersatile: uniqueWinner(results, (item) => item.components?.versatility?.value),
    closest: null,
  };
  if (referenceResolved) {
    const closest = uniqueWinner(results, (item) => (
      Number.isFinite(item.similarity) ? item.similarity : Number.NaN
    ));
    const winner = results.find((item) => item.product.id === closest);
    if (winner && winner.similarity > 0) ids.closest = closest;
  }

  const byId = new Map(results.map((item) => [item.product.id, []]));
  for (const [key, id] of Object.entries(ids)) {
    if (!id || !byId.has(id)) continue;
    byId.get(id).push(LABEL_TEXT[key]);
  }
  return { ids, byId };
}

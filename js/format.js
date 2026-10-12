/** Display an illustrative INR amount. Catalogue prices are whole rupees. */
export function formatInr(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "₹—";
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** "work, everyday, and travel" — labels only, no extra claims. */
export function formatList(items) {
  const list = items.filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

/**
 * Explanation text is filled from numbers on the row.
 * A signal that was not used does not appear, and a null component is not turned into zero.
 */

const SIGNAL_LABELS = {
  img: "Image similarity",
  txt: "Text similarity",
  pref: "Preference score",
};

function formatNumber(value) {
  return value.toFixed(3);
}

export function explainRetrievalResult(row) {
  if (!row || typeof row !== "object") return "";
  const lines = [];
  const used = Array.isArray(row.signalsUsed) ? row.signalsUsed : [];
  for (const name of used) {
    const value = row.components?.[name];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const label = SIGNAL_LABELS[name] || name;
    lines.push(`${label} ${formatNumber(value)}.`);
  }
  if (typeof row.score === "number" && Number.isFinite(row.score) && used.length > 0) {
    lines.push(`Combined score ${formatNumber(row.score)} from ${used.join(" and ")}.`);
  }
  if (row.missingEmbedding === true && row.diversity === 0) {
    lines.push("Diversity term 0.000.");
  }
  const removed = row.removed || {};
  const removedLines = [
    ["overBudget", "Budget"],
    ["wrongCategory", "Category"],
    ["unavailable", "Availability"],
    ["wrongSize", "Size"],
  ];
  for (const [key, label] of removedLines) {
    if (typeof removed[key] === "number" && Number.isFinite(removed[key]) && removed[key] > 0) {
      lines.push(`${label} removed ${removed[key]} items before scoring.`);
    }
  }
  return lines.join(" ");
}

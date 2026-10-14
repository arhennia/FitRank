import templates from "./templates.v1.json" with { type: "json" };

function phrase(table, id) {
  if (!table || typeof id !== "string") return null;
  const value = table[id];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Fixed template. The same aesthetics, occasions, and categories always
 * produce the same sentence. An empty soft profile returns null.
 */
export function renderQueryText(soft = {}, hard = {}) {
  const parts = [];
  for (const id of soft.aesthetics || []) {
    const text = phrase(templates.aesthetic, id);
    if (text) parts.push(text);
  }
  for (const id of soft.occasions || []) {
    const text = phrase(templates.occasion, id);
    if (text) parts.push(text);
  }
  for (const id of hard.category || []) {
    const text = phrase(templates.category, id);
    if (text) parts.push(text);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

export function templateVersion() {
  return templates.version;
}

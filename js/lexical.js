export function tokenize(value) {
  return String(value ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * Share of label tokens that appear in the query.
 * An empty query or an empty label scores 0. This is not tuned.
 */
export function lexicalOverlap(query, label) {
  const queryTokens = new Set(tokenize(query));
  const labelTokens = tokenize(label);
  if (queryTokens.size === 0 || labelTokens.length === 0) return 0;
  const hits = labelTokens.filter((token) => queryTokens.has(token)).length;
  return hits / labelTokens.length;
}

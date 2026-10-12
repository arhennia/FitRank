import { formatInr, formatList } from "./format.js";
import { OCCASION_LABELS, PRIORITY_LABELS, STYLE_LABELS } from "./weights.js";

function labels(tokens, table) {
  return tokens.map((token) => table[token] || token);
}

function priorityLine(product, priority) {
  if (priority === "comfort") {
    return `Comfort rating ${product.comfortRating}/5 supports your comfort priority.`;
  }
  if (priority === "versatility") {
    const count = Array.isArray(product.occasions) ? product.occasions.length : 0;
    return `Suitable for ${count} occasions, which supports versatility.`;
  }
  if (priority === "craftsmanship") {
    return `Material ${product.material} supports your craftsmanship priority.`;
  }
  const tags = (Array.isArray(product.styles) ? product.styles : [])
    .map((style) => String(style).trim().toLowerCase())
    .filter((style) => style === "bold" || style === "artistic");
  return `Styles include ${formatList(labels(tags, STYLE_LABELS))}, which supports a statement look.`;
}

/**
 * Every sentence is backed by a component the scorer already marked as a match,
 * plus the budget fact that filtering already enforced.
 */
export function buildExplanation(product, prefs, components) {
  const lines = [];

  if (components.occasion.matched.length > 0) {
    lines.push(`Suited to ${formatList(labels(components.occasion.matched, OCCASION_LABELS))}.`);
  }
  if (components.style.active && components.style.matched.length > 0) {
    lines.push(`Style fit: ${formatList(labels(components.style.matched, STYLE_LABELS))}.`);
  }
  if (components.category.active && components.category.matched.length > 0) {
    lines.push(`Category: ${components.category.matched[0]}.`);
  }
  if (components.colour.active && components.colour.matched.length > 0) {
    lines.push(`Colour ${components.colour.matched[0]} is one of your preferences.`);
  }
  if (components.priority.active && components.priority.value > 0) {
    lines.push(priorityLine(product, prefs.priority));
  }

  const comfort = Number(product.comfortRating);
  const comfortAlreadyStated = prefs.priority === "comfort" && components.priority.value > 0;
  if (!comfortAlreadyStated && product.comfortRating != null && Number.isFinite(comfort)) {
    lines.push(`Comfort rating ${product.comfortRating}/5.`);
  }

  lines.push(
    `Priced at ${formatInr(product.price)}, within your ${formatInr(prefs.maxBudget)} budget.`,
  );
  return lines;
}

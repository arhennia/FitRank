import { firstFailingGate } from "./filter.js";

export const GATE_ORDER = ["malformed", "overBudget", "wrongCategory", "unavailable", "wrongSize"];

export const GATE_LABELS = {
  malformed: "a missing id, name, category, or price",
  overBudget: "budget",
  wrongCategory: "category",
  unavailable: "availability",
  wrongSize: "size",
};

function gateActive(gate, prefs) {
  if (gate === "unavailable") return prefs.requireInStock !== false;
  if (gate === "wrongSize") return typeof prefs.size === "string" && prefs.size.trim() !== "" && prefs.size.trim().toLowerCase() !== "any";
  return true;
}

/**
 * Exhaustive hard-constraint scan. This is the candidate generator at the
 * current catalogue size. It does not score, explain, or compare identity.
 */
export function generateCandidates(products, prefs) {
  let pool = Array.isArray(products) ? products.filter((product) => product != null) : [];
  const counts = {
    malformed: 0,
    overBudget: 0,
    wrongCategory: 0,
    unavailable: 0,
    wrongSize: 0,
  };
  let limiting = null;

  for (const gate of GATE_ORDER) {
    if (!gateActive(gate, prefs)) continue;
    const next = [];
    for (const product of pool) {
      if (firstFailingGate(product, prefs) === gate) counts[gate] += 1;
      else next.push(product);
    }
    if (!limiting && counts[gate] > 0 && next.length === 0) limiting = gate;
    pool = next;
  }

  return {
    candidates: pool,
    report: {
      considered: Array.isArray(products) ? products.length : 0,
      ...counts,
      eligible: pool.length,
      limiting,
    },
  };
}

export function filterProducts(products, prefs) {
  return generateCandidates(products, prefs).candidates;
}

export function emptyResultMessage(report) {
  const removed = GATE_ORDER
    .filter((gate) => report[gate] > 0)
    .map((gate) => `${report[gate]} removed by ${GATE_LABELS[gate]}`);
  const limiting = report.limiting
    ? ` The limiting constraint is ${GATE_LABELS[report.limiting]}.`
    : "";
  const detail = removed.length ? ` ${removed.join("; ")}.` : "";
  return `No products match these constraints.${limiting}${detail}`;
}

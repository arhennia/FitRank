/**
 * Hard constraints for a retrieval catalogue.
 * A constraint whose field is absent from every row fails the search.
 * A row that lacks the field, when other rows have it, fails the gate.
 * Values are never invented to let a row through.
 */

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function hasPrice(product) {
  return Object.prototype.hasOwnProperty.call(product, "price") && Number.isFinite(Number(product.price));
}

function hasAvailability(product) {
  return product.availability === "in_stock" || product.availability === "out_of_stock";
}

function hasSizes(product) {
  return Array.isArray(product.sizes) && product.sizes.length > 0;
}

export function catalogueCapabilities(products) {
  const capabilities = { category: false, price: false, availability: false, size: false };
  for (const product of products || []) {
    if (!product || typeof product !== "object") continue;
    if (hasText(product.category)) capabilities.category = true;
    if (hasPrice(product)) capabilities.price = true;
    if (hasAvailability(product)) capabilities.availability = true;
    if (hasSizes(product)) capabilities.size = true;
  }
  return capabilities;
}

export function requestedConstraints(prefs = {}) {
  const requested = [];
  if (Array.isArray(prefs.categories) && prefs.categories.length > 0) requested.push("category");
  if (prefs.maxBudget != null && prefs.maxBudget !== "" && Number.isFinite(Number(prefs.maxBudget))) {
    requested.push("budget");
  }
  if (prefs.requireInStock === true) requested.push("availability");
  if (typeof prefs.size === "string" && prefs.size.trim() !== "" && prefs.size.trim().toLowerCase() !== "any") {
    requested.push("size");
  }
  return requested;
}

const UNAVAILABLE = {
  category: "Category cannot be applied. No product in this catalogue has a category.",
  budget: "Budget cannot be applied. No product in this catalogue has a price, and a price was not invented.",
  availability: "In-stock cannot be applied. No product in this catalogue has availability, and stock was not invented.",
  size: "Size cannot be applied. No product in this catalogue has sizes, and a size was not invented.",
};

function fails(product, prefs, requested) {
  if (requested.includes("budget")) {
    if (!hasPrice(product) || !(Number(product.price) <= Number(prefs.maxBudget))) return "overBudget";
  }
  if (requested.includes("category")) {
    if (!hasText(product.category) || !prefs.categories.includes(product.category)) return "wrongCategory";
  }
  if (requested.includes("availability") && product.availability !== "in_stock") return "unavailable";
  if (requested.includes("size")) {
    const size = prefs.size.trim();
    if (!Array.isArray(product.sizes) || !product.sizes.includes(size)) return "wrongSize";
  }
  return null;
}

export function applyHardConstraints(products, prefs = {}) {
  const list = Array.isArray(products) ? products.filter((product) => product != null) : [];
  const requested = requestedConstraints(prefs);
  const capabilities = catalogueCapabilities(list);
  const unavailable = requested.filter((name) => {
    if (name === "budget") return !capabilities.price;
    if (name === "availability") return !capabilities.availability;
    if (name === "size") return !capabilities.size;
    return !capabilities.category;
  });
  if (unavailable.length > 0) {
    return {
      ok: false,
      errors: unavailable.map((name) => UNAVAILABLE[name]),
      candidates: [],
      report: {
        considered: list.length,
        requested,
        unavailable,
        removed: { overBudget: 0, wrongCategory: 0, unavailable: 0, wrongSize: 0 },
        eligible: 0,
      },
    };
  }

  const removed = { overBudget: 0, wrongCategory: 0, unavailable: 0, wrongSize: 0 };
  const candidates = [];
  for (const product of list) {
    const gate = fails(product, prefs, requested);
    if (gate) removed[gate] += 1;
    else candidates.push(product);
  }
  return {
    ok: true,
    errors: [],
    candidates,
    report: {
      considered: list.length,
      requested,
      unavailable: [],
      removed,
      eligible: candidates.length,
    },
  };
}

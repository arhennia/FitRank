/**
 * Hard gates for retrieval.
 * An active constraint fails when the attribute it needs is null or absent.
 * Nothing is written back onto the item.
 */

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function text(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function readPrice(item) {
  if (hasOwn(item?.attrs, "price")) {
    const price = item.attrs.price;
    return typeof price === "number" && Number.isFinite(price) ? price : null;
  }
  if (hasOwn(item, "price")) {
    const price = item.price;
    return typeof price === "number" && Number.isFinite(price) ? price : null;
  }
  return null;
}

export function readSizes(item) {
  if (hasOwn(item?.attrs, "size")) {
    const size = item.attrs.size;
    if (typeof size === "string" && size.trim() !== "") return [size];
    if (Array.isArray(size)) return size.filter((entry) => typeof entry === "string" && entry.trim() !== "");
    return [];
  }
  if (Array.isArray(item?.sizes)) {
    return item.sizes.filter((entry) => typeof entry === "string" && entry.trim() !== "");
  }
  return [];
}

/** True only for an explicit in-stock flag. Null and any other value fail an active stock gate. */
export function readInStock(item) {
  if (hasOwn(item?.attrs, "stock")) {
    const stock = item.attrs.stock;
    return stock === true || stock === "in_stock";
  }
  return item?.availability === "in_stock";
}

export function readCategory(item) {
  return text(item?.category);
}

function activeList(values) {
  return Array.isArray(values) && values.length > 0;
}

export function activeConstraints(constraints = {}) {
  const active = [];
  if (activeList(constraints.categories)) active.push("category");
  if (typeof constraints.maxPrice === "number" && Number.isFinite(constraints.maxPrice)) active.push("maxPrice");
  if (activeList(constraints.sizes)) active.push("size");
  if (constraints.inStockOnly === true) active.push("stock");
  return active;
}

/** The first failing gate, or null when every active gate passes. */
export function constraintFailure(item, constraints = {}) {
  if (activeList(constraints.categories)) {
    const category = readCategory(item);
    if (category == null || !constraints.categories.includes(category)) return "category";
  }
  if (typeof constraints.maxPrice === "number" && Number.isFinite(constraints.maxPrice)) {
    const price = readPrice(item);
    if (price == null || price > constraints.maxPrice) return "maxPrice";
  }
  if (activeList(constraints.sizes)) {
    const sizes = readSizes(item);
    if (!sizes.some((size) => constraints.sizes.includes(size))) return "size";
  }
  if (constraints.inStockOnly === true && readInStock(item) !== true) return "stock";
  return null;
}

export function passesConstraints(item, constraints) {
  return constraintFailure(item, constraints) == null;
}

export function applyConstraintGate(items, constraints = {}) {
  const eligible = [];
  const rejected = [];
  for (const item of items || []) {
    const reason = constraintFailure(item, constraints);
    if (reason) rejected.push({ id: item?.id ?? null, reason });
    else eligible.push(item);
  }
  return { eligible, rejected };
}

/** Positional mask. True means the row may be scored. */
export function constraintMask(items, constraints = {}) {
  return (items || []).map((item) => passesConstraints(item, constraints));
}

export function violations(items, constraints = {}) {
  return (items || []).filter((item) => !passesConstraints(item, constraints));
}

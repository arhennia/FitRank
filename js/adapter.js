/**
 * Catalogue adapters. Missing fields stay missing. Nothing here fills in
 * price, stock, size, colour, material, or reviews.
 */

export function adaptFashionImage(entry) {
  if (!entry || typeof entry.id !== "string" || entry.id.trim() === "") {
    throw new Error("Fashion record needs an id");
  }
  if (typeof entry.className !== "string" || entry.className.trim() === "") {
    throw new Error("Fashion record needs a class name");
  }
  if (!Number.isInteger(entry.classId) || entry.classId < 0) {
    throw new Error("Fashion record needs a class id");
  }
  return {
    id: entry.id,
    name: entry.className,
    category: entry.className,
    classId: entry.classId,
    sourceIndex: entry.sourceIndex,
    split: entry.split,
    image: typeof entry.image === "string" ? entry.image : null,
  };
}

const COPY_IF_PRESENT = ["colour", "material", "brand", "description", "image"];

/**
 * Copy a shopper-catalogue row without adding defaults for absent fields.
 */
export function adaptShopperProduct(product) {
  if (!product || typeof product.id !== "string" || product.id.trim() === "") {
    throw new Error("Product needs an id");
  }
  if (typeof product.name !== "string" || product.name.trim() === "") {
    throw new Error("Product needs a name");
  }
  if (typeof product.category !== "string" || product.category.trim() === "") {
    throw new Error("Product needs a category");
  }
  const adapted = {
    id: product.id,
    name: product.name,
    category: product.category,
  };
  if (Number.isFinite(Number(product.price)) && Object.prototype.hasOwnProperty.call(product, "price")) {
    adapted.price = Number(product.price);
  }
  if (product.availability === "in_stock" || product.availability === "out_of_stock") {
    adapted.availability = product.availability;
  }
  if (Array.isArray(product.sizes)) adapted.sizes = [...product.sizes];
  for (const field of COPY_IF_PRESENT) {
    if (Object.prototype.hasOwnProperty.call(product, field) && product[field] != null) {
      adapted[field] = product[field];
    }
  }
  return adapted;
}

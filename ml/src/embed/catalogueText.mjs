import { normalizeText, textCacheId } from "./manifest.mjs";

const LEAK = /\b(relevant|irrelevant|ground truth|ground-truth|duplicate|not a match)\b/i;

/** Title and description only. Category, price, brand, and colour are not added. */
export function catalogueText(product) {
  const name = normalizeText(product.name);
  const description = normalizeText(product.description);
  if (!name) throw new Error(`Product ${product.id} has no name`);
  return description ? `${name}. ${description}` : name;
}

export function auditCatalogue(products) {
  const missingDescription = [];
  const flagged = [];
  const rows = [];
  for (const product of products) {
    if (!product.description) missingDescription.push(product.id);
    const text = catalogueText(product);
    const row = {
      id: product.id,
      templateId: "catalogue-name-description.v1",
      text,
      cacheId: textCacheId(text, "catalogue-name-description.v1"),
    };
    if (LEAK.test(text)) flagged.push({ id: product.id, text });
    rows.push(row);
  }
  return {
    fieldsUsed: ["name", "description"],
    fieldsExcluded: ["category", "brand", "price", "colour", "material", "styles", "sizes", "itemId"],
    products: products.length,
    missingDescription,
    flagged,
    rows,
    note: "Flagged rows contain words that would disclose an evaluation label. They are reported and still not used as relevance labels.",
  };
}

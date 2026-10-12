import { generateCandidates } from "./candidates.js";
import { products as publishedProducts } from "./catalogue.js";
import { firstFailingGate } from "./filter.js";
import { CATEGORIES } from "./weights.js";

/**
 * Fixed shopper used for every catalogue size. The gates are budget, category,
 * availability, and size. This is the exhaustive-scan baseline; it is not an index.
 */
export const CANDIDATE_BENCHMARK_PREFS = Object.freeze({
  occasions: ["everyday", "work"],
  maxBudget: 8000,
  categories: ["Handbags", "Sneakers"],
  requireInStock: true,
  size: "one-size",
});

const SHOE_SIZES = ["UK6", "UK7", "UK8", "UK9"];
const APPAREL_SIZES = ["XS", "S", "M", "L", "XL"];

function sizesFor(category) {
  if (category === "Handbags" || category === "Accessories") return ["one-size"];
  if (category === "Heels" || category === "Flats and loafers" || category === "Sneakers") return SHOE_SIZES;
  return APPAREL_SIZES;
}

/**
 * Deterministic scale fixture. Rows are synthetic and are not shop listings.
 * Every 47th row has a non-numeric price. Every 29th row omits availability.
 * Every 11th row is out of stock, unless availability was omitted.
 */
export function syntheticCatalogue(size) {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error("syntheticCatalogue size must be a positive integer");
  }
  const rows = [];
  for (let index = 0; index < size; index += 1) {
    const category = CATEGORIES[index % CATEGORIES.length];
    const colour = ["black", "brown", "navy", "beige", "white"][index % 5];
    const row = {
      id: `scale-${String(index).padStart(5, "0")}`,
      name: `Scale row ${index}`,
      category,
      brand: "Scale House",
      price: 400 + ((index * 97) % 25000),
      currency: "INR",
      colour,
      colours: [colour],
      styles: ["classic"],
      silhouette: "straight",
      material: "cotton",
      occasions: ["everyday"],
      comfortRating: (index % 5) + 1,
      versatilityRating: 3,
      formalityRating: 3,
      averageRating: 4,
      reviewCount: 10 + (index % 20),
      availability: index % 11 === 0 ? "out_of_stock" : "in_stock",
      sizes: sizesFor(category),
      description: "Synthetic row for the candidate-generation benchmark. Not a shop listing.",
    };
    if (index % 47 === 0) row.price = "missing";
    if (index % 29 === 0) delete row.availability;
    rows.push(row);
  }
  return rows;
}

/** Time one exhaustive scan and count candidates that still fail a hard gate. */
export function measureCandidates(products, prefs = CANDIDATE_BENCHMARK_PREFS) {
  const list = Array.isArray(products) ? products : [];
  const started = performance.now();
  const result = generateCandidates(list, prefs);
  const runtimeMs = performance.now() - started;
  const violationCount = result.candidates.filter((product) => firstFailingGate(product, prefs) != null).length;
  const candidateCount = result.candidates.length;
  return {
    generator: "exhaustive",
    catalogueSize: list.length,
    runtimeMs,
    candidateCount,
    violationCount,
    violationRate: candidateCount === 0 ? null : violationCount / candidateCount,
    report: result.report,
  };
}

export function candidateBenchmarkCatalogues(published = publishedProducts) {
  return [
    { name: "published-60", products: published },
    { name: "synthetic-1000", products: syntheticCatalogue(1000) },
    { name: "synthetic-10000", products: syntheticCatalogue(10000) },
  ];
}

export function runCandidateBenchmark(published = publishedProducts) {
  return candidateBenchmarkCatalogues(published).map((entry) => ({
    name: entry.name,
    ...measureCandidates(entry.products),
  }));
}

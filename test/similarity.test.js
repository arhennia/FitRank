import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { products } from "../js/catalogue.js";
import { parseCsvCatalogue, parseJsonCatalogue, validateCatalogue } from "../js/catalogueIO.js";
import { contentSimilarity, similarProducts } from "../js/similarity.js";
import { componentWeights } from "../js/score.js";

function full(overrides) {
  return {
    id: "a",
    name: "Sample",
    category: "Handbags",
    colour: "black",
    colours: ["black"],
    styles: ["structured", "classic"],
    material: "leather",
    silhouette: "structured",
    occasions: ["work", "everyday"],
    comfortRating: 4,
    price: 1000,
    ...overrides,
  };
}

describe("catalogue import", () => {
  it("accepts the published catalogue", () => {
    const result = validateCatalogue(products);
    assert.deepEqual(result.errors, []);
    assert.equal(result.products.length, 60);
  });

  it("keeps the first duplicate id and rejects invalid rows", () => {
    const result = validateCatalogue([
      {
        id: "a",
        name: "First",
        category: "Tops",
        brand: "Daymark",
        price: 1000,
        currency: "INR",
        colour: "white",
        styles: ["minimalist"],
        occasions: ["everyday"],
      },
      {
        id: "a",
        name: "Second",
        category: "Tops",
        brand: "Daymark",
        price: 1000,
        currency: "INR",
      },
      {
        id: "bad",
        name: "Bad",
        category: "Hats",
        brand: "Daymark",
        price: -5,
        currency: "USD",
        averageRating: 9,
        reviewCount: -1,
        styles: ["sparkly"],
      },
    ]);
    assert.deepEqual(result.products.map((product) => product.name), ["First"]);
    assert.ok(result.errors.some((error) => error.includes("duplicate id")));
    assert.ok(result.errors.some((error) => error.includes("category")));
    assert.ok(result.errors.some((error) => error.includes("price")));
    assert.ok(result.errors.some((error) => error.includes("currency")));
    assert.ok(result.errors.some((error) => error.includes("averageRating")));
    assert.ok(result.errors.some((error) => error.includes("reviewCount")));
    assert.ok(result.errors.some((error) => error.includes("sparkly")));
  });

  it("parses JSON and CSV catalogues", () => {
    const json = readFileSync(new URL("../data/sample-import.json", import.meta.url), "utf8");
    const parsed = parseJsonCatalogue(json);
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.products[0].id, "sample-tee");
    assert.deepEqual(parsed.products[0].sizes, ["S", "M", "L"]);

    const csv = [
      "id,name,category,brand,price,currency,colour,styles,occasions,description",
      'csv-1,Quoted Tee,Tops,Daymark,1800,INR,white,minimalist,everyday,"A tee, with a comma"',
    ].join("\n");
    const fromCsv = parseCsvCatalogue(csv);
    assert.deepEqual(fromCsv.errors, []);
    assert.equal(fromCsv.products[0].description, "A tee, with a comma");
    assert.equal(fromCsv.products[0].price, 1800);
    assert.equal(parseJsonCatalogue("{").errors.length > 0, true);
  });
});

describe("content similarity", () => {
  it("scores identical products at 1 and does not call them duplicates", () => {
    const left = full({ id: "left" });
    const right = full({ id: "right", name: "Other" });
    const similarity = contentSimilarity(left, right);
    assert.equal(similarity.score, 1);
    assert.equal(Object.hasOwn(similarity, "duplicate"), false);
  });

  it("keeps a colour-only cross-category pair below a same-category pair", () => {
    const bag = full({ id: "bag" });
    const otherCategory = full({
      id: "shoe",
      category: "Sneakers",
      styles: ["bold"],
      material: "canvas",
      silhouette: "runner",
      occasions: ["travel"],
      comfortRating: null,
    });
    const differentColour = full({ id: "navy", colour: "navy", colours: ["navy"] });
    const cross = contentSimilarity(bag, otherCategory);
    const sameCategory = contentSimilarity(bag, differentColour);
    assert.ok(Math.abs(cross.score - 0.1) < 1e-9);
    assert.ok(sameCategory.score > cross.score);
    assert.ok(cross.score <= 0.65);
  });

  it("does not treat a missing feature as a perfect match", () => {
    const left = full({ id: "left" });
    const right = full({ id: "right" });
    delete right.silhouette;
    const similarity = contentSimilarity(left, right);
    assert.ok(similarity.score < 1);
    const silhouette = similarity.features.find((feature) => feature.key === "silhouette");
    assert.equal(silhouette.similarity, 0);
    assert.equal(silhouette.weight, 0.1);
  });

  it("breaks similarity ties by id", () => {
    const source = full({ id: "source" });
    const catalogue = [
      full({ id: "b" }),
      full({ id: "a" }),
      source,
    ];
    const ranked = similarProducts(catalogue, "source", {
      occasions: ["work"],
      maxBudget: 100000,
      requireInStock: false,
    });
    assert.deepEqual(ranked.map((item) => item.product.id), ["a", "b"]);
    assert.equal(ranked[0].similarity.score, ranked[1].similarity.score);
  });

  it("treats the canvas tote as similar to the leather tote without a duplicate flag", () => {
    const leather = products.find((product) => product.id === "p01");
    const canvas = products.find((product) => product.id === "p15");
    const similarity = contentSimilarity(leather, canvas);
    const material = similarity.features.find((feature) => feature.key === "material");
    assert.equal(material.similarity, 0);
    assert.ok(similarity.score > 0.5);
    assert.equal(leather.material === canvas.material, false);
  });
});

describe("weight controls", () => {
  it("halves style weight when preferences are flexible", () => {
    const weights = componentWeights({
      styles: ["minimalist"],
      colours: [],
      dislikedColours: [],
      materials: [],
      emphasis: null,
      priority: null,
      flexible: true,
    });
    assert.equal(weights.style, 8);
    assert.equal(weights.comfort, 14 * 1.25);
  });
});

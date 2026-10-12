import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toggleComparison } from "../js/compare.js";
import { products } from "../js/catalogue.js";
import { emptyResultMessage, generateCandidates } from "../js/candidates.js";
import { recommend } from "../js/recommend.js";
import { scoreProduct } from "../js/score.js";
import { validatePreferences } from "../js/validate.js";
import { CATEGORIES, WEIGHTS } from "../js/weights.js";

function piece(overrides) {
  return {
    id: "p01",
    name: "Sample Piece",
    category: "Handbags",
    colour: "black",
    styles: ["minimalist"],
    occasions: ["work"],
    material: "leather",
    comfortRating: 4,
    formalityRating: 3,
    price: 5000,
    availability: "in_stock",
    description: "A test product.",
    ...overrides,
  };
}

const validPrefs = {
  occasions: ["work"],
  styles: ["minimalist"],
  categories: ["Handbags"],
  colours: ["black"],
  maxBudget: 15000,
  priority: null,
};

describe("catalogue", () => {
  it("contains 60 unique, well-formed illustrative products", () => {
    assert.equal(products.length, 60);
    const ids = new Set(products.map((product) => product.id));
    assert.equal(ids.size, 60);
    for (const product of products) {
      assert.equal(typeof product.id, "string");
      assert.equal(typeof product.name, "string");
      assert.equal(typeof product.brand, "string");
      assert.equal(product.currency, "INR");
      assert.ok(CATEGORIES.includes(product.category));
      assert.equal(typeof product.price, "number");
      assert.ok(product.price > 0);
    }
    const tote = products.find((product) => product.id === "p01");
    const canvasTote = products.find((product) => product.id === "p15");
    assert.equal(tote.material, "leather");
    assert.equal(canvasTote.material, "canvas");
    assert.equal(tote.colour, "black");
    assert.equal(canvasTote.colour, "black");
    assert.equal(products.filter((product) => product.availability === "out_of_stock").length, 1);
    assert.ok(products.some((product) => product.averageRating === 5 && product.reviewCount === 2));
    assert.ok(products.some((product) => product.averageRating === 4.2 && product.reviewCount === 200));
  });
});

describe("filtering", () => {
  it("excludes products above the budget and keeps a price equal to the budget", () => {
    const catalogue = [
      piece({ id: "low", price: 200 }),
      piece({ id: "edge", price: 1000 }),
      piece({ id: "high", price: 1001 }),
    ];
    const result = recommend(catalogue, { ...validPrefs, categories: [], maxBudget: 1000 });
    const ids = result.products.map((item) => item.product.id);
    assert.deepEqual([...ids].sort(), ["edge", "low"]);
  });

  it("treats selected categories as a required constraint", () => {
    const catalogue = [
      piece({ id: "bag", category: "Handbags" }),
      piece({ id: "heel", category: "Heels", price: 100 }),
    ];
    const result = recommend(catalogue, { ...validPrefs, categories: ["Heels"], maxBudget: 20000 });
    assert.deepEqual(result.products.map((item) => item.product.id), ["heel"]);
  });

  it("does not drop every product when no category is selected", () => {
    const catalogue = [
      piece({ id: "bag", category: "Handbags" }),
      piece({ id: "heel", category: "Heels" }),
    ];
    const result = recommend(catalogue, { ...validPrefs, categories: [], maxBudget: 20000 });
    assert.equal(result.products.length, 2);
  });

  it("skips malformed rows instead of throwing", () => {
    const catalogue = [
      { id: "", name: "Nameless", category: "Handbags", price: 10 },
      { id: "ok", name: "Kept", category: "Handbags", price: 10, availability: "in_stock" },
      null,
    ];
    const eligible = generateCandidates(catalogue, { categories: [], maxBudget: 100, requireInStock: true }).candidates;
    assert.deepEqual(eligible.map((product) => product.id), ["ok"]);
  });

  it("names the limiting hard gate and does not relax it", () => {
    const catalogue = [
      piece({ id: "pricey", price: 5000 }),
      piece({ id: "also", price: 8000 }),
    ];
    const result = recommend(catalogue, { ...validPrefs, categories: [], maxBudget: 10 });
    assert.equal(result.ok, true);
    assert.deepEqual(result.products, []);
    assert.match(result.message, /No products match/);
    assert.equal(result.constraintReport.limiting, "overBudget");
    assert.match(result.message, /budget/);
  });

  it("excludes a missing availability value when in-stock is required", () => {
    const catalogue = [
      piece({ id: "stocked" }),
      piece({ id: "unknown", availability: undefined }),
    ];
    const { candidates, report } = generateCandidates(catalogue, { ...validPrefs, requireInStock: true });
    assert.deepEqual(candidates.map((product) => product.id), ["stocked"]);
    assert.equal(report.unavailable, 1);
  });

  it("excludes a high rating that misses the budget", () => {
    const catalogue = [
      piece({ id: "famous", price: 900, averageRating: 5, reviewCount: 2 }),
      piece({ id: "affordable", price: 80, averageRating: 4.2, reviewCount: 200 }),
    ];
    const result = recommend(catalogue, { ...validPrefs, categories: [], maxBudget: 100 });
    assert.deepEqual(result.products.map((item) => item.product.id), ["affordable"]);
  });
});

describe("scoring and ranking", () => {
  it("gives a higher score when occasion and style overlap", () => {
    const close = piece({ id: "close", occasions: ["work"], styles: ["minimalist"] });
    const far = piece({ id: "far", occasions: ["travel"], styles: ["bold"] });
    const result = recommend([far, close], { ...validPrefs, categories: [], colours: [] });
    assert.equal(result.products[0].product.id, "close");
    assert.ok(result.products[0].score > result.products[1].score);
  });

  it("changes rank order when the preferred style changes", () => {
    const catalogue = [
      piece({ id: "quiet", styles: ["minimalist"] }),
      piece({ id: "loud", styles: ["bold"] }),
    ];
    const base = { occasions: ["work"], categories: [], colours: [], maxBudget: 20000, priority: null };
    const minimalist = recommend(catalogue, { ...base, styles: ["minimalist"] });
    const bold = recommend(catalogue, { ...base, styles: ["bold"] });
    assert.equal(minimalist.products[0].product.id, "quiet");
    assert.equal(bold.products[0].product.id, "loud");
  });

  it("uses partial credit for multiple style selections", () => {
    const { components } = scoreProduct(piece({ styles: ["minimalist", "classic"] }), {
      occasions: ["work"],
      styles: ["minimalist", "bold", "artistic"],
      categories: [],
      colours: [],
      priority: null,
      maxBudget: 20000,
    });
    assert.ok(Math.abs(components.style.value - 1 / 3) < 1e-9);
  });

  it("renormalises inactive optional weights and scores missing attributes as 0", () => {
    const { score, components } = scoreProduct(
      piece({
        occasions: ["work"],
        styles: [],
        comfortRating: 5,
      }),
      {
        occasions: ["work"],
        styles: [],
        categories: [],
        colours: [],
        priority: null,
      },
    );
    assert.equal(components.style.active, false);
    assert.equal(components.colour.active, false);
    assert.equal(components.comfort.value, 1);
    const active = Object.values(components).filter((component) => component.active);
    const weight = active.reduce((sum, component) => sum + component.weight, 0);
    const weighted = active.reduce((sum, component) => sum + component.weight * component.value, 0);
    assert.equal(weight, 76);
    assert.equal(score, Math.round((100 * weighted) / weight));
    assert.equal(score, 52);

    const missing = scoreProduct(
      { id: "bare", name: "Bare", category: "Handbags", price: 100, occasions: ["work"] },
      {
        occasions: ["work"],
        styles: ["minimalist"],
        colours: ["black"],
        maxBudget: 500,
        priority: null,
      },
    );
    assert.equal(missing.components.comfort.value, 0);
    assert.equal(missing.components.colour.value, 0);
    assert.notEqual(missing.components.comfort.value, 1);
  });

  it("returns the same ranking for identical inputs", () => {
    const catalogue = [
      piece({ id: "p02", styles: ["classic"], occasions: ["everyday"] }),
      piece({ id: "p01", styles: ["classic"], occasions: ["everyday"] }),
    ];
    const prefs = { occasions: ["work", "everyday"], styles: ["classic"], maxBudget: "15,000" };
    const once = recommend(catalogue, prefs);
    const twice = recommend(catalogue, prefs);
    assert.deepEqual(once, twice);
    assert.deepEqual(
      once.products.map((item) => item.product.id),
      ["p01", "p02"],
    );
    assert.equal(once.products[0].score, once.products[1].score);
  });

  it("does not describe budget fit as market value", () => {
    const result = recommend([piece({ price: 1000, averageRating: 4.5, reviewCount: 40 })], {
      ...validPrefs,
      categories: [],
      colours: [],
      styles: [],
      maxBudget: 10000,
    });
    const text = [...result.products[0].explanation, ...result.products[0].tradeoffs].join(" ");
    assert.match(text, /not a fair-price judgement/);
    assert.doesNotMatch(text, /market value/i);
    assert.equal(result.products[0].labels.includes("Best budget fit"), true);
  });
});

describe("validation and empty states", () => {
  it("rejects missing, empty, and non-numeric preferences", () => {
    assert.equal(recommend(products, null).ok, false);
    assert.deepEqual(recommend(products, null).products, []);

    const empty = validatePreferences({ occasions: [], maxBudget: 0 });
    assert.equal(empty.ok, false);
    assert.ok(empty.errors.some((error) => error.includes("occasion")));
    assert.ok(empty.errors.some((error) => error.includes("budget")));

    const junk = recommend(products, { occasions: ["work"], maxBudget: "abc", styles: ["sparkly"] });
    assert.equal(junk.ok, false);
    assert.ok(junk.errors.some((error) => error.includes("budget")));
    assert.ok(junk.errors.some((error) => error.includes("sparkly")));
  });

  it("does not crash when optional product attributes are missing", () => {
    const bare = { id: "bare", name: "Bare Piece", category: "Handbags", price: 100, availability: "in_stock" };
    const result = recommend([bare], {
      occasions: ["work"],
      styles: ["minimalist"],
      colours: ["black"],
      categories: ["Handbags"],
      maxBudget: 500,
      priority: "comfort",
    });
    assert.equal(result.ok, true);
    assert.equal(result.products.length, 1);
    assert.equal(typeof result.products[0].score, "number");
    assert.ok(Number.isFinite(result.products[0].score));
    const text = result.products[0].explanation.join(" ");
    assert.equal(text.includes("Comfort rating"), false);
    assert.match(text, /within your/);
    assert.equal(result.products[0].components.comfort.value, 0);
  });

  it("returns a useful message when nothing qualifies", () => {
    const result = recommend([piece({ price: 5000 })], { ...validPrefs, maxBudget: 10 });
    assert.equal(result.ok, true);
    assert.deepEqual(result.products, []);
    assert.match(result.message, /No products match/);
    assert.match(emptyResultMessage(result.constraintReport), /No products match/);
  });
});

describe("explanations", () => {
  it("mentions only attributes that actually matched", () => {
    const result = recommend(
      [piece({
        id: "navy-bag",
        name: "Plain Bag",
        colour: "navy",
        styles: ["minimalist"],
        occasions: ["work"],
        material: "leather",
        comfortRating: 4,
      })],
      {
        occasions: ["work", "evening"],
        styles: ["minimalist", "bold"],
        categories: ["Handbags"],
        colours: ["black", "brown"],
        maxBudget: 20000,
        priority: "craftsmanship",
      },
    );
    const text = result.products[0].explanation.join(" ");
    assert.match(text, /Suited to work/);
    assert.doesNotMatch(text, /evening/);
    assert.match(text, /Style fit: minimalist/);
    assert.doesNotMatch(text, /bold/);
    assert.match(text, /Category: Handbags/);
    assert.doesNotMatch(text, /Colour/);
    assert.match(text, /Material leather supports your craftsmanship priority/);
    assert.match(text, /Comfort rating 4\/5/);
    assert.match(text, /₹5,000/);
    assert.doesNotMatch(text, /duplicate/i);
  });
});

describe("comparison", () => {
  it("stops at three products and does not mutate the original list", () => {
    const selected = ["a", "b", "c"];
    const rejected = toggleComparison(selected, "d");
    assert.equal(rejected.ok, false);
    assert.match(rejected.error, /3/);
    assert.deepEqual(rejected.selectedIds, ["a", "b", "c"]);
    assert.deepEqual(selected, ["a", "b", "c"]);

    const removed = toggleComparison(rejected.selectedIds, "b");
    assert.equal(removed.ok, true);
    assert.deepEqual(removed.selectedIds, ["a", "c"]);

    const added = toggleComparison(removed.selectedIds, "d");
    assert.equal(added.ok, true);
    assert.deepEqual(added.selectedIds, ["a", "c", "d"]);
  });
});

describe("weights", () => {
  it("still sums to 100", () => {
    const total = Object.values(WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    assert.equal(total, 100);
  });
});

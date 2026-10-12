import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assignLabels } from "../js/labels.js";
import { rankByRelevance, rerankMMR } from "../js/rank.js";
import { recommend } from "../js/recommend.js";
import { contentSimilarity } from "../js/similarity.js";

function tote(id, score) {
  return {
    product: {
      id,
      name: id,
      category: "Handbags",
      colour: "black",
      colours: ["black"],
      styles: ["structured", "classic"],
      material: "leather",
      silhouette: "structured",
      occasions: ["work"],
      comfortRating: 4,
    },
    score,
    components: {
      budgetFit: { value: 0.2 },
      versatility: { value: 0.4 },
    },
    similarity: null,
  };
}

function jacket(score) {
  return {
    product: {
      id: "jacket",
      name: "Jacket",
      category: "Jackets and coats",
      colour: "beige",
      colours: ["beige"],
      styles: ["minimalist"],
      material: "linen",
      silhouette: "unstructured",
      occasions: ["travel"],
      comfortRating: 5,
    },
    score,
    components: {
      budgetFit: { value: 0.2 },
      versatility: { value: 0.4 },
    },
    similarity: null,
  };
}

describe("MMR reranking", () => {
  it("matches relevance order when lambda is 1", () => {
    const input = [tote("b", 70), jacket(80), tote("a", 80)];
    assert.deepEqual(
      rerankMMR(input, { lambda: 1 }).map((item) => item.product.id),
      rankByRelevance(input).map((item) => item.product.id),
    );
  });

  it("separates stylistically similar alternatives when a different item exists", () => {
    const input = [tote("twin", 79), tote("lead", 80), jacket(78)];
    const relevance = rankByRelevance(input).map((item) => item.product.id);
    const diverse = rerankMMR(input, { lambda: 0.7 }).map((item) => item.product.id);
    assert.deepEqual(relevance, ["lead", "twin", "jacket"]);
    assert.equal(diverse[0], "lead");
    assert.equal(diverse[1], "jacket");
    assert.deepEqual(new Set(diverse), new Set(relevance));
    assert.ok(contentSimilarity(input[0].product, input[1].product).score > contentSimilarity(input[1].product, input[2].product).score);
  });

  it("stays deterministic for identical items, a diverse pool, and a short pool", () => {
    const identical = [tote("b", 50), tote("a", 50)];
    const once = rerankMMR(identical).map((item) => item.product.id);
    const twice = rerankMMR(identical).map((item) => item.product.id);
    assert.deepEqual(once, twice);
    assert.deepEqual(once, ["a", "b"]);

    const diversePool = [jacket(40), tote("solo", 55)];
    assert.deepEqual(
      rerankMMR(diversePool).map((item) => item.product.id),
      rerankMMR(diversePool).map((item) => item.product.id),
    );
    assert.deepEqual(rerankMMR([tote("only", 10)]).map((item) => item.product.id), ["only"]);
    assert.deepEqual(rerankMMR([]), []);
  });
});

describe("decision labels", () => {
  it("withholds an exclusive label when the top score is tied", () => {
    const labels = assignLabels([
      tote("a", 10),
      tote("b", 10),
    ]);
    assert.equal(labels.ids.bestOverall, null);
    tote("a", 10).components.versatility.value = 0.2;
    const versatile = assignLabels([
      { ...tote("a", 10), components: { budgetFit: { value: 0.2 }, versatility: { value: 0.2 } } },
      { ...tote("b", 10), components: { budgetFit: { value: 0.4 }, versatility: { value: 0.9 } } },
    ]);
    assert.equal(versatile.ids.bestOverall, null);
    assert.equal(versatile.ids.mostVersatile, "b");
    assert.equal(versatile.ids.bestBudgetFit, "b");
    assert.deepEqual(versatile.byId.get("b"), ["Best budget fit", "Most versatile"]);
  });

  it("does not label the reference item as a recommendation of itself", () => {
    const result = recommend(
      [
        {
          id: "ref",
          name: "Reference",
          category: "Flats and loafers",
          colour: "brown",
          styles: ["minimalist"],
          occasions: ["everyday"],
          material: "leather",
          silhouette: "loafer",
          comfortRating: 5,
          price: 1000,
          availability: "in_stock",
        },
        {
          id: "near",
          name: "Near",
          category: "Flats and loafers",
          colour: "brown",
          styles: ["minimalist"],
          occasions: ["everyday"],
          material: "leather",
          silhouette: "loafer",
          comfortRating: 4,
          price: 1200,
          availability: "in_stock",
        },
      ],
      {
        occasions: ["everyday"],
        styles: ["minimalist"],
        categories: ["Flats and loafers"],
        maxBudget: 5000,
        likedProductId: "ref",
      },
    );
    assert.deepEqual(result.products.map((item) => item.product.id), ["near"]);
    assert.ok(result.assumptions.some((line) => line.includes("not ranked against itself")));
    assert.equal(result.labels.closest, "near");
    assert.match(result.products[0].explanation.join(" "), /Closest attributes/);
    assert.doesNotMatch(result.products[0].explanation.join(" "), /duplicate/i);
  });
});

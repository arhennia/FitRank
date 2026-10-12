import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cataloguePrior, smoothedRating } from "../js/quality.js";
import { recommend } from "../js/recommend.js";

describe("Bayesian review smoothing", () => {
  it("does not let two perfect reviews beat a large slightly lower sample", () => {
    const prior = 3.5;
    const few = smoothedRating({ rating: 5, count: 2, prior, m: 10 });
    const many = smoothedRating({ rating: 4.2, count: 200, prior, m: 10 });
    assert.equal(few.ok, true);
    assert.equal(many.ok, true);
    assert.ok(Math.abs(few.value - 3.75) < 1e-12);
    assert.ok(Math.abs(many.value - (875 / 210)) < 1e-12);
    assert.ok(many.value > few.value);
  });

  it("returns the prior when the count is zero and rejects invalid inputs", () => {
    const priorOnly = smoothedRating({ rating: 5, count: 0, prior: 3.5, m: 10 });
    assert.equal(priorOnly.value, 3.5);
    assert.equal(smoothedRating({ rating: 8, count: 10, prior: 3.5 }).ok, false);
    assert.equal(smoothedRating({ rating: 4, count: -1, prior: 3.5 }).ok, false);
    assert.equal(smoothedRating({ rating: 4, count: 1.5, prior: 3.5 }).ok, false);
  });

  it("uses a review-count-weighted catalogue prior", () => {
    const prior = cataloguePrior([
      { averageRating: 5, reviewCount: 2 },
      { averageRating: 4, reviewCount: 8 },
      { averageRating: 9, reviewCount: 100 },
    ]);
    assert.ok(Math.abs(prior - ((5 * 2 + 4 * 8) / 10)) < 1e-12);
    assert.equal(cataloguePrior([]), 3.5);
  });

  it("does not let review quality override a poor style match", () => {
    const loud = {
      id: "loud",
      name: "Loud",
      category: "Handbags",
      colour: "red",
      styles: ["bold"],
      occasions: ["evening"],
      material: "silk",
      comfortRating: 2,
      formalityRating: 5,
      price: 1000,
      availability: "in_stock",
      averageRating: 5,
      reviewCount: 500,
    };
    const quiet = {
      id: "quiet",
      name: "Quiet",
      category: "Handbags",
      colour: "black",
      styles: ["minimalist"],
      occasions: ["work"],
      material: "leather",
      comfortRating: 4,
      formalityRating: 4,
      price: 1000,
      availability: "in_stock",
      averageRating: 3.5,
      reviewCount: 20,
    };
    const result = recommend([loud, quiet], {
      occasions: ["work"],
      styles: ["minimalist"],
      categories: [],
      colours: [],
      maxBudget: 5000,
    });
    assert.equal(result.products[0].product.id, "quiet");
  });
});

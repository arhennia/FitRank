import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { products } from "../js/catalogue.js";
import { evaluateSuite, evaluationQuality } from "../js/evaluate.js";
import { generateCandidates } from "../js/candidates.js";
import {
  catalogueCoverage,
  intraListDiversity,
  ndcgAtK,
  precisionAtK,
  violationRate,
} from "../js/metrics.js";
import { SHOPPER_SCENARIOS } from "./fixtures/scenarios.js";

describe("metric arithmetic", () => {
  it("computes precision, NDCG, coverage, diversity, and violations", () => {
    assert.equal(precisionAtK(["a", "b", "c"], ["a", "c"], 2), 0.5);
    assert.equal(precisionAtK([], ["a"], 5), null);
    assert.equal(ndcgAtK(["a"], { a: 1 }, 1), 1);
    assert.equal(ndcgAtK(["b"], { a: 1 }, 1), 0);
    assert.equal(ndcgAtK(["a", "b"], { a: 1, b: 1 }, 2), 1);
    assert.equal(ndcgAtK(["a"], {}, 1), null);
    assert.equal(ndcgAtK([], { a: 1 }, 5), null);

    const dcg = (1 / Math.log2(2)) + (0 / Math.log2(3)) + (1 / Math.log2(4));
    const idcg = (1 / Math.log2(2)) + (1 / Math.log2(3));
    assert.ok(Math.abs(ndcgAtK(["a", "b", "c"], { a: 1, c: 1 }, 3) - dcg / idcg) < 1e-12);

    assert.equal(catalogueCoverage([["p01"], ["p01", "p02"]], 10), 0.2);
    assert.equal(intraListDiversity([{ id: "only" }], 5), null);
    assert.equal(violationRate([], {}, () => true), null);
    assert.equal(violationRate([{ id: "bad" }, { id: "ok" }], {}, (product) => product.id === "bad"), 0.5);
  });
});

describe("synthetic evaluation", () => {
  it("does not build ground truth from the ranker", () => {
    const source = SHOPPER_SCENARIOS;
    assert.equal(source.length, 6);
    assert.ok(source.every((scenario) => Array.isArray(scenario.relevantIds)));
    assert.equal(source.find((scenario) => scenario.id === "none-eligible").relevantIds.length, 0);
  });

  it("enforces hard gates on the strict, sparse, and empty shoppers", () => {
    const strict = SHOPPER_SCENARIOS.find((scenario) => scenario.id === "strict-budget");
    const strictResult = generateCandidates(products, {
      ...strict.preferences,
      requireInStock: true,
    });
    assert.deepEqual(
      strictResult.candidates.map((product) => product.id).sort(),
      ["p04", "p19", "p20", "p21"],
    );

    const few = SHOPPER_SCENARIOS.find((scenario) => scenario.id === "few-eligible");
    const fewResult = generateCandidates(products, few.preferences);
    assert.deepEqual(fewResult.candidates.map((product) => product.id), ["p38"]);

    const none = SHOPPER_SCENARIOS.find((scenario) => scenario.id === "none-eligible");
    const noneResult = generateCandidates(products, none.preferences);
    assert.equal(noneResult.candidates.length, 0);
    assert.equal(noneResult.report.limiting, "overBudget");
  });

  it("returns reproducible metrics and zero hard-constraint violations", () => {
    const once = evaluateSuite(products);
    const twice = evaluateSuite(products);
    assert.deepEqual(evaluationQuality(once), evaluationQuality(twice));
    assert.equal(once.k, 5);
    assert.equal(typeof once.runtimeMs.baseline, "number");
    assert.equal(typeof once.runtimeMs.hybrid, "number");
    assert.ok(once.runtimeMs.baseline >= 0);
    assert.ok(once.runtimeMs.hybrid >= 0);
    assert.equal(once.scenarios.length, 6);

    for (const row of once.scenarios) {
      for (const side of [row.baseline, row.hybrid]) {
        if (row.id === "none-eligible") {
          assert.deepEqual(side.ids, []);
          assert.equal(side.precisionAtK, null);
          assert.equal(side.ndcgAtK, null);
          assert.equal(side.violationRate, null);
        } else {
          assert.equal(side.violationRate, 0);
          assert.equal(typeof side.precisionAtK, "number");
          assert.ok(side.precisionAtK >= 0 && side.precisionAtK <= 1);
        }
      }
    }

    const few = once.scenarios.find((row) => row.id === "few-eligible");
    assert.deepEqual(few.hybrid.ids, ["p38"]);
    assert.equal(few.hybrid.intraListDiversity, null);

    assert.equal(typeof once.coverage.hybrid, "number");
    assert.ok(once.coverage.hybrid > 0 && once.coverage.hybrid <= 1);
    assert.ok(once.notes.some((note) => note.includes("not a user study")));
  });
});

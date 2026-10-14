import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { products } from "../js/catalogue.js";
import { buildIntent } from "../js/intent/buildIntent.js";
import { answersFromIntent, constraintsFromIntent } from "../js/intent/adapter.js";
import { searchCatalogue } from "../js/retrieval/search.js";
import { withShoppingAnnotations } from "../js/shopping/annotations.js";
import { applyShoppingGates, scanBaseCandidates } from "../js/shopping/gates.js";
import { validateConstraints } from "../js/shopping/profile.js";
import { recommendFromIntent } from "../js/shopping/recommendIntent.js";
import { QUESTIONS } from "../js/shopping/vocabulary.js";
import { intentFixtures } from "./fixtures/intent-sets.js";
import { mulberry32 } from "../js/vector.js";

function unit(seed) {
  const random = mulberry32(seed);
  const values = [random(), random(), random()];
  const scale = Math.hypot(...values);
  return values.map((value) => value / scale);
}

function embeddingsFor(list, seed = 7) {
  const map = new Map();
  list.forEach((product, index) => map.set(product.id, unit(seed + index + 1)));
  return map;
}

function gatedIds(list, intent) {
  const constraints = validateConstraints(constraintsFromIntent(intent)).value;
  const scanned = scanBaseCandidates(list.map(withShoppingAnnotations), constraints);
  return new Set(applyShoppingGates(scanned.candidates, constraints).candidates.map((product) => product.id));
}

describe("catalogue search", () => {
  it("matches the current scorer when the profile has no query text", () => {
    for (const fixture of intentFixtures.slice(0, 3)) {
      const intent = buildIntent(fixture);
      intent.query.text = null;
      const direct = recommendFromIntent(products, fixture);
      const searched = searchCatalogue(intent, { products, arm: "hybrid" });
      assert.equal(searched.normalization, "legacy");
      assert.deepEqual(
        searched.products.map((item) => [item.id, item.score]),
        direct.products.map((item) => [item.product.id, item.score]),
      );
    }
  });

  it("matches the current scorer when the soft profile is empty", () => {
    const intent = buildIntent(intentFixtures[0]);
    intent.soft = {
      ...intent.soft,
      aesthetics: [],
      occasions: [],
      priorities: {},
    };
    const direct = recommendFromIntent(products, intentFixtures[0]);
    const searched = searchCatalogue(intent, {
      products,
      embeddings: embeddingsFor(products),
      queryVector: unit(3),
      arm: "hybrid",
    });
    assert.equal(searched.normalization, "legacy");
    assert.deepEqual(
      searched.products.map((item) => item.id),
      direct.products.map((item) => item.product.id),
    );
  });

  it("names the answers that drove the attribute signal", () => {
    const intent = buildIntent(intentFixtures[0]);
    const result = searchCatalogue(intent, {
      products,
      embeddings: embeddingsFor(products),
      queryVector: unit(5),
      arm: "hybrid",
    });
    const row = result.products.find((item) => item.signalsUsed.includes("attribute"));
    assert.ok(row);
    assert.match(row.explanation, /contexts/);
    assert.equal(row.explanation.includes("over your"), false);
  });

  it("drops a gate violator even when its text similarity is 1", () => {
    const fixture = intentFixtures[0];
    const intent = buildIntent(fixture);
    const violator = {
      ...products[0],
      id: "violator",
      price: 999999,
      availability: "in_stock",
    };
    const list = [...products, violator];
    const embeddings = embeddingsFor(list);
    const queryVector = embeddings.get("violator").slice();
    const result = searchCatalogue(intent, {
      products: list,
      embeddings,
      queryVector,
      arm: "hybrid",
    });
    assert.equal(result.products.some((item) => item.id === "violator"), false);
    assert.equal(result.violations, 0);
    const allowed = gatedIds(list, intent);
    for (const item of result.products) assert.equal(allowed.has(item.id), true);
  });

  it("counts an eligible item that has no text embedding", () => {
    const intent = buildIntent(intentFixtures[0]);
    const embeddings = embeddingsFor(products);
    const legacy = recommendFromIntent(products, intentFixtures[0]);
    const missingId = legacy.products[0].product.id;
    embeddings.delete(missingId);
    const result = searchCatalogue(intent, {
      products,
      embeddings,
      queryVector: unit(99),
      arm: "hybrid",
    });
    assert.ok(result.missingEmbeddings.includes(missingId));
    const row = result.products.find((item) => item.id === missingId);
    assert.ok(row);
    assert.equal(row.raw.embed, undefined);
    assert.equal(typeof row.raw.attribute, "number");
  });

  it("returns the same ranking for the same inputs", () => {
    const intent = buildIntent(intentFixtures[1]);
    const options = {
      products,
      embeddings: embeddingsFor(products, 3),
      queryVector: unit(4),
      arm: "hybrid_mmr",
    };
    const once = searchCatalogue(intent, options);
    const twice = searchCatalogue(intent, options);
    assert.deepEqual(
      once.products.map((item) => [item.id, item.score]),
      twice.products.map((item) => [item.id, item.score]),
    );
  });

  it("keeps zero gate violations across random intents", () => {
    const random = mulberry32(20261014);
    for (let trial = 0; trial < 20; trial += 1) {
      const answers = {};
      for (const question of QUESTIONS) {
        if (question.selection === "single") {
          answers[question.id] = question.options[Math.floor(random() * question.options.length)].id;
        } else {
          answers[question.id] = [question.options[Math.floor(random() * question.options.length)].id];
        }
      }
      const intent = buildIntent({
        answers,
        constraints: {
          maxBudget: 1500 + Math.floor(random() * 20000),
          budgetType: "item",
          categories: random() > 0.5 ? ["handbags"] : [],
          requireInStock: true,
        },
      });
      const result = searchCatalogue(intent, {
        products,
        embeddings: embeddingsFor(products, trial + 11),
        queryVector: unit(trial + 40),
        arm: "hybrid",
      });
      assert.equal(result.ok, true);
      assert.equal(result.weightsValidated, false);
      assert.equal(result.violations, 0);
      const allowed = gatedIds(products, intent);
      for (const item of result.products) {
        assert.equal(allowed.has(item.id), true, item.id);
        assert.equal(item.explanation.includes("over your"), false);
      }
      assert.deepEqual(answersFromIntent(intent).trigger, answers.trigger);
    }
  });
});

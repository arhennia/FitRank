import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { adaptFashionImage, adaptShopperProduct } from "../js/adapter.js";
import { applyHardConstraints } from "../js/constraints.js";
import { decidePair, scoreDecisions } from "../js/duplicates.js";
import { summariseByClass, summariseQueries } from "../js/evaluateRetrieval.js";
import { diversify, hybridScore, orderCandidates } from "../js/hybridRank.js";
import { lexicalOverlap } from "../js/lexical.js";
import { precisionAtK, recallAtK } from "../js/metrics.js";
import { decodePixelCache, encodePixelCache } from "../js/pixelCache.js";
import {
  CLASS_NAMES,
  DIVERSITY_LAMBDA,
  DIVERSITY_POOL,
  HYBRID_SIGNAL_WEIGHT,
  INDEX_PER_CLASS,
  NAME_COSINE_THRESHOLD,
  SCORE_DEFINITION,
  TEST_PER_CLASS,
  VALIDATION_PER_CLASS,
  assignClassMembers,
  literalQuery,
} from "../js/retrievalProtocol.js";
import { retrieveCatalogue } from "../js/retrieve.js";
import { cosine, l2Normalize, meanPairwiseDiversity, randomScores, rankByScore } from "../js/vector.js";
import listings from "../data/listings/listings.json" with { type: "json" };
import pairsFile from "../data/listings/pairs.json" with { type: "json" };
import textQueries from "../experiments/text-queries.json" with { type: "json" };

function listing(id) {
  return listings.listings.find((row) => row.listingId === id);
}

describe("retrieval protocol", () => {
  it("keeps index, validation, and test source indexes apart", () => {
    const members = assignClassMembers(Array.from({ length: 120 }, (_, index) => 1000 + index));
    const bySplit = { index: [], validation: [], test: [] };
    for (const row of members) bySplit[row.split].push(row.sourceIndex);
    assert.equal(bySplit.index.length, INDEX_PER_CLASS);
    assert.equal(bySplit.validation.length, VALIDATION_PER_CLASS);
    assert.equal(bySplit.test.length, TEST_PER_CLASS);
    const all = [...bySplit.index, ...bySplit.validation, ...bySplit.test];
    assert.equal(new Set(all).size, 120);
    assert.equal(bySplit.validation[0], 1100);
    assert.equal(bySplit.test[0], 1110);
    assert.throws(() => assignClassMembers([1, 2, 3]), /Need 120/);
  });

  it("freezes the hybrid definition and separates the paraphrase sets", () => {
    assert.equal(HYBRID_SIGNAL_WEIGHT.image, 1);
    assert.equal(HYBRID_SIGNAL_WEIGHT.text, 1);
    assert.equal(DIVERSITY_LAMBDA, 0.7);
    assert.equal(DIVERSITY_POOL, 50);
    assert.equal(NAME_COSINE_THRESHOLD, 0.9);
    assert.match(SCORE_DEFINITION, /omitted from the numerator and the denominator/);
    assert.match(SCORE_DEFINITION, /does not invent/);
    assert.equal(textQueries.literalTemplate, "a photo of a {}");
    assert.equal(literalQuery("Coat"), "a photo of a Coat");
    const validation = Object.values(textQueries.validationParaphrases);
    const test = Object.values(textQueries.testParaphrases);
    assert.equal(validation.length, CLASS_NAMES.length);
    assert.equal(test.length, CLASS_NAMES.length);
    assert.equal(validation.some((query) => test.includes(query)), false);
    for (const name of CLASS_NAMES) {
      assert.equal(typeof textQueries.validationParaphrases[name], "string");
      assert.equal(typeof textQueries.testParaphrases[name], "string");
    }
  });
});

describe("generated split", () => {
  it("keeps the manifest disjoint when it has been built", () => {
    const file = new URL("../experiments/fashion-mnist/manifest.json", import.meta.url);
    if (!existsSync(file)) return;
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(manifest.counts.index, 1000);
    assert.equal(manifest.counts.validation, 100);
    assert.equal(manifest.counts.test, 100);
    const sources = new Set();
    const ids = new Set();
    for (const image of manifest.images) {
      assert.equal(ids.has(image.id), false);
      ids.add(image.id);
      const key = `${image.classId}:${image.sourceIndex}`;
      assert.equal(sources.has(key), false);
      sources.add(key);
      assert.equal(Object.hasOwn(image, "price"), false);
    }
    const indexSources = new Set(
      manifest.images.filter((image) => image.split === "index").map((image) => `${image.classId}:${image.sourceIndex}`),
    );
    for (const image of manifest.images) {
      if (image.split === "index") continue;
      assert.equal(indexSources.has(`${image.classId}:${image.sourceIndex}`), false);
    }
  });
});

describe("vectors and pixels", () => {
  it("normalizes, rejects a zero vector, and ranks ties by id", () => {
    assert.deepEqual(l2Normalize([3, 4]), [0.6, 0.8]);
    assert.equal(l2Normalize([0, 0]), null);
    assert.equal(cosine([1, 0], [1, 0]), 1);
    assert.equal(cosine([1, 0], [0, 1, 0]), null);
    const ranked = rankByScore([
      { id: "b", score: 0.5 },
      { id: "a", score: 0.5 },
      { id: "c", score: 0.2 },
    ]);
    assert.deepEqual(ranked.map((row) => row.id), ["a", "b", "c"]);
    const left = randomScores(["b", "a"], "query");
    const right = randomScores(["a", "b"], "query");
    assert.equal(left.get("a"), right.get("a"));
    assert.notEqual(left.get("a"), left.get("b"));
  });

  it("round-trips a pixel cache without changing bytes", () => {
    const first = Uint8Array.from({ length: 784 }, (_, index) => index % 255);
    const second = Uint8Array.from({ length: 784 }, () => 0);
    second[3] = 9;
    const decoded = decodePixelCache(encodePixelCache([first, second]));
    assert.equal(decoded.length, 2);
    assert.deepEqual(decoded[0], first);
    assert.deepEqual(decoded[1], second);
  });
});

describe("hard constraints", () => {
  const images = [
    { id: "coat", name: "Coat", category: "Coat", classId: 4 },
    { id: "shoe", name: "Sneaker", category: "Sneaker", classId: 7 },
    { id: "blank", name: "Missing", classId: 1 },
  ];

  it("does not invent price, stock, or size, and fails those constraints", () => {
    const snapshot = JSON.stringify(images);
    for (const prefs of [
      { maxBudget: 1000 },
      { requireInStock: true },
      { size: "M" },
    ]) {
      const result = applyHardConstraints(images, prefs);
      assert.equal(result.ok, false);
      assert.equal(result.candidates.length, 0);
      assert.equal(result.errors.length, 1);
      assert.match(result.errors[0], /not invented/);
    }
    assert.equal(JSON.stringify(images), snapshot);
    assert.equal(Object.hasOwn(images[0], "price"), false);
  });

  it("applies a category gate and rejects a row with no category", () => {
    const result = applyHardConstraints(images, { categories: ["Coat"] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.candidates.map((row) => row.id), ["coat"]);
    assert.equal(result.report.removed.wrongCategory, 2);
  });

  it("keeps a priced catalogue on its real prices", () => {
    const products = [
      { id: "cheap", name: "A", category: "Coat", price: 20, availability: "in_stock", sizes: ["M"] },
      { id: "dear", name: "B", category: "Coat", price: 80, availability: "out_of_stock", sizes: ["S"] },
      { id: "missing", name: "C", category: "Coat" },
    ];
    const budget = applyHardConstraints(products, { maxBudget: 50 });
    assert.deepEqual(budget.candidates.map((row) => row.id), ["cheap"]);
    const stock = applyHardConstraints(products, { requireInStock: true });
    assert.deepEqual(stock.candidates.map((row) => row.id), ["cheap"]);
    const size = applyHardConstraints(products, { size: "M" });
    assert.deepEqual(size.candidates.map((row) => row.id), ["cheap"]);
  });
});

describe("adapters", () => {
  it("keeps fashion rows free of shopper fields", () => {
    const adapted = adaptFashionImage({
      id: "fm-test-coat-000",
      classId: 4,
      className: "Coat",
      split: "test",
      sourceIndex: 12,
      image: "experiments/fashion-mnist/images/fm-test-coat-000.png",
      price: 10,
      availability: "in_stock",
    });
    assert.equal(adapted.category, "Coat");
    assert.equal(Object.hasOwn(adapted, "price"), false);
    assert.equal(Object.hasOwn(adapted, "availability"), false);
    assert.equal(Object.hasOwn(adapted, "sizes"), false);
  });

  it("does not fill stock or price on a shopper row that lacks them", () => {
    const adapted = adaptShopperProduct({ id: "p", name: "Tee", category: "Tops" });
    assert.equal(Object.hasOwn(adapted, "price"), false);
    assert.equal(Object.hasOwn(adapted, "availability"), false);
    assert.equal(Object.hasOwn(adapted, "sizes"), false);
  });
});

describe("hybrid score and diversity", () => {
  const image = l2Normalize([1, 0]);
  const text = l2Normalize([0, 1]);
  const both = l2Normalize([1, 1]);

  it("drops a missing query signal instead of scoring it as zero", () => {
    assert.equal(hybridScore({ imageVector: image }, image).score, 1);
    assert.equal(hybridScore({ textVector: text }, text).score, 1);
    const mixed = hybridScore({ imageVector: image, textVector: text }, both);
    assert.ok(Math.abs(mixed.score - cosine(image, both)) < 1e-12);
    assert.equal(mixed.signals.text, mixed.signals.image);
    assert.equal(hybridScore({}, image).ok, false);
    assert.equal(hybridScore({ imageVector: image }, null).ok, false);
  });

  it("uses embedding redundancy and leaves lambda 1 unchanged", () => {
    const vectors = new Map([
      ["a", l2Normalize([1, 0])],
      ["b", l2Normalize([0.99, 0.01])],
      ["c", l2Normalize([0, 1])],
    ]);
    const rows = [
      { id: "a", score: 0.9 },
      { id: "b", score: 0.88 },
      { id: "c", score: 0.5 },
    ];
    assert.deepEqual(diversify(rows, vectors, 1).map((row) => row.id), ["a", "b", "c"]);
    assert.equal(diversify(rows, vectors, 0.7)[1].id, "c");
    const many = Array.from({ length: 60 }, (_, index) => ({ id: `id-${index}`, score: 60 - index }));
    const wide = new Map(many.map((row) => [row.id, l2Normalize([1, row.score])]));
    const diverse = orderCandidates(many, wide, "diverse");
    assert.equal(diverse.diversityPoolExcluded, 10);
    assert.equal(diverse.rows.length, DIVERSITY_POOL);
    assert.equal(diverse.rows.some((row) => row.id === "id-59"), false);
  });

  it("explains only the signals that were present and keeps the category gate", () => {
    const products = [
      { id: "coat", name: "Coat", category: "Coat" },
      { id: "shoe", name: "Sneaker", category: "Sneaker" },
    ];
    const vectors = new Map([
      ["coat", [1, 0]],
      ["shoe", [0, 1]],
    ]);
    const result = retrieveCatalogue(products, {
      categories: ["Coat"],
      imageVector: [1, 0],
      ranking: "relevance",
    }, vectors);
    assert.equal(result.ok, true);
    assert.deepEqual(result.products.map((row) => row.id), ["coat"]);
    assert.match(result.products[0].reasons.join(" "), /Image similarity/);
    assert.equal(result.products[0].reasons.some((line) => line.startsWith("Text")), false);
    assert.match(result.products[0].reasons.join(" "), /Category removed 1/);
    const blocked = retrieveCatalogue(products, { maxBudget: 10, imageVector: [1, 0] }, vectors);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.products.length, 0);
  });
});

describe("duplicate decisions", () => {
  it("ignores description and itemId and keeps the frozen exact-name miss", () => {
    const source = readFileSync(new URL("../js/duplicates.js", import.meta.url), "utf8");
    assert.equal(source.includes("itemId"), false);
    assert.equal(source.includes("description"), false);
    const loafer = listing("lst-loafer-field");
    const suede = listing("lst-loafer-suede");
    const changed = decidePair(
      { ...loafer, description: "same item", itemId: "x" },
      { ...suede, description: "different story", itemId: "y" },
      { identity: "exact" },
    );
    assert.equal(changed.label, "similar_style");
    const sneaker = decidePair(listing("lst-sneaker-kite"), listing("lst-sneaker-resale"), { identity: "exact" });
    assert.equal(sneaker.label, "attribute_conflict");
    const unrelated = decidePair(listing("lst-coat-archive"), listing("lst-sneaker-kite"), { identity: "exact" });
    assert.equal(unrelated.label, "unrelated");
    const clipConflict = decidePair(loafer, suede, { identity: "clip", nameCosine: 0.91 });
    assert.equal(clipConflict.label, "attribute_conflict");
    const clipMiss = decidePair(loafer, suede, { identity: "clip", nameCosine: 0.89 });
    assert.equal(clipMiss.label, "similar_style");
    assert.equal(decidePair(loafer, suede, { identity: "clip" }).ok, false);
  });

  it("scores the 13 hand pairs with the exact-name rule and states the sample size", () => {
    assert.equal(pairsFile.pairs.length, 13);
    const scored = pairsFile.pairs.map((pair) => ({
      ...pair,
      predicted: decidePair(listing(pair.listingA), listing(pair.listingB), { identity: "exact" }).label,
    }));
    const report = scoreDecisions(scored);
    assert.equal(report.n, 13);
    assert.match(report.warning, /13 pairs/);
    assert.equal(report.perLabel.probable_duplicate.recall, 1);
    assert.equal(report.perLabel.unrelated.recall, 1);
    const loafer = scored.find((pair) => pair.id === "pair-conflict-loafer-material");
    assert.equal(loafer.predicted, "similar_style");
    assert.notEqual(loafer.predicted, loafer.label);
  });
});

describe("retrieval metrics", () => {
  it("computes recall and per-class failure lists from the ranked ids", () => {
    assert.equal(recallAtK(["a", "b", "c"], ["a", "c", "d", "e"], 2), 0.25);
    assert.equal(recallAtK([], ["a"], 5), null);
    assert.equal(recallAtK(["a"], [], 5), null);
    assert.equal(precisionAtK(["a"], ["a"], 5), 0.2);
    const summary = summariseQueries([
      {
        queryId: "q1",
        className: "Coat",
        ids: ["other", "coat-1"],
        relevantIds: ["coat-1"],
        topClass: "Shirt",
        diversity: 0.4,
        latencyMs: 2,
      },
      {
        queryId: "q2",
        className: "Coat",
        ids: ["coat-1"],
        relevantIds: ["coat-1"],
        topClass: "Coat",
        diversity: 0.2,
        latencyMs: 4,
      },
    ], 1);
    assert.equal(summary.failureCount, 1);
    assert.equal(summary.failures[0].queryId, "q1");
    assert.equal(summary.precisionAtK, 0.5);
    assert.equal(summariseByClass([
      { queryId: "q1", className: "Bag", ids: ["b"], relevantIds: ["b"], topClass: "Bag" },
    ], 1).Bag.precisionAtK, 1);
    assert.ok(lexicalOverlap("a photo of a coat", "Coat") > 0);
    assert.equal(lexicalOverlap("a lace up athletic shoe", "Sneaker"), 0);
    assert.equal(meanPairwiseDiversity([[1, 0], [0, 1]]), 1);
  });
});

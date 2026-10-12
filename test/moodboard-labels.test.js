import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const labels = JSON.parse(readFileSync(new URL("../prototypes/moodboard/labels.json", import.meta.url), "utf8"));

describe("moodboard preparation labels", () => {
  it("uses dataset class ids and keeps the query image out of the product list", () => {
    assert.equal(labels.source, "fashion-mnist-t10k-class-ids");
    assert.equal(labels.queries.length, 10);
    assert.equal(labels.products.length, 30);
    const productIds = new Set(labels.products.map((product) => product.id));
    const classes = new Set();
    for (const query of labels.queries) {
      classes.add(query.classId);
      assert.equal(query.relevantIds.length, 3);
      assert.equal(productIds.has(query.id), false);
      for (const id of query.relevantIds) {
        const product = labels.products.find((item) => item.id === id);
        assert.equal(product.classId, query.classId);
      }
    }
    assert.equal(classes.size, 10);
  });

  it("keeps the recorded CLIP trial above the chance baseline", () => {
    const results = JSON.parse(readFileSync(new URL("../prototypes/moodboard/results.json", import.meta.url), "utf8"));
    assert.equal(results.modelId, "Xenova/clip-vit-base-patch32");
    assert.deepEqual(results.embeddingShape, [1, 512]);
    assert.equal(results.queries.length, 10);
    assert.ok(results.meanPrecisionAtK > results.chancePrecisionAtK);
    assert.equal(results.classTop1Accuracy, 0.7);
    assert.equal(typeof results.meanEmbedMs, "number");
  });
});

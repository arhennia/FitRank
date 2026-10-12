import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  activeConstraints,
  applyConstraintGate,
  constraintMask,
  passesConstraints,
  readPrice,
  violations,
} from "../js/retrieval/constraints.js";
import { explainRetrievalResult } from "../js/retrieval/explain.js";
import { fuseRrf, fuseWeighted, QUERY_ZSCORE_MIN_POOL, RRF_K } from "../js/retrieval/fuse.js";
import { mmrSelect, plainRank } from "../js/retrieval/mmr.js";
import { clipImageToImage, clipTextToImage, lexicalClassScore, pixelCosine } from "../js/retrieval/sources.js";
import { dotProductTopK } from "../js/retrieval/topK.js";
import { loadVectorStore, openVectorStore } from "../js/retrieval/vectorStore.js";
import { mulberry32 } from "../js/vector.js";

function storeFrom(ids, rows, { normChecked = true } = {}) {
  const dim = rows[0].length;
  const floats = new Float32Array(ids.length * dim);
  rows.forEach((row, index) => floats.set(row, index * dim));
  return openVectorStore({
    manifest: { dim, count: ids.length, normChecked },
    ids,
    floats,
  });
}

function oracleFailures(item, constraints) {
  const failures = [];
  if (Array.isArray(constraints.categories) && constraints.categories.length > 0) {
    if (typeof item.category !== "string" || !constraints.categories.includes(item.category)) failures.push("category");
  }
  if (typeof constraints.maxPrice === "number" && Number.isFinite(constraints.maxPrice)) {
    const price = item.attrs && Object.prototype.hasOwnProperty.call(item.attrs, "price")
      ? item.attrs.price
      : item.price;
    if (typeof price !== "number" || !Number.isFinite(price) || price > constraints.maxPrice) failures.push("maxPrice");
  }
  if (Array.isArray(constraints.sizes) && constraints.sizes.length > 0) {
    let sizes = [];
    if (item.attrs && Object.prototype.hasOwnProperty.call(item.attrs, "size")) {
      const size = item.attrs.size;
      if (typeof size === "string" && size.trim() !== "") sizes = [size];
    } else if (Array.isArray(item.sizes)) {
      sizes = item.sizes.filter((entry) => typeof entry === "string" && entry !== "");
    }
    if (!sizes.some((size) => constraints.sizes.includes(size))) failures.push("size");
  }
  if (constraints.inStockOnly === true) {
    let inStock = false;
    if (item.attrs && Object.prototype.hasOwnProperty.call(item.attrs, "stock")) {
      inStock = item.attrs.stock === true || item.attrs.stock === "in_stock";
    } else {
      inStock = item.availability === "in_stock";
    }
    if (!inStock) failures.push("stock");
  }
  return failures;
}

describe("vector store", () => {
  it("loads a manifest and a Float32 buffer and rejects a truncated file", () => {
    const dir = join(tmpdir(), `fitrank-store-${Date.now()}`);
    mkdirSync(dir);
    const ids = ["a", "b"];
    const floats = new Float32Array([1, 0, 0, 1]);
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({ dim: 2, count: 2, normChecked: true }));
    writeFileSync(join(dir, "ids.json"), JSON.stringify(ids));
    writeFileSync(join(dir, "emb.f32"), Buffer.from(floats.buffer));
    const store = loadVectorStore(dir);
    assert.equal(store.count, 2);
    assert.equal(store.dim, 2);
    assert.equal(store.vector("b")[1], 1);
    assert.equal(store.indexOf("a"), 0);
    writeFileSync(join(dir, "emb.f32"), Buffer.from(floats.buffer, 0, 4));
    assert.throws(() => loadVectorStore(dir), /emb\.f32 length/);
  });

  it("rejects a non-unit row when the manifest says norms were checked", () => {
    assert.throws(
      () => storeFrom(["a"], [[1, 0.2]]),
      /norm/,
    );
  });

  it("reads the sprint index cache when it is present", () => {
    const dir = new URL(
      "../ml/artifacts/5284f6b32b13dca1200659f57293cdfd315789282f16b85a2d576d3fa3fa55f4",
      import.meta.url,
    );
    if (!existsSync(dir)) return;
    const store = loadVectorStore(dir);
    assert.equal(store.count, 2000);
    assert.equal(store.dim, 512);
    assert.equal(store.ids.length, 2000);
    assert.equal(store.vector(store.ids[0]).length, 512);
  });
});

describe("top-k", () => {
  const store = storeFrom(
    ["b", "a", "c"],
    [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
  );

  it("returns the known neighbour first", () => {
    const hits = dotProductTopK(store, [1, 0, 0], { k: 2 });
    assert.equal(hits[0].id, "a");
    assert.equal(hits[0].score, 1);
    assert.equal(hits[1].id, "b");
    assert.equal(hits[1].score, 0);
  });

  it("drops a masked row even when it is the neighbour", () => {
    const hits = dotProductTopK(store, [1, 0, 0], { k: 3, mask: [true, false, true] });
    assert.deepEqual(hits.map((hit) => hit.id), ["b", "c"]);
  });

  it("breaks equal scores by id", () => {
    const tied = storeFrom(
      ["b", "a"],
      [
        [1, 0],
        [1, 0],
      ],
    );
    const forward = dotProductTopK(tied, [1, 0], { k: 2 });
    const flipped = storeFrom(
      ["a", "b"],
      [
        [1, 0],
        [1, 0],
      ],
    );
    const backward = dotProductTopK(flipped, [1, 0], { k: 2 });
    assert.deepEqual(forward.map((hit) => hit.id), ["a", "b"]);
    assert.deepEqual(backward.map((hit) => hit.id), ["a", "b"]);
    assert.equal(forward[0].score, forward[1].score);
  });

  it("matches an exhaustive sort on a random matrix", () => {
    const random = mulberry32(20261012);
    const count = 40;
    const dim = 8;
    const ids = Array.from({ length: count }, (_, index) => `row-${String(index).padStart(2, "0")}`);
    const rows = ids.map(() => {
      const values = Array.from({ length: dim }, () => random() * 2 - 1);
      let square = 0;
      for (const value of values) square += value * value;
      const scale = Math.sqrt(square);
      return values.map((value) => value / scale);
    });
    const matrix = storeFrom(ids, rows);
    const query = rows[7];
    const mask = ids.map((_, index) => index % 5 !== 0);
    const hits = dotProductTopK(matrix, query, { k: 5, mask });
    const brute = [];
    for (let index = 0; index < count; index += 1) {
      if (!mask[index]) continue;
      let score = 0;
      for (let axis = 0; axis < dim; axis += 1) score += rows[index][axis] * query[axis];
      brute.push({ id: ids[index], score });
    }
    brute.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.id.localeCompare(right.id);
    });
    assert.deepEqual(hits.map((hit) => hit.id), brute.slice(0, 5).map((hit) => hit.id));
  });
});

describe("sources", () => {
  it("names image and text CLIP search without changing the neighbour", () => {
    const store = storeFrom(["far", "near"], [[0, 1], [1, 0]]);
    const image = clipImageToImage(store, [1, 0], { k: 1 });
    const text = clipTextToImage(store, [1, 0], { k: 1 });
    assert.equal(image.source, "clip-i2i");
    assert.equal(text.source, "clip-t2i");
    assert.equal(image.hits[0].id, "near");
    assert.equal(text.hits[0].id, "near");
  });

  it("scores raw and mean-centered pixels", () => {
    assert.equal(pixelCosine([0, 255], [255, 0], "raw"), 0);
    const centered = pixelCosine([0, 255], [255, 0], "mean-centered");
    assert.ok(Math.abs(centered - (-1)) < 1e-12);
    assert.equal(pixelCosine([4, 4], [1, 1], "mean-centered"), null);
  });

  it("matches class-name tokens and does not treat a synonym as the class", () => {
    assert.equal(lexicalClassScore("a photo of a coat", "Coat"), 1);
    assert.equal(lexicalClassScore("tee", "T-shirt/top"), 0);
    assert.equal(lexicalClassScore("a warm sweater", "Pullover"), 0);
    assert.equal(lexicalClassScore("shirt", "T-shirt/top"), 1 / 3);
  });
});

describe("constraints", () => {
  const blank = {
    id: "blank",
    category: null,
    attrs: { price: null, brand: null, color: null, size: null, stock: null, rating: null },
  };

  it("fails a null attribute when that constraint is active and leaves the null in place", () => {
    assert.equal(readPrice(blank), null);
    assert.equal(passesConstraints(blank, {}), true);
    assert.equal(passesConstraints(blank, { maxPrice: 100 }), false);
    assert.equal(passesConstraints(blank, { categories: ["Coat"] }), false);
    assert.equal(passesConstraints(blank, { sizes: ["M"] }), false);
    assert.equal(passesConstraints(blank, { inStockOnly: true }), false);
    assert.equal(blank.attrs.price, null);
    assert.equal(blank.attrs.size, null);
    assert.equal(blank.attrs.stock, null);
    const catalogue = { id: "shop", category: "Tops", price: 40, sizes: ["M"], availability: "in_stock" };
    assert.equal(passesConstraints(catalogue, { maxPrice: 40, sizes: ["M"], inStockOnly: true, categories: ["Tops"] }), true);
  });

  it("keeps zero violations across 1000 random constraint and item pairs", () => {
    const random = mulberry32(20261012);
    const categories = ["Tops", "Bags"];
    let kept = 0;
    let rejected = 0;
    for (let index = 0; index < 1000; index += 1) {
      const sprintShaped = random() < 0.5;
      const item = sprintShaped
        ? {
          id: `sprint-${index}`,
          category: random() < 0.25 ? null : categories[random() < 0.5 ? 0 : 1],
          attrs: {
            price: random() < 0.3 ? null : Math.floor(random() * 100),
            size: random() < 0.3 ? null : (random() < 0.5 ? "M" : "L"),
            stock: random() < 0.3 ? null : random() < 0.5,
            brand: null,
            color: null,
            rating: null,
          },
        }
        : {
          id: `shop-${index}`,
          category: random() < 0.25 ? null : categories[random() < 0.5 ? 0 : 1],
          price: random() < 0.3 ? null : Math.floor(random() * 100),
          sizes: random() < 0.3 ? null : [random() < 0.5 ? "M" : "L"],
          availability: random() < 0.3 ? null : (random() < 0.5 ? "in_stock" : "out_of_stock"),
        };
      const constraints = {};
      if (random() < 0.6) constraints.categories = random() < 0.5 ? ["Tops"] : ["Tops", "Bags"];
      if (random() < 0.6) constraints.maxPrice = Math.floor(random() * 80);
      if (random() < 0.6) constraints.sizes = ["M"];
      if (random() < 0.6) constraints.inStockOnly = true;
      const gated = applyConstraintGate([item], constraints);
      assert.equal(violations(gated.eligible, constraints).length, 0);
      for (const row of gated.eligible) assert.deepEqual(oracleFailures(row, constraints), []);
      for (const row of gated.rejected) {
        const original = row.id === item.id ? item : null;
        assert.ok(original);
        assert.ok(oracleFailures(original, constraints).length > 0);
      }
      kept += gated.eligible.length;
      rejected += gated.rejected.length;
      if (sprintShaped) {
        assert.equal(Object.prototype.hasOwnProperty.call(item.attrs, "price"), true);
      }
    }
    assert.ok(kept > 0);
    assert.ok(rejected > 0);
    assert.equal(kept + rejected, 1000);
  });

  it("never returns a similarity-1 item that fails a gate", () => {
    const items = [
      {
        id: "violator",
        category: "Coat",
        attrs: { price: null, brand: null, color: null, size: null, stock: null, rating: null },
      },
      {
        id: "ok",
        category: "Coat",
        attrs: { price: 40, brand: null, color: null, size: "M", stock: true, rating: null },
      },
    ];
    const store = storeFrom(
      ["violator", "ok"],
      [
        [1, 0],
        [0, 1],
      ],
    );
    const constraints = { maxPrice: 50 };
    const mask = constraintMask(items, constraints);
    assert.deepEqual(mask, [false, true]);
    const hits = clipImageToImage(store, [1, 0], { k: 2, mask }).hits;
    assert.equal(hits.some((hit) => hit.id === "violator"), false);
    assert.equal(hits[0].id, "ok");
    assert.equal(hits[0].score, 0);
    const returned = hits.map((hit) => items.find((item) => item.id === hit.id));
    assert.equal(violations(returned, constraints).length, 0);
    assert.deepEqual(activeConstraints(constraints), ["maxPrice"]);
  });
});

describe("fusion", () => {
  it("renormalizes weights when a signal is missing", () => {
    const stored = { img: { mean: 0, stdev: 1 }, txt: { mean: 0, stdev: 1 } };
    const fused = fuseWeighted(
      [
        { id: "only-image", signals: { img: 2, txt: null } },
        { id: "both", signals: { img: 2, txt: 4 } },
      ],
      { img: 1, txt: 3 },
      stored,
    );
    assert.equal(fused.ok, true);
    assert.equal(fused.normalization.img.source, "stored");
    const imageOnly = fused.rows.find((row) => row.id === "only-image");
    const both = fused.rows.find((row) => row.id === "both");
    assert.deepEqual(imageOnly.signalsUsed, ["img"]);
    assert.equal(imageOnly.score, 2);
    assert.equal(both.score, (1 * 2 + 3 * 4) / 4);
    assert.equal(Object.prototype.hasOwnProperty.call(imageOnly.components, "txt"), false);
  });

  it("uses the query pool at 30 rows and stored moments below that", () => {
    const ones = Array.from({ length: QUERY_ZSCORE_MIN_POOL }, (_, index) => ({
      id: `row-${index}`,
      signals: { img: 1 },
    }));
    const fromQuery = fuseWeighted(ones, { img: 1 }, { img: { mean: 5, stdev: 1 } });
    assert.equal(fromQuery.normalization.img.source, "query");
    assert.equal(fromQuery.rows[0].score, 0);
    const small = ones.slice(0, QUERY_ZSCORE_MIN_POOL - 1);
    const fromStored = fuseWeighted(small, { img: 1 }, { img: { mean: 5, stdev: 1 } });
    assert.equal(fromStored.normalization.img.source, "stored");
    assert.equal(fromStored.rows[0].score, -4);
    const missing = fuseWeighted(small, { img: 1 }, {});
    assert.equal(missing.ok, false);
  });

  it("scores RRF at k = 60 without a zero for a missing list", () => {
    assert.equal(RRF_K, 60);
    const fused = fuseRrf(
      [
        { id: "a", signals: { img: 0.9, txt: null } },
        { id: "b", signals: { img: 0.8, txt: 0.2 } },
        { id: "c", signals: { img: 0.1, txt: 0.9 } },
      ],
      { img: 1, txt: 1 },
    );
    const byId = Object.fromEntries(fused.rows.map((row) => [row.id, row]));
    assert.equal(byId.a.score, 1 / 61);
    assert.deepEqual(byId.a.signalsUsed, ["img"]);
    assert.equal(byId.b.score, 1 / 62 + 1 / 62);
    assert.equal(byId.c.score, 1 / 63 + 1 / 61);
  });
});

describe("mmr", () => {
  it("matches plain score order when lambda is 1", () => {
    const items = [
      { id: "b", score: 0.2 },
      { id: "a", score: 0.5 },
      { id: "c", score: 0.2 },
      { id: "d", score: 0.9 },
    ];
    const vectors = new Map([
      ["b", [1, 0]],
      ["a", [1, 0]],
      ["d", [0, 1]],
    ]);
    const selected = mmrSelect(items, vectors, 1);
    assert.deepEqual(selected.map((row) => row.id), plainRank(items).map((row) => row.id));
    assert.equal(selected.find((row) => row.id === "c").missingEmbedding, true);
  });

  it("gives a missing embedding diversity term 0", () => {
    const items = [
      { id: "a", score: 1 },
      { id: "b", score: 0.5 },
      { id: "c", score: 0.5 },
    ];
    const vectors = new Map([
      ["a", [1, 0]],
      ["b", [1, 0]],
    ]);
    const selected = mmrSelect(items, vectors, 0);
    assert.deepEqual(selected.map((row) => row.id), ["a", "c", "b"]);
    const blank = selected.find((row) => row.id === "c");
    assert.equal(blank.missingEmbedding, true);
    assert.equal(blank.diversity, 0);
    assert.equal(selected.find((row) => row.id === "b").diversity, 1);
  });
});

describe("explanations", () => {
  it("uses only the numbers for signals that were actually used", () => {
    const text = explainRetrievalResult({
      score: 0.5,
      signalsUsed: ["img"],
      components: { img: 0.5, txt: null },
      missingEmbedding: true,
      diversity: 0,
      removed: { overBudget: 2, wrongCategory: 0 },
    });
    assert.equal(
      text,
      "Image similarity 0.500. Combined score 0.500 from img. Diversity term 0.000. Budget removed 2 items before scoring.",
    );
    assert.equal(text.includes("Text"), false);
    assert.equal(text.includes("null"), false);
    assert.equal(text.includes("Category"), false);
  });
});

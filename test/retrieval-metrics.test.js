import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { bootstrapStatistic, pairedBootstrap } from "../js/retrieval/bootstrap.js";
import { fuseRrf, fuseWeighted } from "../js/retrieval/fuse.js";
import {
  coverageAtK,
  dcgAtK,
  distinctCount,
  hitAtK,
  intraListDiversity,
  macroAverage,
  ndcgAtK,
  percentile,
  precisionAtK,
  rPrecision,
  recallAtK,
  reciprocalRank,
  violationRate,
} from "../js/retrieval/metrics.js";
import { buildArms } from "../ml/src/eval/arms.mjs";
import { hashConfig } from "../ml/src/eval/hash.mjs";
import { fuseSignalScores, rankFromSignals } from "../js/retrieval/rankFromSignals.js";
import { selectHybridArm, selectLambda } from "../js/retrieval/selection.js";
import { plainRank } from "../js/retrieval/mmr.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(readFileSync(join(root, "ml", "config", "tuning.v1.json"), "utf8"));

describe("tuning grid", () => {
  it("builds every pre-registered arm and hashes a config independently of key order", () => {
    const arms = buildArms(spec);
    assert.equal(arms.length, 71);
    assert.equal(arms.filter((arm) => arm.selectable).length, 54);
    assert.equal(arms.filter((arm) => arm.task === "image").length, 3);
    assert.equal(arms.filter((arm) => arm.task === "text").length, 9);
    assert.equal(arms.filter((arm) => arm.task === "pixel").length, 2);
    assert.equal(arms.filter((arm) => arm.task === "lexical").length, 3);
    const hash = hashConfig({ b: 1, a: [2, 3] });
    assert.equal(hash, hashConfig({ a: [2, 3], b: 1, configHash: "ignored" }));
    assert.equal(hash.length, 64);
  });
});

describe("section 6 metrics", () => {
  const relevance = [1, 0, 1, 1, 0];

  it("matches the hand-computed top-3 and R-precision figures", () => {
    assert.equal(precisionAtK(relevance, 3), 2 / 3);
    assert.equal(recallAtK(relevance, 3, 4), 0.5);
    assert.equal(rPrecision(relevance, 4), 0.75);
    assert.equal(hitAtK(relevance, 3), 1);
    assert.equal(reciprocalRank(relevance), 1);
    assert.equal(dcgAtK(relevance, 3), 1.5);
    const ideal = 1 + (1 / Math.log2(3)) + 0.5;
    assert.ok(Math.abs(ndcgAtK(relevance, 3, 4) - (1.5 / ideal)) < 1e-12);
    assert.ok(Math.abs(ndcgAtK(relevance, 3, 4) - 0.7039180890343246) < 1e-12);
  });

  it("scores a late hit, an empty list, and a pool with no relevant item", () => {
    const late = [0, 0, 1];
    assert.equal(precisionAtK(late, 2), 0);
    assert.equal(hitAtK(late, 2), 0);
    assert.equal(hitAtK(late, 3), 1);
    assert.equal(reciprocalRank(late), 1 / 3);
    assert.equal(recallAtK(late, 3, 4), 0.25);
    assert.equal(precisionAtK([], 3), 0);
    assert.equal(ndcgAtK([], 3, 4), 0);
    assert.equal(reciprocalRank([]), 0);
    assert.equal(recallAtK(late, 3, 0), null);
    assert.equal(ndcgAtK(late, 3, 0), null);
    assert.equal(rPrecision(late, 0), null);
  });

  it("computes coverage, diversity, violations, and the macro mean", () => {
    assert.equal(coverageAtK([["a", "b", "c"], ["c", "d"]], 10, 2), 0.4);
    assert.equal(intraListDiversity([[1, 0], [0, 1]]), 1);
    assert.equal(intraListDiversity([[1, 0], [1, 0]]), 0);
    assert.equal(intraListDiversity([[1, 0]]), null);
    assert.equal(intraListDiversity([new Float32Array([1, 0]), new Float32Array([0, 1])]), 1);
    assert.equal(distinctCount(["Coat", "Coat", "Shirt"]), 2);
    assert.equal(violationRate([false, true, false]), 1 / 3);
    assert.equal(violationRate([]), null);
    const rows = [
      { className: "A", value: 1 },
      { className: "A", value: 0 },
      { className: "B", value: 1 },
    ];
    assert.equal(macroAverage(rows, (row) => row.value, (row) => row.className), 0.75);
  });

  it("interpolates percentiles", () => {
    assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
    const hundred = Array.from({ length: 100 }, (_, index) => index + 1);
    assert.ok(Math.abs(percentile(hundred, 0.95) - 95.05) < 1e-12);
    assert.equal(percentile([], 0.5), null);
  });
});

describe("paired bootstrap", () => {
  it("repeats the only drawn query when the generator stays at zero", () => {
    const result = bootstrapStatistic(
      [{ className: "A", value: 0.2 }, { className: "B", value: 0.8 }],
      (rows) => rows.reduce((sum, row) => sum + row.value, 0) / rows.length,
      { samples: 20, random: () => 0 },
    );
    assert.equal(result.point, 0.5);
    assert.equal(result.low, 0.2);
    assert.equal(result.high, 0.2);
    assert.equal(result.samples, 20);
  });

  it("keeps a paired difference on the same draw and repeats a seed", () => {
    const left = [{ value: 1 }, { value: 0 }];
    const right = [{ value: 0 }, { value: 0 }];
    const mean = (rows) => rows.reduce((sum, row) => sum + row.value, 0) / rows.length;
    const paired = pairedBootstrap(left, right, mean, { samples: 10, random: () => 0 });
    assert.equal(paired.point, 0.5);
    assert.equal(paired.low, 1);
    assert.equal(paired.high, 1);
    const once = bootstrapStatistic([1, 2, 3, 4], (rows) => rows[0], { samples: 30, seed: 20261012 });
    const twice = bootstrapStatistic([1, 2, 3, 4], (rows) => rows[0], { samples: 30, seed: 20261012 });
    assert.deepEqual(once, twice);
    assert.equal(once.seed, 20261012);
  });
});

describe("validation selection", () => {
  it("maximises macro NDCG and breaks an exact tie by the pre-registered order", () => {
    const arms = [
      { selectable: true, preprocess: "padded", promptTemplate: "literal-photo", fusion: "zscore", alpha: 0.5, macroNdcg: 0.4 },
      { selectable: true, preprocess: "as-is", promptTemplate: "literal-product", fusion: "rrf", alpha: 0.75, macroNdcg: 0.5 },
      { selectable: true, preprocess: "inverted", promptTemplate: "literal-photo", fusion: "zscore", alpha: 0.5, macroNdcg: 0.5 },
      { selectable: false, preprocess: "as-is", promptTemplate: "literal-photo", fusion: "zscore", alpha: 0.5, macroNdcg: 0.99 },
    ];
    const chosen = selectHybridArm(arms, spec);
    assert.equal(chosen.preprocess, "as-is");
    assert.equal(chosen.fusion, "rrf");
    const higher = selectHybridArm([
      { selectable: true, preprocess: "padded", promptTemplate: "literal-product", fusion: "rrf", alpha: 0.75, macroNdcg: 0.9 },
      { selectable: true, preprocess: "as-is", promptTemplate: "literal-photo", fusion: "zscore", alpha: 0.5, macroNdcg: 0.5 },
    ], spec);
    assert.equal(higher.preprocess, "padded");
  });

  it("keeps the largest lambda inside the diversity budget and otherwise stays at 1", () => {
    const within = selectLambda([
      { lambda: 1, macroNdcg: 0.8, diversity: 0.2 },
      { lambda: 0.9, macroNdcg: 0.795, diversity: 0.25 },
      { lambda: 0.7, macroNdcg: 0.7, diversity: 0.4 },
      { lambda: 0.5, macroNdcg: 0.6, diversity: 0.5 },
    ], spec);
    assert.equal(within.lambda, 0.9);
    const none = selectLambda([
      { lambda: 1, macroNdcg: 0.8, diversity: 0.2 },
      { lambda: 0.9, macroNdcg: 0.77, diversity: 0.3 },
    ], spec);
    assert.equal(none.lambda, 1);
    const lower = selectLambda([
      { lambda: 1, macroNdcg: 0.8, diversity: 0.2 },
      { lambda: 0.9, macroNdcg: 0.8, diversity: 0.2 },
      { lambda: 0.7, macroNdcg: 0.795, diversity: 0.26 },
    ], spec);
    assert.equal(lower.lambda, 0.7);
  });
});

describe("signal ranking", () => {
  it("matches RRF and z-score fusion, including id ties", () => {
    const rrfItems = [
      { id: "b", signals: { img: 0.2, txt: 0.4 } },
      { id: "a", signals: { img: 0.2, txt: 0.9 } },
      { id: "c", signals: { img: 0.8, txt: 0.1 } },
    ];
    const fromFuse = fuseRrf(rrfItems, { img: 1, txt: 1 });
    const scores = fuseSignalScores(["b", "a", "c"], {
      img: Float64Array.from([0.2, 0.2, 0.8]),
      txt: Float64Array.from([0.4, 0.9, 0.1]),
    }, { img: 1, txt: 1 }, "rrf");
    fromFuse.rows.forEach((row, index) => {
      assert.equal(scores[index], row.score);
    });

    const manyIds = Array.from({ length: 30 }, (_, index) => `id-${String(index).padStart(2, "0")}`);
    const img = Float64Array.from(manyIds.map((_, index) => index));
    const txt = Float64Array.from(manyIds.map((_, index) => 29 - index));
    const zItems = manyIds.map((id, index) => ({ id, signals: { img: img[index], txt: txt[index] } }));
    const fused = fuseWeighted(zItems, { img: 2, txt: 1 });
    const zScores = fuseSignalScores(manyIds, { img, txt }, { img: 2, txt: 1 }, "zscore");
    fused.rows.forEach((row, index) => {
      assert.ok(Math.abs(row.score - zScores[index]) < 1e-12);
    });
    const ranked = rankFromSignals(manyIds, { img, txt }, { weights: { img: 2, txt: 1 }, method: "zscore", lambda: 1 });
    const expected = plainRank(fused.rows.map((row) => ({ id: row.id, score: row.score }))).map((row) => row.id);
    assert.deepEqual(ranked, expected);
  });

  it("leaves fused-score order unchanged at lambda 1 and can swap a redundant neighbour", () => {
    const ids = ["near", "far", "twin"];
    const columns = { img: Float64Array.from([0.2, 0.9, 0.2]) };
    const plain = rankFromSignals(ids, columns, { weights: { img: 1 }, method: "rrf", lambda: 1 });
    assert.deepEqual(plain, ["far", "near", "twin"]);
    const vectors = new Map([
      ["far", [1, 0]],
      ["near", [1, 0]],
      ["twin", [0, 1]],
    ]);
    const diverse = rankFromSignals(ids, columns, {
      weights: { img: 1 },
      method: "rrf",
      lambda: 0,
      vectors,
      mmrPool: 3,
    });
    assert.equal(diverse[0], "far");
    assert.equal(diverse[1], "twin");
  });
});

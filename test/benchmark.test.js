import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CANDIDATE_BENCHMARK_PREFS,
  runCandidateBenchmark,
  syntheticCatalogue,
} from "../js/benchmark.js";
import { products } from "../js/catalogue.js";
import { firstFailingGate } from "../js/filter.js";

function eligibleCount(rows) {
  return rows.filter((row) => firstFailingGate(row, CANDIDATE_BENCHMARK_PREFS) == null).length;
}

describe("candidate-generation benchmark", () => {
  it("measures the exhaustive scan at 60, 1000, and 10000 products", () => {
    const once = runCandidateBenchmark(products);
    const twice = runCandidateBenchmark(products);

    assert.deepEqual(once.map((row) => row.name), ["published-60", "synthetic-1000", "synthetic-10000"]);
    assert.deepEqual(once.map((row) => row.catalogueSize), [60, 1000, 10000]);
    assert.deepEqual(
      once.map((row) => row.candidateCount),
      twice.map((row) => row.candidateCount),
    );

    const synthetic1000 = syntheticCatalogue(1000);
    const synthetic10000 = syntheticCatalogue(10000);
    const expected = [
      eligibleCount(products),
      eligibleCount(synthetic1000),
      eligibleCount(synthetic10000),
    ];

    for (const [index, row] of once.entries()) {
      assert.equal(row.generator, "exhaustive");
      assert.equal(row.candidateCount, expected[index]);
      assert.equal(row.violationCount, 0);
      assert.equal(row.violationRate, 0);
      assert.equal(row.report.considered, row.catalogueSize);
      assert.equal(row.report.eligible, row.candidateCount);
      assert.equal(typeof row.runtimeMs, "number");
      assert.ok(row.runtimeMs >= 0);
      assert.ok(row.runtimeMs < 10000);
    }

    assert.ok(once[2].candidateCount > once[1].candidateCount);
    assert.ok(once[1].report.malformed > 0);
    assert.ok(once[1].report.unavailable > 0);
  });
});

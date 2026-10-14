import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { ndcgAtK, precisionAtK, topOverlap } from "../ml/src/eval/shopper/metrics.mjs";
import { validateJudgments } from "../ml/src/eval/shopper/ingest.mjs";
import { loadPersonas, personaFileHash } from "../ml/src/eval/shopper/personas.mjs";
import { tuneGuard } from "../ml/src/eval/shopper/tune.mjs";

describe("shopper evaluation setup", () => {
  it("freezes 24 personas as 8 validation and 16 test, with 3 tight cases", () => {
    const file = loadPersonas();
    assert.equal(file.personas.length, 24);
    assert.equal(file.personas.filter((persona) => persona.split === "val").length, 8);
    assert.equal(file.personas.filter((persona) => persona.split === "test").length, 16);
    assert.equal(file.personas.filter((persona) => persona.tight).length, 3);
    assert.equal(personaFileHash().length, 64);
  });

  it("scores graded NDCG against a known order", () => {
    assert.equal(ndcgAtK([2, 1, 0], 3), 1);
    assert.ok(ndcgAtK([0, 0, 2], 3) < 1);
    assert.equal(precisionAtK([2, 0, 1, 0, 0], 5), 2 / 5);
    assert.equal(ndcgAtK([0, 0], 5), null);
    assert.equal(topOverlap(["a"], ["a"], 5), 1);
  });

  it("rejects an empty judgment and accepts 0, 1, and 2", () => {
    const empty = validateJudgments("persona_id,item_id,persona_text,item_title,item_description,item_attrs,judgment\na,b,want,title,desc,attrs,\n");
    assert.equal(empty.ok, false);
    const filled = validateJudgments("persona_id,item_id,persona_text,item_title,item_description,item_attrs,judgment\na,b,want,title,desc,attrs,2\n");
    assert.equal(filled.ok, true);
    assert.deepEqual(filled.grades, [2]);
  });

  it("refuses to tune the test split or empty validation judgments", () => {
    const testSplit = tuneGuard({ split: "test", file: "ml/data/judging/pool.test.csv" });
    assert.equal(testSplit.ok, false);
    const missing = tuneGuard({ split: "val", file: "ml/data/judging/does-not-exist.csv" });
    assert.equal(missing.ok, false);
  });

  it("leaves the generated pool judgments empty", () => {
    const val = readFileSync(new URL("../ml/data/judging/pool.val.csv", import.meta.url), "utf8");
    const test = readFileSync(new URL("../ml/data/judging/pool.test.csv", import.meta.url), "utf8");
    for (const text of [val, test]) {
      const lines = text.trim().split("\n").slice(1);
      assert.ok(lines.length > 0);
      for (const line of lines) assert.ok(line.endsWith(","));
    }
  });
});

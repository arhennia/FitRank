import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lexicalClassScore } from "../js/retrieval/sources.js";
import { CLASS_NAMES } from "../ml/src/data/split.mjs";
import prompts from "../ml/config/prompts.v1.json" with { type: "json" };
import textQueries from "../ml/data/text-queries.v1.json" with { type: "json" };

describe("sprint text queries", () => {
  it("splits five paraphrases per class before any retrieval score", () => {
    assert.equal(textQueries.writtenBeforeRetrieval, true);
    assert.equal(textQueries.classes.length, 10);
    assert.deepEqual(textQueries.classes.map((entry) => entry.className), [...CLASS_NAMES]);
    const seen = new Set();
    for (const entry of textQueries.classes) {
      assert.equal(entry.paraphrases.length, 5);
      assert.deepEqual(entry.paraphrases.map((row) => row.split), ["val", "val", "val", "test", "test"]);
      const avoiding = entry.paraphrases.filter((row) => row.avoidsClassName);
      assert.ok(avoiding.some((row) => row.split === "val"));
      for (const paraphrase of entry.paraphrases) {
        assert.equal(seen.has(paraphrase.text), false);
        seen.add(paraphrase.text);
        for (const template of prompts.templates) {
          const text = template.template.replaceAll("{}", paraphrase.text);
          const score = lexicalClassScore(text, entry.className);
          if (paraphrase.avoidsClassName) assert.equal(score, 0, text);
          else assert.ok(score > 0, `${entry.className}: ${text}`);
        }
      }
    }
  });
});
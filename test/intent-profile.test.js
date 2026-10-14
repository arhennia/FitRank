import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { products } from "../js/catalogue.js";
import { answersFromIntent, rankFromIntent } from "../js/intent/adapter.js";
import { buildIntent } from "../js/intent/buildIntent.js";
import { questionnaireOptions } from "../js/intent/options.js";
import { renderQueryText } from "../js/intent/queryText.js";
import { recommendFromIntent } from "../js/shopping/recommendIntent.js";
import { intentFixtures } from "./fixtures/intent-sets.js";

function signature(result) {
  return {
    ok: result.ok,
    ids: (result.products || []).map((item) => item.product.id),
    scores: (result.products || []).map((item) => item.score),
  };
}

describe("IntentProfile", () => {
  it("maps every questionnaire option or lists it as unused", () => {
    const rows = questionnaireOptions();
    assert.ok(rows.length > 40);
    const unused = rows.filter((row) => row.unused);
    assert.deepEqual(unused.map((row) => `${row.question}:${row.id}`), ["priorities:fit"]);
    for (const row of rows.filter((item) => !item.unused)) {
      assert.equal(row.unused, false, row.id);
    }
  });

  it("keeps missing answers null and records them", () => {
    const intent = buildIntent({});
    assert.equal(intent.hard.budget, null);
    assert.equal(intent.hard.category, null);
    assert.equal(intent.soft.aesthetics, null);
    assert.equal(intent.query.text, null);
    assert.equal(intent.query.imageSeed, null);
    assert.ok(intent.provenance.missing.includes("answers"));
    assert.ok(intent.provenance.missing.includes("budget"));
  });

  it("does not treat an open aesthetic as a scored tag", () => {
    const intent = buildIntent(intentFixtures.find((item) => item.id === "explore-open"));
    assert.equal(intent.soft.exploringAesthetic, true);
    assert.deepEqual(intent.soft.aesthetics, []);
    assert.equal(intent.query.text, "cafe outing travel");
    assert.ok(intent.provenance.aesthetics.includes("open"));
  });

  it("builds the same query text for the same answers", () => {
    const fixture = intentFixtures.find((item) => item.id === "statement");
    const first = buildIntent(fixture);
    const second = buildIntent(structuredClone(fixture));
    assert.equal(first.query.text, "dark gothic artistic party dress");
    assert.equal(first.query.text, second.query.text);
    assert.equal(renderQueryText(first.soft, first.hard), first.query.text);
  });

  it("drops the fit priority from scored weights", () => {
    const intent = buildIntent({
      answers: {
        trigger: "replace",
        outcome: "repeat-wear",
        role: "basic",
        discovery: "focused",
        contexts: ["work"],
        aesthetics: ["minimal"],
        priorities: ["fit"],
      },
      constraints: { maxBudget: 8000, budgetType: "item", categories: ["shirts"], requireInStock: true },
    });
    assert.equal(intent.soft.priorities.fit, undefined);
    assert.ok(intent.provenance.priorities.includes("fit"));
  });

  it("matches the current scorer on the stored fixture of 10 answer sets", () => {
    const expected = JSON.parse(readFileSync(new URL("./fixtures/intent-legacy.json", import.meta.url), "utf8"));
    assert.equal(expected.length, 10);
    for (const fixture of intentFixtures) {
      const direct = recommendFromIntent(products, fixture);
      const via = rankFromIntent(products, buildIntent(fixture));
      const saved = expected.find((item) => item.id === fixture.id);
      assert.deepEqual(signature(via), signature(direct));
      assert.deepEqual(signature(via), { ok: saved.ok, ids: saved.ids, scores: saved.scores });
      const restored = answersFromIntent(buildIntent(fixture));
      assert.equal(restored.trigger, fixture.answers.trigger);
    }
  });
});

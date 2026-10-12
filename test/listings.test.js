import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import listings from "../data/listings/listings.json" with { type: "json" };
import pairsFile from "../data/listings/pairs.json" with { type: "json" };

const DECLARED = ["category", "colour", "material", "silhouette", "price", "currency"];

function byId(id) {
  const listing = listings.listings.find((row) => row.listingId === id);
  assert.ok(listing, `missing listing ${id}`);
  return listing;
}

function agrees(left, right) {
  return DECLARED.every((field) => left[field] === right[field]);
}

describe("multi-listing preparation set", () => {
  it("keeps unique listings and declares the fields a conflict can use", () => {
    assert.equal(listings.version, 1);
    assert.deepEqual(listings.declaredFields, DECLARED);
    const ids = listings.listings.map((row) => row.listingId);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(listings.listings.length >= 12);
    const schema = JSON.parse(readFileSync(new URL("../data/listings/schema.json", import.meta.url), "utf8"));
    assert.equal(schema.title, "FitRank multi-listing catalogue");
    assert.ok(schema.required.includes("listings"));
  });

  it("matches each hand label to the listing relationship", () => {
    assert.equal(pairsFile.source, "hand");
    const counts = { similar_style: 0, probable_duplicate: 0, attribute_conflict: 0, unrelated: 0 };
    const seen = new Set();

    for (const pair of pairsFile.pairs) {
      assert.equal(seen.has(pair.id), false);
      seen.add(pair.id);
      assert.notEqual(pair.listingA, pair.listingB);
      assert.equal(typeof pair.reason, "string");
      assert.ok(pair.reason.length > 20);
      const left = byId(pair.listingA);
      const right = byId(pair.listingB);
      counts[pair.label] += 1;

      if (pair.label === "similar_style") {
        assert.notEqual(left.itemId, right.itemId);
      } else if (pair.label === "probable_duplicate") {
        assert.equal(left.itemId, right.itemId);
        assert.equal(agrees(left, right), true);
      } else if (pair.label === "attribute_conflict") {
        assert.equal(left.itemId, right.itemId);
        assert.equal(agrees(left, right), false);
      } else if (pair.label === "unrelated") {
        assert.notEqual(left.itemId, right.itemId);
        assert.notEqual(left.category, right.category);
      } else {
        assert.fail(`unknown label ${pair.label}`);
      }
    }

    assert.ok(counts.similar_style >= 3);
    assert.ok(counts.probable_duplicate >= 3);
    assert.ok(counts.attribute_conflict >= 3);
    assert.ok(counts.unrelated >= 2);
  });
});

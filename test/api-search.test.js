import assert from "node:assert/strict";
import { once } from "node:events";
import { describe, it } from "node:test";

import { intentFixtures } from "./fixtures/intent-sets.js";
import { handleSearch } from "../js/api/searchRoute.js";
import { handleInference } from "../ml/src/server/inference.js";
import { createApp } from "../server.js";

describe("search API", () => {
  it("rejects a missing dataset without a stack trace", async () => {
    const result = await handleSearch("POST", "/api/search", { k: 5 });
    assert.equal(result.status, 400);
    assert.equal(result.body.ok, false);
    assert.match(result.body.errors[0], /dataset/);
    assert.equal(JSON.stringify(result.body).includes("stack"), false);
  });

  it("ranks a catalogue intent without calling the sidecar", async () => {
    let called = false;
    const result = await handleSearch("POST", "/api/search", {
      dataset: "catalogue",
      k: 5,
      intentProfile: intentFixtures[0],
    }, { probe: () => { called = true; return false; } });
    assert.equal(called, false);
    assert.equal(result.status, 200);
    assert.equal(result.body.dataset, "catalogue");
    assert.equal(result.body.experiment, false);
    assert.equal(result.body.backend, "fallback");
    assert.equal(result.body.results.length, 3);
  });

  it("answers a Fashion-MNIST text query when the sidecar is down", async () => {
    const result = await handleSearch("POST", "/api/search", {
      dataset: "fmnist",
      mode: "text",
      text: "a dress for a party",
      k: 5,
      constraints: { maxPrice: 1000, categories: ["Dress"] },
    }, { probe: () => false });
    assert.equal(result.status, 200);
    assert.equal(result.body.dataset, "fmnist");
    assert.equal(result.body.experiment, true);
    assert.equal(result.body.backend, "fallback");
    assert.ok(result.body.fallbackReason);
    assert.deepEqual(result.body.notApplicable, ["maxPrice"]);
    assert.equal(result.body.results.length, 5);
    assert.ok(result.body.results.every((row) => row.category === "Dress"));
  });

  it("does not call the sidecar for a sample image", async () => {
    let called = false;
    const samples = await handleSearch("GET", "/api/sample-queries", null);
    const result = await handleSearch("POST", "/api/search", {
      dataset: "fmnist",
      mode: "image",
      image: { kind: "sample", id: samples.body.images[0].id },
      k: 3,
    }, { probe: () => { called = true; return true; } });
    assert.equal(called, false);
    assert.equal(result.status, 200);
    assert.equal(result.body.experiment, true);
    assert.equal(result.body.backend, "fallback");
    assert.equal(result.body.results.length, 3);
  });

  it("serves the shopper page and /api/search while the sidecar is stopped", async () => {
    const server = createApp();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address();
    try {
      const page = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /Shopping questions/);
      const search = await fetch(`http://127.0.0.1:${port}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      });
      assert.equal(search.status, 400);
      const body = await search.json();
      assert.equal(body.ok, false);
      assert.equal(Object.hasOwn(body, "stack"), false);
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("validates sidecar input before loading the model", async () => {
    const health = await handleInference("GET", "/health", null);
    assert.equal(health.status, 200);
    assert.equal(health.body.modelLoaded, false);
    const missing = await handleInference("POST", "/embed/text", {});
    assert.equal(missing.status, 400);
    const image = await handleInference("POST", "/embed/image", { dataB64: Buffer.from([1, 2, 3]).toString("base64") });
    assert.equal(image.status, 400);
    assert.match(image.body.errors[0], /784/);
  });
});

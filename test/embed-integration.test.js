import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";

import { cosine } from "../js/vector.js";
import { readIdxImages } from "../ml/src/data/idx.mjs";
import { ensureEmbeddings } from "../ml/src/embed/embedTargets.mjs";
import { idsHash, sha256Json } from "../ml/src/embed/manifest.mjs";
import { applyVariant } from "../ml/src/embed/preprocess.mjs";

const root = new URL("..", import.meta.url);

function idxPath(name) {
  const local = new URL(`../ml/data/idx/${name}`, import.meta.url);
  if (existsSync(local)) return local;
  return new URL(`../experiments/fashion-mnist/data/${name}`, import.meta.url);
}

describe("CLIP cache integration", () => {
  it("re-embeds 20 images within 0.9999 cosine of the cache", async (t) => {
    let runtime;
    try {
      runtime = await import("../ml/src/embed/clipRuntime.mjs");
    } catch (error) {
      console.log("SKIPPED: model unavailable");
      t.skip(`SKIPPED: model unavailable (${error.message})`);
      return;
    }
    if (!runtime.modelFilesPresent()) {
      console.log("SKIPPED: model unavailable");
      t.skip("SKIPPED: model unavailable");
      return;
    }
    const imageFile = idxPath("train-images-idx3-ubyte.gz");
    if (!existsSync(imageFile)) {
      console.log("SKIPPED: model unavailable");
      t.skip("SKIPPED: model unavailable");
      return;
    }
    const split = JSON.parse(readFileSync(new URL("../ml/data/splits/fmnist.v1.json", import.meta.url), "utf8"));
    const preprocess = JSON.parse(readFileSync(new URL("../ml/config/preprocess.v1.json", import.meta.url), "utf8"));
    const items = split.items.filter((item) => item.split === "index" && item.sourceSplit === "train").slice(0, 20);
    const images = readIdxImages(gunzipSync(readFileSync(imageFile)));
    const variant = preprocess.variants[preprocess.active];
    const rgb = items.map((item) => {
      const start = item.sourceIndex * 784;
      return applyVariant(images.pixels.subarray(start, start + 784), 28, 28, variant);
    });
    const first = await runtime.embedRgbImages(rgb);
    const second = await runtime.embedRgbImages(rgb);
    for (let index = 0; index < first.length; index += 1) {
      const score = cosine(first[index], second[index]);
      assert.ok(score >= 0.9999, `image ${index} cosine ${score}`);
    }
    const ids = items.map((item) => item.id);
    const expected = {
      schemaVersion: 1,
      modelId: runtime.MODEL_ID,
      modelFiles: [{ path: "integration", bytes: 1, sha256: "integration" }],
      transformersVersion: runtime.transformersVersion(),
      dtype: runtime.DTYPE,
      preprocessConfigHash: sha256Json(preprocess),
      datasetHash: "integration",
      splitHash: "integration-20",
      idsHash: idsHash(ids),
      ids,
      dim: runtime.EMBEDDING_DIM,
      count: ids.length,
      normChecked: true,
    };
    const artifactRoot = mkdtempSync(join(tmpdir(), "fitrank-embed-"));
    let calls = 0;
    const embedAll = async () => {
      calls += 1;
      return first;
    };
    const saved = await ensureEmbeddings({ artifactRoot, expected, embedAll });
    const again = await ensureEmbeddings({ artifactRoot, expected, embedAll });
    assert.equal(saved.newlyEmbedded, 20);
    assert.equal(again.newlyEmbedded, 0);
    assert.equal(again.inference, false);
    assert.equal(calls, 1);
    assert.equal(root.protocol, "file:");
  });
});

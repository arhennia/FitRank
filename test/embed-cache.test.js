import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { writeCache, validateCache } from "../ml/src/embed/cache.mjs";
import { auditCatalogue, catalogueText } from "../ml/src/embed/catalogueText.mjs";
import { ensureEmbeddings } from "../ml/src/embed/embedTargets.mjs";
import { idsHash, textCacheId } from "../ml/src/embed/manifest.mjs";
import { applyVariant, preprocessForVariant } from "../ml/src/embed/preprocess.mjs";

function expectedFor(ids, extra = {}) {
  return {
    schemaVersion: 1,
    modelId: "mock",
    modelFiles: [{ path: "mock.onnx", bytes: 4, sha256: "abc" }],
    transformersVersion: "0",
    dtype: "q8",
    preprocessConfigHash: "prep",
    datasetHash: "data",
    splitHash: "split",
    idsHash: idsHash(ids),
    ids,
    dim: 4,
    count: ids.length,
    normChecked: true,
    ...extra,
  };
}

function unitVectors(ids) {
  return ids.map((_, index) => {
    const values = [0, 0, 0, 0];
    values[index % 4] = 1;
    return values;
  });
}

describe("preprocess", () => {
  it("replicates gray, inverts without editing the source, and pads", () => {
    const gray = new Uint8Array(28 * 28);
    gray[0] = 10;
    const inverted = applyVariant(gray, 28, 28, { polarity: "inverted", pad: 0, padValue: 0 });
    assert.equal(inverted.data[0], 245);
    assert.equal(inverted.data[1], 245);
    assert.equal(inverted.data[2], 245);
    assert.equal(gray[0], 10);
    const padded = applyVariant(gray, 28, 28, { polarity: "as-is", pad: 2, padValue: 0 });
    assert.equal(padded.width, 32);
    assert.equal(padded.height, 32);
    assert.equal(padded.data.length, 32 * 32 * 3);
  });

  it("keeps the original object when the variant is already active", () => {
    const config = {
      active: "as-is",
      variants: {
        "as-is": { polarity: "as-is", pad: 0 },
        inverted: { polarity: "inverted", pad: 0 },
      },
    };
    assert.equal(preprocessForVariant(config, "as-is"), config);
    const inverted = preprocessForVariant(config, "inverted");
    assert.equal(inverted.active, "inverted");
    assert.equal(config.active, "as-is");
    assert.equal(inverted.variants, config.variants);
  });
});

describe("catalogue text", () => {
  it("uses the name and description and reports a label-revealing sentence", () => {
    const text = catalogueText({
      id: "p01",
      name: "Structured Work Tote",
      description: "A firm-sided leather tote.",
      price: 12400,
      category: "Handbags",
    });
    assert.equal(text.includes("12400"), false);
    assert.equal(text.includes("Handbags"), false);
    assert.equal(textCacheId(text, "catalogue-name-description.v1"), textCacheId(text, "catalogue-name-description.v1"));
    const audit = auditCatalogue([
      { id: "p01", name: "Structured Work Tote", description: "A firm-sided leather tote." },
      { id: "p02", name: "Other", description: "This is a duplicate of the tote." },
    ]);
    assert.equal(audit.flagged.length, 1);
    assert.equal(audit.flagged[0].id, "p02");
    assert.deepEqual(audit.fieldsUsed, ["name", "description"]);
  });
});

describe("embedding cache", () => {
  it("reuses a valid cache and regenerates when the preprocess hash or ids change", async () => {
    const root = mkdtempSync(join(tmpdir(), "fitrank-cache-"));
    const ids = ["a", "b", "c"];
    let calls = 0;
    const embedAll = async () => {
      calls += 1;
      return unitVectors(ids);
    };
    const expected = expectedFor(ids);
    const first = await ensureEmbeddings({ artifactRoot: root, expected, embedAll });
    const second = await ensureEmbeddings({ artifactRoot: root, expected, embedAll });
    assert.equal(first.inference, true);
    assert.equal(first.newlyEmbedded, 3);
    assert.equal(second.inference, false);
    assert.equal(second.newlyEmbedded, 0);
    assert.equal(calls, 1);

    const changedPrep = expectedFor(ids, { preprocessConfigHash: "other" });
    const third = await ensureEmbeddings({
      artifactRoot: root,
      expected: changedPrep,
      embedAll: async () => {
        calls += 1;
        return unitVectors(ids);
      },
    });
    assert.equal(third.inference, true);
    assert.equal(calls, 2);

    const changedIds = expectedFor(["a", "c"]);
    const fourth = await ensureEmbeddings({
      artifactRoot: root,
      expected: changedIds,
      embedAll: async () => {
        calls += 1;
        return unitVectors(["a", "c"]);
      },
    });
    assert.equal(fourth.inference, true);
    assert.equal(calls, 3);
  });

  it("rejects truncation, a mismatched id list, and a non-unit vector", () => {
    const root = mkdtempSync(join(tmpdir(), "fitrank-cache-"));
    const ids = ["a", "b"];
    const expected = expectedFor(ids);
    const { ids: storedIds, ...manifest } = expected;
    const dir = join(root, "written");
    writeCache(dir, { manifest, ids: storedIds, vectors: unitVectors(ids) });
    assert.equal(validateCache(dir, expected).valid, true);

    const bytes = readFileSync(join(dir, "emb.f32"));
    writeFileSync(join(dir, "emb.f32"), bytes.subarray(0, 4));
    const truncated = validateCache(dir, expected);
    assert.equal(truncated.valid, false);
    assert.equal(truncated.reasons.some((reason) => reason.includes("emb.f32 length")), true);

    writeCache(dir, { manifest, ids: storedIds, vectors: unitVectors(ids) });
    writeFileSync(join(dir, "ids.json"), `${JSON.stringify(["b", "a"])}\n`);
    const reordered = validateCache(dir, expected);
    assert.equal(reordered.valid, false);
    assert.equal(reordered.reasons.some((reason) => reason.includes("id order")), true);

    writeCache(dir, {
      manifest,
      ids: storedIds,
      vectors: [[0.2, 0, 0, 0], [0, 1, 0, 0]],
    });
    const badNorm = validateCache(dir, expected);
    assert.equal(badNorm.valid, false);
    assert.equal(badNorm.reasons.some((reason) => reason.includes("norm")), true);

    const missing = validateCache(join(root, "absent"), expected);
    assert.equal(missing.valid, false);
    assert.equal(missing.reasons[0], "missing cache directory");
  });
});

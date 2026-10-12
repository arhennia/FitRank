import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { describe, it } from "node:test";

import { gunzipOrThrow, readIdxImages, readIdxLabels } from "../ml/src/data/idx.mjs";
import {
  CLASS_NAMES,
  buildFashionSplit,
  splitContentHash,
} from "../ml/src/data/split.mjs";

const STRIDE = 28 * 28;

function paint(buffer, index, marker) {
  const start = index * STRIDE;
  buffer.fill(0, start, start + STRIDE);
  buffer[start] = marker & 255;
  buffer[start + 1] = (marker >>> 8) & 255;
  buffer[start + 2] = (marker >>> 16) & 255;
}

function makeSet(perClass, markerBase) {
  const count = perClass * CLASS_NAMES.length;
  const pixels = Buffer.alloc(count * STRIDE);
  const labels = Buffer.alloc(count);
  for (let classId = 0; classId < CLASS_NAMES.length; classId += 1) {
    for (let offset = 0; offset < perClass; offset += 1) {
      const index = classId * perClass + offset;
      labels[index] = classId;
      paint(pixels, index, markerBase + index + 1);
    }
  }
  return {
    images: { count, rows: 28, cols: 28, pixels },
    labels,
  };
}

function hashes(items, split) {
  return new Set(items.filter((item) => item.split === split).map((item) => item.pixelHash));
}

describe("Fashion-MNIST IDX reader", () => {
  it("rejects a truncated image payload and a corrupt gzip", () => {
    const header = Buffer.alloc(16);
    header.writeInt32BE(2051, 0);
    header.writeInt32BE(2, 4);
    header.writeInt32BE(28, 8);
    header.writeInt32BE(28, 12);
    const truncated = Buffer.concat([header, Buffer.alloc(10)]);
    assert.throws(() => readIdxImages(truncated), /Truncated IDX image file/);
    assert.throws(() => readIdxImages(gunzipOrThrow(gzipSync(truncated))), /Truncated IDX image file/);
    assert.throws(() => gunzipOrThrow(Buffer.from([1, 2, 3, 4])), /Gzip decode failed/);
  });

  it("rejects a truncated label file", () => {
    const header = Buffer.alloc(8);
    header.writeInt32BE(2049, 0);
    header.writeInt32BE(4, 4);
    assert.throws(() => readIdxLabels(Buffer.concat([header, Buffer.from([1])])), /Truncated IDX label file/);
  });
});

describe("Fashion-MNIST seeded split", () => {
  const train = makeSet(8, 0);
  const test = makeSet(6, 100000);

  it("is deterministic, balanced, disjoint, and keeps missing attributes null", () => {
    const first = buildFashionSplit({
      trainImages: train.images,
      trainLabels: train.labels,
      testImages: test.images,
      testLabels: test.labels,
      indexPerClass: 3,
      valPerClass: 2,
      testPerClass: 2,
    });
    const second = buildFashionSplit({
      trainImages: train.images,
      trainLabels: train.labels,
      testImages: test.images,
      testLabels: test.labels,
      indexPerClass: 3,
      valPerClass: 2,
      testPerClass: 2,
    });
    assert.equal(splitContentHash(first), splitContentHash(second));
    assert.deepEqual(first, second);

    const ids = new Set();
    const seenHashes = new Set();
    for (const splitName of ["index", "val", "test"]) {
      const rows = first.items.filter((item) => item.split === splitName);
      assert.equal(rows.length, (splitName === "index" ? 3 : 2) * 10);
      for (const classId of CLASS_NAMES.keys()) {
        assert.equal(rows.filter((item) => item.classId === classId).length, splitName === "index" ? 3 : 2);
      }
    }
    for (const item of first.items) {
      assert.equal(ids.has(item.id), false);
      ids.add(item.id);
      assert.equal(seenHashes.has(item.pixelHash), false);
      seenHashes.add(item.pixelHash);
      assert.equal(item.attrs.price, null);
      assert.equal(item.attrs.brand, null);
      assert.equal(item.attrs.color, null);
      assert.equal(item.attrs.size, null);
      assert.equal(item.attrs.stock, null);
      assert.equal(item.attrs.rating, null);
      assert.equal(JSON.stringify(item.attrs).includes("null"), true);
    }
    const trouser = first.items.find((item) => item.rawLabel === "Trouser");
    const pullover = first.items.find((item) => item.rawLabel === "Pullover");
    assert.equal(trouser.mapped, "Trousers");
    assert.equal(trouser.category, "Trousers");
    assert.equal(pullover.mapped, null);
    assert.equal(pullover.category, "Pullover");
    assert.equal(first.missingness.attributes.price.present, 0);
    assert.equal(first.missingness.attributes.price.missing, first.items.length);
  });

  it("drops a test image whose pixels already appear in the index", () => {
    const random = () => 0;
    const clean = buildFashionSplit({
      trainImages: train.images,
      trainLabels: train.labels,
      testImages: test.images,
      testLabels: test.labels,
      indexPerClass: 2,
      valPerClass: 1,
      testPerClass: 1,
      random,
    });
    assert.equal(clean.removed.count, 0);
    const indexItem = clean.items.find((item) => item.split === "index" && item.classId === 0);
    assert.equal(indexItem.sourceIndex, 1);
    const collidedTest = makeSet(6, 100000);
    const pixelStart = indexItem.sourceIndex * STRIDE;
    collidedTest.images.pixels.set(train.images.pixels.subarray(pixelStart, pixelStart + STRIDE), pixelStart);
    const collided = buildFashionSplit({
      trainImages: train.images,
      trainLabels: train.labels,
      testImages: collidedTest.images,
      testLabels: collidedTest.labels,
      indexPerClass: 2,
      valPerClass: 1,
      testPerClass: 1,
      random,
    });
    assert.ok(collided.removed.count >= 1);
    assert.equal(collided.removed.byReason.testHashInEarlierSplit >= 1, true);
    const indexHashes = hashes(collided.items, "index");
    const valHashes = hashes(collided.items, "val");
    for (const item of collided.items) {
      if (item.split === "index") continue;
      assert.equal(indexHashes.has(item.pixelHash), false);
      if (item.split === "test") assert.equal(valHashes.has(item.pixelHash), false);
    }
  });
});

describe("committed Fashion-MNIST split", () => {
  it("keeps the written v1 split disjoint and null", () => {
    const file = new URL("../ml/data/splits/fmnist.v1.json", import.meta.url);
    assert.equal(existsSync(file), true);
    const split = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(split.seed, 20261012);
    assert.equal(split.sizes.indexPerClass, 200);
    assert.equal(split.sizes.valPerClass, 30);
    assert.equal(split.sizes.testPerClass, 50);
    assert.equal(split.items.length, 2800);
    const ids = new Set();
    const pixelHashes = new Set();
    const sources = new Set();
    const counts = { index: 0, val: 0, test: 0 };
    for (const item of split.items) {
      assert.equal(ids.has(item.id), false);
      ids.add(item.id);
      assert.equal(pixelHashes.has(item.pixelHash), false);
      pixelHashes.add(item.pixelHash);
      const sourceKey = `${item.sourceSplit}:${item.sourceIndex}`;
      assert.equal(sources.has(sourceKey), false);
      sources.add(sourceKey);
      counts[item.split] += 1;
      assert.equal(item.attrs.price, null);
      assert.equal(item.attrs.brand, null);
      assert.equal(item.attrs.color, null);
      assert.equal(item.attrs.size, null);
      assert.equal(item.attrs.stock, null);
      assert.equal(item.attrs.rating, null);
      if (item.mapped === null) assert.equal(item.category, item.rawLabel);
      else assert.equal(item.category, item.mapped);
    }
    assert.deepEqual(counts, { index: 2000, val: 300, test: 500 });
    for (const [splitName, perClass] of [["index", 200], ["val", 30], ["test", 50]]) {
      for (let classId = 0; classId < 10; classId += 1) {
        const rows = split.items.filter((item) => item.split === splitName && item.classId === classId);
        assert.equal(rows.length, perClass);
      }
    }
    assert.equal(split.missingness.attributes.price.present, 0);
    assert.equal(split.provenance.md5["train-images-idx3-ubyte.gz"], "8d4fb7e6c68d591d4c3dfef9ec88bf0d");
  });
});

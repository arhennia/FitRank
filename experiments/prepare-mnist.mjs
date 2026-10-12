/**
 * Build the frozen Fashion-MNIST split. Class ids come from the dataset.
 * This script does not embed images and does not score retrieval.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { deflateSync, gunzipSync } from "node:zlib";
import { join } from "node:path";

import { adaptFashionImage } from "../js/adapter.js";
import { encodePixelCache } from "../js/pixelCache.js";
import {
  CLASS_NAMES,
  INDEX_PER_CLASS,
  TEST_PER_CLASS,
  VALIDATION_PER_CLASS,
  assignClassMembers,
  classSlug,
} from "../js/retrievalProtocol.js";
import { downloadDir, examplesPath, imageDir, manifestPath, pixelPath } from "./paths.mjs";

const SOURCES = {
  images: "http://fashion-mnist.s3-website.eu-central-1.amazonaws.com/t10k-images-idx3-ubyte.gz",
  labels: "http://fashion-mnist.s3-website.eu-central-1.amazonaws.com/t10k-labels-idx1-ubyte.gz",
};

async function loadGzip(url, file) {
  if (!existsSync(file)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed ${response.status} ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(file, bytes);
  }
  return gunzipSync(readFileSync(file));
}

function readIdxImages(buffer) {
  const magic = buffer.readInt32BE(0);
  if (magic !== 2051) throw new Error(`Unexpected image magic ${magic}`);
  const count = buffer.readInt32BE(4);
  const rows = buffer.readInt32BE(8);
  const cols = buffer.readInt32BE(12);
  const pixels = buffer.subarray(16);
  if (pixels.length !== count * rows * cols) throw new Error("Image payload length does not match the header");
  return { count, rows, cols, pixels };
}

function readIdxLabels(buffer) {
  const magic = buffer.readInt32BE(0);
  if (magic !== 2049) throw new Error(`Unexpected label magic ${magic}`);
  const count = buffer.readInt32BE(4);
  return buffer.subarray(8, 8 + count);
}

function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(width, height, pixels) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    pixels.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

await mkdir(downloadDir, { recursive: true });
await mkdir(imageDir, { recursive: true });
await mkdir(join(pixelPath, ".."), { recursive: true });

const images = readIdxImages(await loadGzip(SOURCES.images, join(downloadDir, "t10k-images-idx3-ubyte.gz")));
const labels = readIdxLabels(await loadGzip(SOURCES.labels, join(downloadDir, "t10k-labels-idx1-ubyte.gz")));
if (labels.length !== images.count) throw new Error("Label count does not match image count");
if (images.rows !== 28 || images.cols !== 28) throw new Error("Expected 28 by 28 Fashion-MNIST images");

const byClass = new Map(CLASS_NAMES.map((_, classId) => [classId, []]));
for (let index = 0; index < labels.length; index += 1) {
  const bucket = byClass.get(labels[index]);
  if (bucket && bucket.length < INDEX_PER_CLASS + VALIDATION_PER_CLASS + TEST_PER_CLASS) bucket.push(index);
}

const records = [];
const pixelRows = [];
for (const [classId, sourceIndexes] of byClass) {
  const className = CLASS_NAMES[classId];
  for (const member of assignClassMembers(sourceIndexes)) {
    const offsetLabel = String(member.offset).padStart(3, "0");
    const id = `fm-${member.split}-${classSlug(className)}-${offsetLabel}`;
    const image = `experiments/fashion-mnist/images/${id}.png`;
    const start = member.sourceIndex * images.rows * images.cols;
    const pixels = images.pixels.subarray(start, start + images.rows * images.cols);
    await writeFile(join(imageDir, `${id}.png`), png(images.rows, images.cols, pixels));
    const record = {
      id,
      split: member.split,
      classId,
      className,
      sourceIndex: member.sourceIndex,
      image,
    };
    adaptFashionImage(record);
    records.push(record);
    pixelRows.push(Uint8Array.from(pixels));
  }
}

const counts = { index: 0, validation: 0, test: 0 };
for (const record of records) counts[record.split] += 1;
const manifest = {
  version: 1,
  source: "fashion-mnist-t10k-class-ids",
  license: "MIT",
  attribution: "Fashion-MNIST by Zalando Research, MIT License. https://github.com/zalandoresearch/fashion-mnist",
  disclaimer: "These are 28x28 class-labelled images, not shop listings. Class match does not validate real-world fashion recommendations.",
  order: "Test-set scan order. For each class, the first 120 images are index, then validation, then test.",
  indexPerClass: INDEX_PER_CLASS,
  validationPerClass: VALIDATION_PER_CLASS,
  testPerClass: TEST_PER_CLASS,
  counts,
  images: records,
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(pixelPath, encodePixelCache(pixelRows));
const examples = {
  version: 1,
  note: "One held-out test image per class. These ids are not in the index.",
  queries: records.filter((record) => record.split === "test" && record.id.endsWith("-000")),
};
await writeFile(examplesPath, `${JSON.stringify(examples, null, 2)}\n`);
console.log(JSON.stringify(counts));

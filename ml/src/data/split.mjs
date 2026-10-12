/**
 * Seeded Fashion-MNIST splits for the sprint.
 * Index and validation are drawn from the train split. Test queries are drawn
 * from the test split. The same pixel hash cannot appear in two splits.
 */
import { createHash } from "node:crypto";

import { mulberry32 } from "../../../js/vector.js";

export const CLASS_NAMES = [
  "T-shirt/top",
  "Trouser",
  "Pullover",
  "Dress",
  "Coat",
  "Sandal",
  "Shirt",
  "Sneaker",
  "Bag",
  "Ankle boot",
];

/**
 * FitRank category only when the class is that garment.
 * Pullover, Sandal, Bag, and Ankle boot do not have a single FitRank category,
 * so mapped stays null and category keeps the dataset label.
 */
export const FITRANK_MAP = {
  "T-shirt/top": "Tops",
  Trouser: "Trousers",
  Pullover: null,
  Dress: "Dresses and skirts",
  Coat: "Jackets and coats",
  Sandal: null,
  Shirt: "Tops",
  Sneaker: "Sneakers",
  Bag: null,
  "Ankle boot": null,
};

export const SPLIT_SEED = 20261012;
export const INDEX_PER_CLASS = 200;
export const VAL_PER_CLASS = 30;
export const TEST_PER_CLASS = 50;

const ATTRS = Object.freeze({
  price: null,
  brand: null,
  color: null,
  size: null,
  stock: null,
  rating: null,
});

export function classSlug(className) {
  return String(className).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function pixelHash(pixels) {
  return createHash("sha256").update(pixels).digest("hex");
}

function shuffle(items, random) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const held = copy[index];
    copy[index] = copy[swap];
    copy[swap] = held;
  }
  return copy;
}

function groupByClass(labels, classCount) {
  const groups = Array.from({ length: classCount }, () => []);
  for (let index = 0; index < labels.length; index += 1) {
    const classId = labels[index];
    if (classId < 0 || classId >= classCount) throw new Error(`Label ${classId} is outside 0..${classCount - 1}`);
    groups[classId].push(index);
  }
  return groups;
}

function takeUnique(order, start, images, stride, need, blocked, removed, reason) {
  const chosen = [];
  let cursor = start;
  for (; cursor < order.length && chosen.length < need; cursor += 1) {
    const sourceIndex = order[cursor];
    const offset = sourceIndex * stride;
    const hash = pixelHash(images.pixels.subarray(offset, offset + stride));
    if (blocked.has(hash)) {
      removed.count += 1;
      removed.byReason[reason] = (removed.byReason[reason] ?? 0) + 1;
      continue;
    }
    blocked.add(hash);
    chosen.push({ sourceIndex, pixelHash: hash });
  }
  if (chosen.length < need) {
    throw new Error(`Needed ${need} images after hash checks, and only ${chosen.length} were available`);
  }
  return { chosen, cursor };
}

function itemFrom(member, classId, split, sourceSplit) {
  const rawLabel = CLASS_NAMES[classId];
  const mapped = FITRANK_MAP[rawLabel];
  const offset = String(member.offset).padStart(3, "0");
  return {
    id: `fmnist-v1-${split}-${classSlug(rawLabel)}-${offset}`,
    split,
    classId,
    rawLabel,
    category: mapped ?? rawLabel,
    mapped: mapped ?? null,
    sourceSplit,
    sourceIndex: member.sourceIndex,
    pixelHash: member.pixelHash,
    attrs: { ...ATTRS },
  };
}

/**
 * @param {{
 *   trainImages: { count: number, rows: number, cols: number, pixels: Uint8Array },
 *   trainLabels: Uint8Array,
 *   testImages: { count: number, rows: number, cols: number, pixels: Uint8Array },
 *   testLabels: Uint8Array,
 *   indexPerClass?: number,
 *   valPerClass?: number,
 *   testPerClass?: number,
 *   seed?: number,
 * }} input
 */
export function buildFashionSplit(input) {
  const indexPerClass = input.indexPerClass ?? INDEX_PER_CLASS;
  const valPerClass = input.valPerClass ?? VAL_PER_CLASS;
  const testPerClass = input.testPerClass ?? TEST_PER_CLASS;
  const seed = input.seed ?? SPLIT_SEED;
  const { trainImages, trainLabels, testImages, testLabels } = input;
  const random = input.random ?? mulberry32(seed);
  if (trainLabels.length !== trainImages.count) throw new Error("Train label count does not match train image count");
  if (testLabels.length !== testImages.count) throw new Error("Test label count does not match test image count");
  if (trainImages.rows !== testImages.rows || trainImages.cols !== testImages.cols) {
    throw new Error("Train and test image dimensions differ");
  }
  const stride = trainImages.rows * trainImages.cols;
  const trainGroups = groupByClass(trainLabels, CLASS_NAMES.length);
  const testGroups = groupByClass(testLabels, CLASS_NAMES.length);
  const blocked = new Set();
  const removed = { count: 0, byReason: {} };
  const items = [];

  for (let classId = 0; classId < CLASS_NAMES.length; classId += 1) {
    const order = shuffle(trainGroups[classId], random);
    const indexTake = takeUnique(order, 0, trainImages, stride, indexPerClass, blocked, removed, "indexHashCollision");
    const valTake = takeUnique(order, indexTake.cursor, trainImages, stride, valPerClass, blocked, removed, "validationHashInIndexOrEarlier");
    indexTake.chosen.forEach((row, offset) => items.push(itemFrom({ ...row, offset }, classId, "index", "train")));
    valTake.chosen.forEach((row, offset) => items.push(itemFrom({ ...row, offset }, classId, "val", "train")));
  }

  for (let classId = 0; classId < CLASS_NAMES.length; classId += 1) {
    const order = shuffle(testGroups[classId], random);
    const testTake = takeUnique(order, 0, testImages, stride, testPerClass, blocked, removed, "testHashInEarlierSplit");
    testTake.chosen.forEach((row, offset) => items.push(itemFrom({ ...row, offset }, classId, "test", "t10k")));
  }

  const missingness = missingnessReport(items);
  return {
    schemaVersion: 1,
    dataset: "fashion-mnist",
    seed,
    prng: "mulberry32",
    sizes: { indexPerClass, valPerClass, testPerClass },
    sources: { index: "train", val: "train", test: "t10k" },
    removed,
    missingness,
    items,
  };
}

export function missingnessReport(items) {
  const fields = ["price", "brand", "color", "size", "stock", "rating"];
  const counts = Object.fromEntries(fields.map((field) => [field, { present: 0, missing: 0 }]));
  const mapped = {};
  const unmapped = [];
  for (const name of CLASS_NAMES) {
    if (FITRANK_MAP[name]) mapped[name] = FITRANK_MAP[name];
    else unmapped.push(name);
  }
  for (const item of items) {
    for (const field of fields) {
      if (item.attrs[field] === null || item.attrs[field] === undefined) counts[field].missing += 1;
      else counts[field].present += 1;
    }
  }
  return {
    items: items.length,
    attributes: counts,
    mapped,
    unmapped,
    note: "price, brand, color, size, stock, and rating are absent on Fashion-MNIST and are stored as null.",
  };
}

export function splitContentHash(split) {
  return createHash("sha256").update(JSON.stringify(split)).digest("hex");
}

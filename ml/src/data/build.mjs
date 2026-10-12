/**
 * Download the official Fashion-MNIST train files, check the README checksums,
 * and write ml/data/splits/fmnist.v1.json.
 *
 * Checksums are the MD5 values in the Get the Data table of
 * https://github.com/zalandoresearch/fashion-mnist/blob/master/README.md
 * as fetched on 12 Oct 2026. A mismatch stops the script.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { gunzipOrThrow, readIdxImages, readIdxLabels } from "./idx.mjs";
import { buildFashionSplit, splitContentHash } from "./split.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const idxDir = join(root, "ml", "data", "idx");
const splitPath = join(root, "ml", "data", "splits", "fmnist.v1.json");
const missingPath = join(root, "ml", "data", "splits", "missingness.json");
const licensePath = join(root, "ml", "data", "fashion-mnist-LICENSE.txt");

const REPO_FILE = "https://github.com/zalandoresearch/fashion-mnist/raw/master/data/fashion";
const LICENSE_URL = "https://raw.githubusercontent.com/zalandoresearch/fashion-mnist/master/LICENSE";

export const OFFICIAL_MD5 = {
  "train-images-idx3-ubyte.gz": "8d4fb7e6c68d591d4c3dfef9ec88bf0d",
  "train-labels-idx1-ubyte.gz": "25c81989df183df01b3e8a0aad5dffbe",
  "t10k-images-idx3-ubyte.gz": "bef4ecab320f06d8554ea6380940ec79",
  "t10k-labels-idx1-ubyte.gz": "bb300cfdad3c16e7a12a480ee83cd310",
};

function md5(bytes) {
  return createHash("md5").update(bytes).digest("hex");
}

function existingPath(name) {
  const local = join(idxDir, name);
  if (existsSync(local)) return local;
  const earlier = join(root, "experiments", "fashion-mnist", "data", name);
  if (existsSync(earlier)) return earlier;
  return local;
}

async function download(url, file) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return bytes;
}

async function loadChecked(name) {
  const expected = OFFICIAL_MD5[name];
  let file = existingPath(name);
  let bytes = existsSync(file) ? readFileSync(file) : null;
  let actual = bytes ? md5(bytes) : null;
  let source = bytes ? file : null;
  if (actual !== expected) {
    const url = `${REPO_FILE}/${name}`;
    file = join(idxDir, name);
    bytes = await download(url, file);
    actual = md5(bytes);
    source = url;
    if (actual !== expected) {
      throw new Error(
        `Checksum mismatch for ${name}. Official README MD5 ${expected}. Actual ${actual}. Source ${source}. The split was not written.`,
      );
    }
  }
  return { name, md5: actual, source: `${REPO_FILE}/${name}`, bytes };
}

function loadPair(images, labels) {
  const imageIdx = readIdxImages(gunzipOrThrow(images.bytes));
  const labelIdx = readIdxLabels(gunzipOrThrow(labels.bytes));
  if (imageIdx.rows !== 28 || imageIdx.cols !== 28) throw new Error(`${images.name} is not 28 by 28`);
  return { images: imageIdx, labels: labelIdx };
}

const files = {};
for (const name of Object.keys(OFFICIAL_MD5)) files[name] = await loadChecked(name);

if (!existsSync(licensePath)) {
  const license = await download(LICENSE_URL, licensePath);
  const text = license.toString("utf8");
  if (!text.includes("MIT License") || !text.includes("Zalando SE")) {
    throw new Error("The downloaded LICENSE file does not contain the Zalando MIT notice. The split was not written.");
  }
}

const train = loadPair(files["train-images-idx3-ubyte.gz"], files["train-labels-idx1-ubyte.gz"]);
const test = loadPair(files["t10k-images-idx3-ubyte.gz"], files["t10k-labels-idx1-ubyte.gz"]);
const split = buildFashionSplit({
  trainImages: train.images,
  trainLabels: train.labels,
  testImages: test.images,
  testLabels: test.labels,
});

const document = {
  ...split,
  provenance: {
    license: "MIT",
    licenseFile: "ml/data/fashion-mnist-LICENSE.txt",
    licenseSource: "https://github.com/zalandoresearch/fashion-mnist/blob/master/LICENSE",
    readme: "https://github.com/zalandoresearch/fashion-mnist/blob/master/README.md",
    md5: OFFICIAL_MD5,
    files: Object.fromEntries(Object.values(files).map((file) => [file.name, file.source])),
  },
  contentHash: splitContentHash(split),
};

await mkdir(dirname(splitPath), { recursive: true });
await writeFile(splitPath, `${JSON.stringify(document, null, 2)}\n`);
await writeFile(missingPath, `${JSON.stringify(split.missingness, null, 2)}\n`);

const counts = { index: 0, val: 0, test: 0 };
for (const item of split.items) counts[item.split] += 1;
console.log(JSON.stringify({
  items: split.items.length,
  counts,
  removed: split.removed,
  contentHash: document.contentHash,
  unmapped: split.missingness.unmapped,
}, null, 2));

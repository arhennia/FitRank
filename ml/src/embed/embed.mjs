/**
 * Embed one cache target. A valid cache performs no inference.
 *
 * Usage: npm run ml:embed -- --target index|val|test|text|catalogue
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { products } from "../../../js/catalogue.js";
import { OFFICIAL_MD5 } from "../data/checksums.mjs";
import { gunzipOrThrow, readIdxImages, readIdxLabels } from "../data/idx.mjs";
import { CLASS_NAMES } from "../data/split.mjs";
import { auditCatalogue } from "./catalogueText.mjs";
import { ensureEmbeddings } from "./embedTargets.mjs";
import {
  assertProcessorMatches,
  describeModelFiles,
  EMBEDDING_DIM,
  embedRgbImages,
  embedTextBatch,
  MODEL_ID,
  DTYPE,
  transformersVersion,
} from "./clipRuntime.mjs";
import { idsHash, normalizeText, sha256Bytes, sha256Json, textCacheId } from "./manifest.mjs";
import { activeVariant, applyVariant } from "./preprocess.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const artifactRoot = join(root, "ml", "artifacts");
const BATCH_SIZE = 32;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function locateIdx(name) {
  const local = join(root, "ml", "data", "idx", name);
  if (existsSync(local)) return local;
  const earlier = join(root, "experiments", "fashion-mnist", "data", name);
  if (existsSync(earlier)) return earlier;
  throw new Error(`Missing Fashion-MNIST file ${name}`);
}

function sha256File(file) {
  return sha256Bytes(readFileSync(file));
}

function gitCommit() {
  try {
    return execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function loadImages(name, labelName) {
  const imagePath = locateIdx(name);
  const labelPath = locateIdx(labelName);
  const images = readIdxImages(gunzipOrThrow(readFileSync(imagePath)));
  const labels = readIdxLabels(gunzipOrThrow(readFileSync(labelPath)));
  if (labels.length !== images.count) throw new Error(`${name} label count does not match the images`);
  return images;
}

function pixelsFor(trainImages, testImages, item) {
  const source = item.sourceSplit === "train" ? trainImages : testImages;
  const start = item.sourceIndex * 784;
  return source.pixels.subarray(start, start + 784);
}

async function embedInBatches(items, embedSlice) {
  const vectors = [];
  for (let index = 0; index < items.length; index += BATCH_SIZE) {
    const slice = items.slice(index, index + BATCH_SIZE);
    vectors.push(...await embedSlice(slice));
    console.log(`embedded ${vectors.length} / ${items.length}`);
  }
  return vectors;
}

const target = argument("--target");
const allowed = new Set(["index", "val", "test", "text", "catalogue"]);
if (!allowed.has(target)) {
  throw new Error("Usage: npm run ml:embed -- --target index|val|test|text|catalogue");
}

if (transformersVersion() !== "4.3.1") {
  throw new Error(`Expected @huggingface/transformers 4.3.1, found ${transformersVersion()}`);
}

const preprocess = JSON.parse(readFileSync(join(root, "ml", "config", "preprocess.v1.json"), "utf8"));
const prompts = JSON.parse(readFileSync(join(root, "ml", "config", "prompts.v1.json"), "utf8"));
assertProcessorMatches(preprocess);
const modelFiles = describeModelFiles();
const split = JSON.parse(readFileSync(join(root, "ml", "data", "splits", "fmnist.v1.json"), "utf8"));
const commit = gitCommit();
const preprocessConfigHash = sha256Json(preprocess);

const datasetFiles = Object.keys(OFFICIAL_MD5).map((name) => {
  const file = locateIdx(name);
  const bytes = readFileSync(file);
  const md5 = createHash("md5").update(bytes).digest("hex");
  if (md5 !== OFFICIAL_MD5[name]) throw new Error(`Checksum mismatch for ${name}`);
  return { name, bytes: bytes.length, sha256: sha256Bytes(bytes) };
});
const datasetHash = sha256Json(datasetFiles);

let ids;
let embedAll;
let splitHash;
let usedDatasetHash = datasetHash;

if (target === "index" || target === "val" || target === "test") {
  const items = split.items.filter((item) => item.split === target);
  ids = items.map((item) => item.id);
  splitHash = sha256Json({ contentHash: split.contentHash, target });
  const variant = activeVariant(preprocess);
  embedAll = async () => {
    const trainImages = loadImages("train-images-idx3-ubyte.gz", "train-labels-idx1-ubyte.gz");
    const testImages = loadImages("t10k-images-idx3-ubyte.gz", "t10k-labels-idx1-ubyte.gz");
    return embedInBatches(items, async (slice) => {
      const images = slice.map((item) => applyVariant(pixelsFor(trainImages, testImages, item), 28, 28, variant));
      return embedRgbImages(images);
    });
  };
} else if (target === "text") {
  const rows = [];
  for (const template of prompts.templates) {
    for (const className of CLASS_NAMES) {
      const text = normalizeText(template.template.replaceAll("{}", className));
      rows.push({
        id: textCacheId(text, template.id),
        templateId: template.id,
        text,
      });
    }
  }
  ids = rows.map((row) => row.id);
  splitHash = sha256Json({ prompts: prompts.id, classes: CLASS_NAMES });
  usedDatasetHash = sha256Json(prompts);
  embedAll = () => embedInBatches(rows, (slice) => embedTextBatch(slice.map((row) => row.text)));
  await mkdir(join(root, "ml", "results"), { recursive: true });
  await writeFile(join(root, "ml", "results", "text-prompts.json"), `${JSON.stringify({ note: prompts.note, rows }, null, 2)}\n`);
} else {
  const audit = auditCatalogue(products);
  ids = audit.rows.map((row) => row.cacheId);
  splitHash = sha256Json({ templateId: "catalogue-name-description.v1", ids });
  usedDatasetHash = sha256Json(audit.rows.map((row) => ({ id: row.id, text: row.text })));
  embedAll = () => embedInBatches(audit.rows, (slice) => embedTextBatch(slice.map((row) => row.text)));
  await mkdir(join(root, "ml", "results"), { recursive: true });
  await writeFile(join(root, "ml", "results", "catalogue-text-audit.json"), `${JSON.stringify({
    fieldsUsed: audit.fieldsUsed,
    fieldsExcluded: audit.fieldsExcluded,
    products: audit.products,
    missingDescription: audit.missingDescription,
    flagged: audit.flagged,
    note: audit.note,
  }, null, 2)}\n`);
  if (audit.flagged.length > 0) {
    console.log(`catalogue text flagged ${audit.flagged.length} rows`);
  }
}

const expected = {
  schemaVersion: 1,
  modelId: MODEL_ID,
  modelFiles,
  transformersVersion: transformersVersion(),
  dtype: DTYPE,
  preprocessConfigHash,
  datasetHash: usedDatasetHash,
  splitHash,
  idsHash: idsHash(ids),
  ids,
  dim: EMBEDDING_DIM,
  count: ids.length,
  normChecked: true,
  gitCommit: commit,
};

const result = await ensureEmbeddings({ artifactRoot, expected, embedAll });
console.log(JSON.stringify({
  target,
  batchSize: BATCH_SIZE,
  activePreprocess: preprocess.active,
  ...result,
  weightCache: join(root, "prototypes", "moodboard", ".cache"),
  remoteModels: false,
}, null, 2));

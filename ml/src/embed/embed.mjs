/**
 * Embed one cache target. A valid cache performs no inference.
 *
 * Usage: npm run ml:embed -- --target index|val|test|text|catalogue|paraphrase|images [--variant as-is|inverted|padded|all]
 * `images` embeds the index and the validation split. It does not embed the test split.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
import { applyVariant, preprocessForVariant } from "./preprocess.mjs";

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
const variantArg = argument("--variant");
const allowed = new Set(["index", "val", "test", "text", "catalogue", "paraphrase", "images"]);
if (!allowed.has(target)) {
  throw new Error("Usage: npm run ml:embed -- --target index|val|test|text|catalogue|paraphrase|images [--variant as-is|inverted|padded|all]");
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

const datasetFiles = Object.keys(OFFICIAL_MD5).map((name) => {
  const file = locateIdx(name);
  const bytes = readFileSync(file);
  const md5 = createHash("md5").update(bytes).digest("hex");
  if (md5 !== OFFICIAL_MD5[name]) throw new Error(`Checksum mismatch for ${name}`);
  return { name, bytes: bytes.length, sha256: sha256Bytes(bytes) };
});
const datasetHash = sha256Json(datasetFiles);

function rememberPointer(name, result, count) {
  const path = join(artifactRoot, "pointers.json");
  const current = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  current[name] = { dir: result.dir, key: result.key, count };
  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`);
}

async function embedJob({ name, ids, embedAll, splitHash, usedDatasetHash, preprocessConfigHash, variantName }) {
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
  rememberPointer(name, result, ids.length);
  console.log(JSON.stringify({
    target: name,
    batchSize: BATCH_SIZE,
    variant: variantName,
    ...result,
    weightCache: join(root, "prototypes", "moodboard", ".cache"),
    remoteModels: false,
  }, null, 2));
}

async function embedImages(splitName, variantName) {
  const hashed = preprocessForVariant(preprocess, variantName);
  const variant = hashed.variants[hashed.active];
  const items = split.items.filter((item) => item.split === splitName);
  const ids = items.map((item) => item.id);
  await embedJob({
    name: `${splitName}:${variantName}`,
    ids,
    splitHash: sha256Json({ contentHash: split.contentHash, target: splitName }),
    usedDatasetHash: datasetHash,
    preprocessConfigHash: sha256Json(hashed),
    variantName,
    embedAll: async () => {
      const trainImages = loadImages("train-images-idx3-ubyte.gz", "train-labels-idx1-ubyte.gz");
      const testImages = splitName === "test"
        ? loadImages("t10k-images-idx3-ubyte.gz", "t10k-labels-idx1-ubyte.gz")
        : null;
      return embedInBatches(items, async (slice) => {
        const images = slice.map((item) => applyVariant(pixelsFor(trainImages, testImages, item), 28, 28, variant));
        return embedRgbImages(images);
      });
    },
  });
}

async function embedClassPrompts() {
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
  await mkdir(join(root, "ml", "results"), { recursive: true });
  await writeFile(join(root, "ml", "results", "text-prompts.json"), `${JSON.stringify({ note: prompts.note, rows }, null, 2)}\n`);
  await embedJob({
    name: "text",
    ids: rows.map((row) => row.id),
    splitHash: sha256Json({ prompts: prompts.id, classes: CLASS_NAMES }),
    usedDatasetHash: sha256Json(prompts),
    preprocessConfigHash: sha256Json(preprocess),
    variantName: null,
    embedAll: () => embedInBatches(rows, (slice) => embedTextBatch(slice.map((row) => row.text))),
  });
}

async function embedParaphrases() {
  const queries = JSON.parse(readFileSync(join(root, "ml", "data", "text-queries.v1.json"), "utf8"));
  const rows = [];
  for (const template of prompts.templates) {
    for (const entry of queries.classes) {
      for (const paraphrase of entry.paraphrases) {
        const text = normalizeText(template.template.replaceAll("{}", paraphrase.text));
        rows.push({
          id: textCacheId(text, template.id),
          templateId: template.id,
          className: entry.className,
          split: paraphrase.split,
          text,
        });
      }
    }
  }
  await mkdir(join(root, "ml", "results"), { recursive: true });
  await writeFile(join(root, "ml", "results", "text-paraphrases.json"), `${JSON.stringify({
    note: "Embedded paraphrase strings. This file is not a retrieval score.",
    textQueries: queries.id,
    rows,
  }, null, 2)}\n`);
  await embedJob({
    name: "paraphrase",
    ids: rows.map((row) => row.id),
    splitHash: sha256Json({ prompts: prompts.id, textQueries: queries.id }),
    usedDatasetHash: sha256Json(queries),
    preprocessConfigHash: sha256Json(preprocess),
    variantName: null,
    embedAll: () => embedInBatches(rows, (slice) => embedTextBatch(slice.map((row) => row.text))),
  });
}

async function embedCatalogue() {
  const audit = auditCatalogue(products);
  await mkdir(join(root, "ml", "results"), { recursive: true });
  await writeFile(join(root, "ml", "results", "catalogue-text-audit.json"), `${JSON.stringify({
    fieldsUsed: audit.fieldsUsed,
    fieldsExcluded: audit.fieldsExcluded,
    products: audit.products,
    missingDescription: audit.missingDescription,
    flagged: audit.flagged,
    note: audit.note,
  }, null, 2)}\n`);
  if (audit.flagged.length > 0) console.log(`catalogue text flagged ${audit.flagged.length} rows`);
  await embedJob({
    name: "catalogue",
    ids: audit.rows.map((row) => row.cacheId),
    splitHash: sha256Json({ templateId: "catalogue-name-description.v1", ids: audit.rows.map((row) => row.cacheId) }),
    usedDatasetHash: sha256Json(audit.rows.map((row) => ({ id: row.id, text: row.text }))),
    preprocessConfigHash: sha256Json(preprocess),
    variantName: null,
    embedAll: () => embedInBatches(audit.rows, (slice) => embedTextBatch(slice.map((row) => row.text))),
  });
}

const imageTargets = target === "images" ? ["index", "val"] : (target === "index" || target === "val" || target === "test" ? [target] : []);
if (imageTargets.length > 0) {
  const names = variantArg === "all"
    ? Object.keys(preprocess.variants)
    : [variantArg || preprocess.active];
  for (const splitName of imageTargets) {
    for (const variantName of names) await embedImages(splitName, variantName);
  }
} else if (variantArg) {
  throw new Error(`--variant does not apply to ${target}`);
} else if (target === "text") {
  await embedClassPrompts();
} else if (target === "paraphrase") {
  await embedParaphrases();
} else {
  await embedCatalogue();
}

/**
 * Local CLIP trial. Reads labels.json and does not rewrite those labels.
 * This file is not imported by the FitRank page.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env, pipeline } from "@huggingface/transformers";
import { ndcgAtK, precisionAtK } from "../../js/metrics.js";

const root = dirname(fileURLToPath(import.meta.url));
const MODEL_ID = "Xenova/clip-vit-base-patch32";
const K = 3;
env.cacheDir = join(root, ".cache");

function asVector(tensor) {
  const dims = tensor.dims;
  const data = tensor.data;
  if (dims.length === 1) return Array.from(data);
  if (dims.length === 2) return Array.from(data.subarray(0, dims[dims.length - 1]));
  if (dims.length === 3) {
    const width = dims[2];
    return Array.from(data.subarray(0, width));
  }
  throw new Error(`Unexpected embedding shape ${dims.join("x")}`);
}

function unit(values) {
  let square = 0;
  for (const value of values) square += value * value;
  const scale = Math.sqrt(square) || 1;
  return values.map((value) => value / scale);
}

function dot(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += left[index] * right[index];
  return sum;
}

function mean(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function loadPipeline(task) {
  const started = performance.now();
  try {
    const loaded = await pipeline(task, MODEL_ID, { dtype: "q8", cache_dir: env.cacheDir, device: "cpu" });
    return { loaded, dtype: "q8", loadMs: performance.now() - started };
  } catch (error) {
    console.warn(`${task} q8 load failed (${error.message}). Retrying the default dtype.`);
    const retry = performance.now();
    const loaded = await pipeline(task, MODEL_ID, { cache_dir: env.cacheDir, device: "cpu" });
    return { loaded, dtype: "default", loadMs: performance.now() - retry };
  }
}

const labels = JSON.parse(await readFile(join(root, "labels.json"), "utf8"));
const vision = await loadPipeline("image-feature-extraction");
const imageText = await loadPipeline("zero-shot-image-classification");
const classNames = labels.queries.map((query) => query.className);

const embedStarted = performance.now();
const embeddings = new Map();
let embeddingShape = null;
for (const item of [...labels.queries, ...labels.products]) {
  const output = await vision.loaded(join(root, item.file));
  embeddingShape ??= output.dims;
  embeddings.set(item.id, unit(asVector(output)));
}
const embedMs = performance.now() - embedStarted;

const retrievalStarted = performance.now();
const queries = labels.queries.map((query) => {
  const ranked = labels.products
    .map((product) => ({
      id: product.id,
      className: product.className,
      score: dot(embeddings.get(query.id), embeddings.get(product.id)),
    }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const ids = ranked.map((item) => item.id);
  const grades = Object.fromEntries(query.relevantIds.map((id) => [id, 1]));
  return {
    id: query.id,
    className: query.className,
    precisionAtK: precisionAtK(ids, query.relevantIds, K),
    ndcgAtK: ndcgAtK(ids, grades, K),
    top: ranked.slice(0, K),
  };
});
const retrievalMs = performance.now() - retrievalStarted;

const classStarted = performance.now();
const classMatches = [];
for (const query of labels.queries) {
  const ranked = await imageText.loaded(join(root, query.file), classNames, {
    hypothesis_template: "a photo of a {}",
  });
  classMatches.push({
    id: query.id,
    expected: query.className,
    predicted: ranked[0]?.label ?? null,
    score: ranked[0]?.score ?? null,
    correct: ranked[0]?.label === query.className,
    top3: ranked.slice(0, 3).map((item) => ({ label: item.label, score: item.score })),
  });
}
const classMs = performance.now() - classStarted;

const report = {
  modelId: MODEL_ID,
  library: "@huggingface/transformers",
  device: "cpu",
  visionDtype: vision.dtype,
  imageTextDtype: imageText.dtype,
  embeddingShape,
  imageCount: embeddings.size,
  k: K,
  loadMs: { vision: vision.loadMs, imageText: imageText.loadMs },
  embedMs,
  meanEmbedMs: embedMs / embeddings.size,
  retrievalMs,
  classMs,
  meanPrecisionAtK: mean(queries.map((query) => query.precisionAtK)),
  meanNdcgAtK: mean(queries.map((query) => query.ndcgAtK)),
  classTop1Accuracy: classMatches.filter((row) => row.correct).length / classMatches.length,
  chancePrecisionAtK: K / labels.products.length,
  queries,
  classMatches,
  note: "Labels come from Fashion-MNIST class ids. This trial is not wired into the FitRank page.",
};

await writeFile(join(root, "results.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  embeddingShape: report.embeddingShape,
  meanPrecisionAtK: report.meanPrecisionAtK,
  meanNdcgAtK: report.meanNdcgAtK,
  classTop1Accuracy: report.classTop1Accuracy,
  meanEmbedMs: report.meanEmbedMs,
  loadMs: report.loadMs,
  visionDtype: report.visionDtype,
  imageTextDtype: report.imageTextDtype,
}, null, 2));

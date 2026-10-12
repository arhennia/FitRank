/**
 * Cache CLIP image and text embeddings. A later run reuses vectors already stored
 * for this model and dimension. Image weights stay local. The text tower is
 * downloaded only when it is missing from the CLIP cache.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import { EMBEDDING_DIM, MODEL_ID, literalQuery } from "../js/retrievalProtocol.js";
import listings from "../data/listings/listings.json" with { type: "json" };
import textQueries from "./text-queries.json" with { type: "json" };
import { embedImageFile, embedTexts, loadText, loadVision } from "../prototypes/moodboard/clipRuntime.mjs";
import {
  cacheDir,
  embedMetaPath,
  imageEmbeddingPath,
  manifestPath,
  repoRoot,
  textEmbeddingPath,
} from "./paths.mjs";
import { join } from "node:path";

await mkdir(cacheDir, { recursive: true });
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const cached = existsSync(imageEmbeddingPath)
  ? JSON.parse(await readFile(imageEmbeddingPath, "utf8"))
  : { modelId: MODEL_ID, dtype: "q8", dimension: EMBEDDING_DIM, ids: [], vectors: [] };
if (cached.modelId !== MODEL_ID || cached.dimension !== EMBEDDING_DIM) {
  throw new Error(`Image cache was built for ${cached.modelId} at dim ${cached.dimension}`);
}
const vectors = new Map();
cached.ids.forEach((id, index) => {
  const vector = cached.vectors[index];
  if (Array.isArray(vector) && vector.length === EMBEDDING_DIM) vectors.set(id, vector);
});

const vision = await loadVision();
let embedded = 0;
let hits = 0;
const embedStarted = performance.now();
for (const record of manifest.images) {
  if (vectors.has(record.id)) {
    hits += 1;
    continue;
  }
  const vector = await embedImageFile(join(repoRoot, record.image));
  vectors.set(record.id, vector);
  embedded += 1;
  if (embedded % 100 === 0) {
    await writeImageCache(vectors);
    console.log(`embedded ${embedded} new images`);
  }
}
await writeImageCache(vectors);
const embedMs = embedded === 0 ? 0 : performance.now() - embedStarted;

const texts = [...new Set([
  ...manifest.images.map((record) => literalQuery(record.className)),
  ...Object.values(textQueries.validationParaphrases),
  ...Object.values(textQueries.testParaphrases),
  ...listings.listings.map((row) => row.name),
])];

let textStatus = "ok";
let textError = null;
let textDownloaded = false;
const textVectors = {};
try {
  const textTower = await loadText();
  textDownloaded = textTower.downloaded;
  const encoded = await embedTexts(texts);
  texts.forEach((text, index) => {
    textVectors[text] = encoded[index];
  });
  await writeFile(textEmbeddingPath, `${JSON.stringify({
    modelId: MODEL_ID,
    dtype: textTower.dtype,
    dimension: EMBEDDING_DIM,
    vectors: textVectors,
  })}\n`);
} catch (error) {
  textStatus = "blocked";
  textError = error.message;
  console.error(textError);
}

const previous = existsSync(embedMetaPath) ? JSON.parse(await readFile(embedMetaPath, "utf8")) : null;
const generation = embedded > 0
  ? {
    embedMs,
    meanEmbedMs: embedMs / embedded,
    newlyEmbeddedImages: embedded,
    textDownloaded,
  }
  : previous?.generation ?? null;
const meta = {
  modelId: MODEL_ID,
  dtype: vision.dtype,
  dimension: EMBEDDING_DIM,
  imageCount: vectors.size,
  cacheHitImages: hits,
  newlyEmbeddedImages: embedded,
  embedMs: embedded === 0 ? (generation?.embedMs ?? 0) : embedMs,
  meanEmbedMs: embedded === 0 ? (generation?.meanEmbedMs ?? null) : embedMs / embedded,
  visionLoadMs: vision.loadMs,
  textStatus,
  textError,
  textDownloaded,
  textCount: Object.keys(textVectors).length,
  generation,
};
await writeFile(embedMetaPath, `${JSON.stringify(meta, null, 2)}\n`);
console.log(JSON.stringify(meta, null, 2));
if (textStatus !== "ok") process.exitCode = 2;

function writeImageCache(map) {
  const ids = [...map.keys()];
  return writeFile(imageEmbeddingPath, JSON.stringify({
    modelId: MODEL_ID,
    dtype: "q8",
    dimension: EMBEDDING_DIM,
    ids,
    vectors: ids.map((id) => map.get(id)),
  }));
}

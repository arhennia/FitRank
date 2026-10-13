/**
 * Load the validation caches and build score columns.
 * The test split is not read.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { lexicalClassScore, pixelVector } from "../../../js/retrieval/sources.js";
import { loadVectorStore } from "../../../js/retrieval/vectorStore.js";
import { normalizeText, textCacheId } from "../embed/manifest.mjs";
import { gunzipOrThrow, readIdxImages } from "../data/idx.mjs";
import { CLASS_NAMES } from "../data/split.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function locateIdx(name) {
  const local = join(repoRoot, "ml", "data", "idx", name);
  if (existsSync(local)) return local;
  const earlier = join(repoRoot, "experiments", "fashion-mnist", "data", name);
  if (existsSync(earlier)) return earlier;
  throw new Error(`Missing Fashion-MNIST file ${name}`);
}

function dotAll(store, vector) {
  const dim = store.dim;
  const count = store.count;
  const floats = store.floats;
  const scores = new Float64Array(count);
  for (let row = 0; row < count; row += 1) {
    let sum = 0;
    const offset = row * dim;
    for (let d = 0; d < dim; d += 1) sum += floats[offset + d] * vector[d];
    scores[row] = sum;
  }
  return scores;
}

function matrixStore(ids, rows) {
  const dim = rows[0].length;
  const floats = new Float32Array(ids.length * dim);
  for (let index = 0; index < rows.length; index += 1) floats.set(rows[index], index * dim);
  const byId = new Map();
  for (let index = 0; index < ids.length; index += 1) byId.set(ids[index], index);
  return {
    ids,
    dim,
    count: ids.length,
    floats,
    vector(id) {
      const index = byId.get(id);
      if (index == null) return null;
      return floats.subarray(index * dim, (index + 1) * dim);
    },
  };
}

function vectorMap(store) {
  const map = new Map();
  for (const id of store.ids) map.set(id, store.vector(id));
  return map;
}

function pointerDir(pointers, name) {
  const row = pointers[name];
  if (!row?.dir) throw new Error(`Missing embedding pointer ${name}. Run npm run ml:embed for that target.`);
  return row.dir;
}

function sameIds(left, right, label) {
  if (left.length !== right.length) throw new Error(`${label} id count changed`);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) throw new Error(`${label} id order changed at ${index}`);
  }
}

export function queriesFor(arm, data) {
  if (arm.task === "image") {
    const image = data.variants[arm.preprocess].image;
    return data.valItems.map((item) => ({
      id: item.id,
      className: item.rawLabel,
      columns: { img: image.get(item.id) },
    }));
  }
  if (arm.task === "text") {
    const text = data.variants[arm.preprocess].text;
    return data.valParaphrases.map((row) => ({
      id: `${arm.promptTemplate}::${row.className}::${row.text}`,
      className: row.className,
      columns: { txt: text.get(`${arm.promptTemplate}\n${row.text}`) },
    }));
  }
  if (arm.task === "hybrid") {
    const variant = data.variants[arm.preprocess];
    const queries = [];
    for (const item of data.valItems) {
      for (const row of data.paraphrasesByClass.get(item.rawLabel)) {
        queries.push({
          id: `${item.id}::${arm.promptTemplate}::${row.text}`,
          className: item.rawLabel,
          columns: {
            img: variant.image.get(item.id),
            txt: variant.text.get(`${arm.promptTemplate}\n${row.text}`),
          },
        });
      }
    }
    return queries;
  }
  if (arm.task === "pixel") {
    const image = data.pixels[arm.pixelVariant].image;
    return data.valItems.map((item) => ({
      id: item.id,
      className: item.rawLabel,
      columns: { pixel: image.get(item.id) },
    }));
  }
  if (arm.task === "lexical") {
    return data.valParaphrases.map((row) => ({
      id: `${arm.promptTemplate}::${row.className}::${row.text}`,
      className: row.className,
      columns: { lexical: data.lexical.get(`${arm.promptTemplate}\n${row.text}`) },
    }));
  }
  throw new Error(`Unknown task ${arm.task}`);
}

export function diversityMapFor(arm, data) {
  if (arm.task === "pixel") return data.pixels[arm.pixelVariant].vectors;
  if (arm.task === "lexical") return data.variants["as-is"].vectors;
  return data.variants[arm.preprocess].vectors;
}

export function loadValidationContext(spec) {
  const started = performance.now();
  const pointers = readJson(join(repoRoot, "ml", "artifacts", "pointers.json"));
  const prompts = readJson(join(repoRoot, "ml", "config", "prompts.v1.json"));
  const textQueries = readJson(join(repoRoot, "ml", "data", "text-queries.v1.json"));
  const split = readJson(join(repoRoot, "ml", "data", "splits", "fmnist.v1.json"));
  const indexItems = split.items.filter((item) => item.split === "index");
  const valItems = split.items.filter((item) => item.split === "val");
  const indexIds = new Set(indexItems.map((item) => item.id));
  for (const item of valItems) {
    if (indexIds.has(item.id)) throw new Error(`Validation id ${item.id} is also in the index`);
    if (item.sourceSplit !== "train") throw new Error(`Validation item ${item.id} is not from the train split`);
  }

  const templateById = new Map(prompts.templates.map((template) => [template.id, template.template]));
  for (const templateId of spec.templateOrder) {
    if (!templateById.has(templateId)) throw new Error(`Prompt template ${templateId} is not in prompts.v1.json`);
  }

  const valParaphrases = [];
  const paraphrasesByClass = new Map();
  for (const entry of textQueries.classes) {
    const rows = entry.paraphrases.filter((row) => row.split === "val").map((row) => ({
      className: entry.className,
      text: row.text,
    }));
    paraphrasesByClass.set(entry.className, rows);
    valParaphrases.push(...rows);
  }

  const variants = {};
  let sharedIds = null;
  for (const preprocess of spec.preprocessOrder) {
    const indexStore = loadVectorStore(pointerDir(pointers, `index:${preprocess}`));
    const valStore = loadVectorStore(pointerDir(pointers, `val:${preprocess}`));
    if (sharedIds == null) sharedIds = indexStore.ids;
    else sameIds(sharedIds, indexStore.ids, preprocess);
    const labelOf = new Map(indexItems.map((item) => [item.id, item.rawLabel]));
    const labels = indexStore.ids.map((id) => {
      const label = labelOf.get(id);
      if (!label) throw new Error(`Index id ${id} is not in the split`);
      return label;
    });
    const image = new Map();
    for (const item of valItems) {
      const vector = valStore.vector(item.id);
      if (!vector) throw new Error(`Validation image ${item.id} has no ${preprocess} embedding`);
      image.set(item.id, dotAll(indexStore, vector));
    }
    const paraphraseStore = loadVectorStore(pointerDir(pointers, "paraphrase"));
    const text = new Map();
    for (const templateId of spec.templateOrder) {
      for (const row of valParaphrases) {
        const phrase = normalizeText(templateById.get(templateId).replaceAll("{}", row.text));
        const cacheId = textCacheId(phrase, templateId);
        const vector = paraphraseStore.vector(cacheId);
        if (!vector) throw new Error(`Missing paraphrase embedding ${templateId}: ${row.text}`);
        text.set(`${templateId}\n${row.text}`, dotAll(indexStore, vector));
      }
    }
    variants[preprocess] = { labels, image, text, vectors: vectorMap(indexStore) };
    console.log(`scored ${preprocess} dots in ${Math.round(performance.now() - started)} ms`);
  }

  const labels = variants["as-is"].labels;
  const labelById = new Map();
  for (let index = 0; index < sharedIds.length; index += 1) labelById.set(sharedIds[index], labels[index]);
  const relevantInPool = new Map();
  for (const label of labels) relevantInPool.set(label, (relevantInPool.get(label) || 0) + 1);

  const bytes = readFileSync(locateIdx("train-images-idx3-ubyte.gz"));
  const trainImages = readIdxImages(gunzipOrThrow(bytes));
  const pixelsOf = (item) => {
    const start = item.sourceIndex * 784;
    return trainImages.pixels.subarray(start, start + 784);
  };
  const pixels = {};
  for (const pixelVariant of ["raw", "mean-centered"]) {
    const indexRows = indexItems.map((item) => pixelVector(pixelsOf(item), pixelVariant));
    const indexIdsInSplitOrder = indexItems.map((item) => item.id);
    sameIds(sharedIds, indexIdsInSplitOrder, `pixel ${pixelVariant}`);
    const store = matrixStore(sharedIds, indexRows);
    const image = new Map();
    for (const item of valItems) {
      const vector = pixelVector(pixelsOf(item), pixelVariant);
      image.set(item.id, dotAll(store, vector));
    }
    pixels[pixelVariant] = { image, vectors: vectorMap(store) };
  }

  const lexical = new Map();
  for (const templateId of spec.templateOrder) {
    for (const row of valParaphrases) {
      const phrase = normalizeText(templateById.get(templateId).replaceAll("{}", row.text));
      const column = new Float64Array(labels.length);
      for (let index = 0; index < labels.length; index += 1) {
        column[index] = lexicalClassScore(phrase, labels[index]);
      }
      lexical.set(`${templateId}\n${row.text}`, column);
    }
  }

  const classIndex = new Map(CLASS_NAMES.map((name, index) => [name, index]));
  return {
    indexIds: sharedIds,
    labels,
    labelById,
    labelNames: CLASS_NAMES,
    classIndex,
    relevantInPool,
    valItems,
    valParaphrases,
    paraphrasesByClass,
    variants,
    pixels,
    lexical,
    prepareMs: performance.now() - started,
  };
}

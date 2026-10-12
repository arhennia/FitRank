/**
 * Score the frozen protocol. This file does not search thresholds or edit queries.
 * Validation numbers are stored and are not the official result.
 */
import { readFile, writeFile } from "node:fs/promises";

import { applyHardConstraints } from "../js/constraints.js";
import { decidePair, scoreDecisions } from "../js/duplicates.js";
import { summariseByClass, summariseQueries } from "../js/evaluateRetrieval.js";
import { diversify, hybridScore } from "../js/hybridRank.js";
import { lexicalOverlap } from "../js/lexical.js";
import { decodePixelCache, normalizePixels } from "../js/pixelCache.js";
import {
  CLASS_NAMES,
  DIVERSITY_LAMBDA,
  DIVERSITY_POOL,
  MODEL_ID,
  NAME_COSINE_THRESHOLD,
  RANDOM_SEED,
  RETRIEVAL_K,
  SCORE_DEFINITION,
  literalQuery,
} from "../js/retrievalProtocol.js";
import { cosine, meanPairwiseDiversity, randomScores, rankByScore } from "../js/vector.js";
import { adaptFashionImage } from "../js/adapter.js";
import listings from "../data/listings/listings.json" with { type: "json" };
import pairsFile from "../data/listings/pairs.json" with { type: "json" };
import textQueries from "./text-queries.json" with { type: "json" };
import {
  embedMetaPath,
  imageEmbeddingPath,
  manifestPath,
  pixelPath,
  resultsPath,
  textEmbeddingPath,
} from "./paths.mjs";

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const imageFile = JSON.parse(await readFile(imageEmbeddingPath, "utf8"));
const pixels = decodePixelCache(await readFile(pixelPath));
if (pixels.length !== manifest.images.length) {
  throw new Error(`Pixel rows ${pixels.length} do not match manifest ${manifest.images.length}`);
}
if (imageFile.modelId !== MODEL_ID || imageFile.dimension !== 512) {
  throw new Error("Image embedding cache does not match the frozen model");
}

const imageVectors = new Map();
imageFile.ids.forEach((id, index) => imageVectors.set(id, imageFile.vectors[index]));
const pixelVectors = new Map();
const classById = new Map();
const records = manifest.images.map((record, index) => {
  const product = adaptFashionImage(record);
  classById.set(product.id, product.category);
  pixelVectors.set(product.id, normalizePixels(pixels[index]));
  return product;
});

const seenSource = new Set();
for (const record of records) {
  const key = `${record.classId}:${record.sourceIndex}`;
  if (seenSource.has(key)) throw new Error(`Source index repeated: ${key}`);
  seenSource.add(key);
}
const indexIds = new Set(records.filter((record) => record.split === "index").map((record) => record.id));
for (const record of records) {
  if (record.split !== "index" && indexIds.has(record.id)) throw new Error(`Query id is also in the index: ${record.id}`);
}
const indexProducts = records.filter((record) => record.split === "index");
for (const product of indexProducts) {
  if (!imageVectors.has(product.id) || !pixelVectors.get(product.id)) {
    throw new Error(`Index image ${product.id} is missing a vector`);
  }
}

let textVectors = null;
let textBlocker = null;
try {
  const textFile = JSON.parse(await readFile(textEmbeddingPath, "utf8"));
  if (textFile.modelId !== MODEL_ID) throw new Error("Text cache model does not match");
  textVectors = textFile.vectors;
} catch (error) {
  textBlocker = error.message;
}

let embedMeta = null;
try {
  embedMeta = JSON.parse(await readFile(embedMetaPath, "utf8"));
} catch (error) {
  embedMeta = { error: error.message };
}

function relevantIds(classId) {
  return indexProducts.filter((product) => product.classId === classId).map((product) => product.id);
}

function topOf(ids) {
  return ids.slice(0, 5).map((id) => ({ id, className: classById.get(id) ?? null }));
}

function diversityOf(ids) {
  return meanPairwiseDiversity(ids.slice(0, RETRIEVAL_K).map((id) => pixelVectors.get(id)));
}

function finish(query, ids, relevant, started) {
  return {
    queryId: query.id,
    className: query.className,
    ids,
    relevantIds: relevant,
    topClass: classById.get(ids[0]) ?? null,
    top: topOf(ids),
    diversity: diversityOf(ids),
    latencyMs: performance.now() - started,
  };
}

function rankScores(query, relevant, scoreFor) {
  const started = performance.now();
  const rows = [];
  for (const candidate of indexProducts) {
    const score = scoreFor(candidate);
    if (!Number.isFinite(score)) continue;
    rows.push({ id: candidate.id, score });
  }
  return finish(query, rankByScore(rows).map((row) => row.id), relevant, started);
}

function rankHybrid(query, relevant, request) {
  const started = performance.now();
  const rows = [];
  for (const candidate of indexProducts) {
    const scored = hybridScore(request, imageVectors.get(candidate.id));
    if (!scored.ok) continue;
    rows.push({ id: candidate.id, score: scored.score });
  }
  return finish(query, rankByScore(rows).map((row) => row.id), relevant, started);
}

function methodBlock(cases) {
  const summary = summariseQueries(cases, RETRIEVAL_K);
  summary.perClass = summariseByClass(cases, RETRIEVAL_K);
  for (const entry of Object.values(summary.perClass)) delete entry.failures;
  return summary;
}

function track(queries, builders) {
  const built = {};
  for (const [name, build] of Object.entries(builders)) built[name] = [];
  for (const query of queries) {
    const relevant = relevantIds(query.classId);
    for (const [name, build] of Object.entries(builders)) built[name].push(build(query, relevant));
  }
  const methods = {};
  for (const [name, cases] of Object.entries(built)) methods[name] = methodBlock(cases);
  const sample = queries[0];
  const relevantCount = sample ? relevantIds(sample.classId).length : 0;
  return {
    queries: queries.length,
    poolSize: indexProducts.length,
    relevantPerQuery: relevantCount,
    chancePrecision: indexProducts.length === 0 ? null : relevantCount / indexProducts.length,
    recallCeiling: relevantCount === 0 ? null : Math.min(RETRIEVAL_K, relevantCount) / relevantCount,
    methods,
  };
}

function imageQuery(record) {
  return { ...record, className: record.category };
}

function textQuery(id, className, text) {
  return { id, className, classId: CLASS_ID.get(className), text };
}

const CLASS_ID = new Map(records.map((record) => [record.category, record.classId]));
const testImages = records.filter((record) => record.split === "test");
const validationImages = records.filter((record) => record.split === "validation");

const indexIdList = indexProducts.map((product) => product.id);

function randomRank(query, relevant) {
  const scores = randomScores(indexIdList, query.id);
  return rankScores(query, relevant, (candidate) => scores.get(candidate.id));
}

function imageBuilders() {
  return {
    random: randomRank,
    pixel: (query, relevant) => rankScores(query, relevant, (candidate) => cosine(
      pixelVectors.get(query.id),
      pixelVectors.get(candidate.id),
    )),
    "clip-image": (query, relevant) => rankScores(query, relevant, (candidate) => cosine(
      imageVectors.get(query.id),
      imageVectors.get(candidate.id),
    )),
    hybrid: (query, relevant) => rankHybrid(query, relevant, { imageVector: imageVectors.get(query.id) }),
  };
}

function textBuilders() {
  return {
    random: randomRank,
    lexical: (query, relevant) => rankScores(query, relevant, (candidate) => lexicalOverlap(query.text, candidate.category)),
    "clip-text": (query, relevant) => {
      const vector = textVectors[query.text];
      if (!vector) throw new Error(`Missing text embedding for ${query.text}`);
      return rankScores(query, relevant, (candidate) => cosine(vector, imageVectors.get(candidate.id)));
    },
    hybrid: (query, relevant) => {
      const vector = textVectors[query.text];
      if (!vector) throw new Error(`Missing text embedding for ${query.text}`);
      return rankHybrid(query, relevant, { textVector: vector });
    },
  };
}

function pairedBuilders() {
  return {
    ...imageBuilders(),
    lexical: (query, relevant) => rankScores(query, relevant, (candidate) => lexicalOverlap(query.text, candidate.category)),
    "clip-text": (query, relevant) => {
      const vector = textVectors[query.text];
      if (!vector) throw new Error(`Missing text embedding for ${query.text}`);
      return rankScores(query, relevant, (candidate) => cosine(vector, imageVectors.get(candidate.id)));
    },
    hybrid: (query, relevant) => {
      const vector = textVectors[query.text];
      if (!vector) throw new Error(`Missing text embedding for ${query.text}`);
      return rankHybrid(query, relevant, {
        imageVector: imageVectors.get(query.id),
        textVector: vector,
      });
    },
  };
}

function paraphraseQueries(split, table) {
  return Object.entries(table).map(([className, text]) => textQuery(`${split}-paraphrase-${className}`, className, text));
}

function literalQueries() {
  return CLASS_NAMES.map((className) => textQuery(`literal-${className}`, className, literalQuery(className)));
}

function withText(imageRecords, textForClass) {
  return imageRecords.map((record) => ({
    ...record,
    className: record.category,
    text: textForClass(record.category),
  }));
}

function rankingsMatch(left, right) {
  if (!left || !right || left.queries !== right.queries) return false;
  return true;
}

function sameOrder(trackResult, leftName, rightName) {
  const left = trackResult.methods[leftName];
  const right = trackResult.methods[rightName];
  if (!left?.perClass || !right?.perClass || left.failureCount == null) return false;
  return left.precisionAtK === right.precisionAtK
    && left.recallAtK === right.recallAtK
    && left.ndcgAtK === right.ndcgAtK;
}

const imageTest = track(testImages.map(imageQuery), imageBuilders());
const imageValidation = track(validationImages.map(imageQuery), imageBuilders());
imageValidation.official = false;
imageValidation.note = "Validation split. Parameters were not selected from these numbers.";
imageTest.official = true;
imageTest.hybridMatchesClipImage = sameOrder(imageTest, "hybrid", "clip-image");

let textLiteral = null;
let textParaphraseTest = null;
let textParaphraseValidation = null;
let pairedTest = null;
let pairedValidation = null;
let diversityAblation = null;

if (!textVectors) {
  const blocked = { status: "blocked", reason: textBlocker };
  textLiteral = blocked;
  textParaphraseTest = blocked;
  textParaphraseValidation = blocked;
  pairedTest = blocked;
  pairedValidation = blocked;
  diversityAblation = blocked;
} else {
  textLiteral = track(literalQueries(), textBuilders());
  textLiteral.official = true;
  textLiteral.note = "The literal template is shared by construction. It was not fit to the test split. Hybrid uses text only, so it should match clip-text.";
  textLiteral.hybridMatchesClipText = sameOrder(textLiteral, "hybrid", "clip-text");

  textParaphraseTest = track(paraphraseQueries("test", textQueries.testParaphrases), textBuilders());
  textParaphraseTest.official = true;
  textParaphraseValidation = track(paraphraseQueries("validation", textQueries.validationParaphrases), textBuilders());
  textParaphraseValidation.official = false;
  textParaphraseValidation.note = "Validation paraphrases. Not used to change the test paraphrases or the weights.";

  pairedTest = track(withText(testImages, (className) => textQueries.testParaphrases[className]), pairedBuilders());
  pairedTest.official = true;
  pairedValidation = track(
    withText(validationImages, (className) => textQueries.validationParaphrases[className]),
    pairedBuilders(),
  );
  pairedValidation.official = false;
  pairedValidation.note = "Validation pairs. Not used to select the hybrid weights.";

  const ablationCases = { relevance: [], diverse: [] };
  for (const query of withText(testImages, (className) => textQueries.testParaphrases[className])) {
    const relevant = relevantIds(query.classId);
    const started = performance.now();
    const rows = indexProducts.map((candidate) => ({
      id: candidate.id,
      score: hybridScore({
        imageVector: imageVectors.get(query.id),
        textVector: textVectors[query.text],
      }, imageVectors.get(candidate.id)).score,
    }));
    const relevance = rankByScore(rows);
    const pool = relevance.slice(0, DIVERSITY_POOL);
    const diverse = diversify(pool, imageVectors, DIVERSITY_LAMBDA);
    const latency = performance.now() - started;
    const pack = (ordered) => finish(
      query,
      ordered.map((row) => row.id),
      relevant,
      performance.now() - latency,
    );
    ablationCases.relevance.push({ ...pack(pool), latencyMs: latency });
    ablationCases.diverse.push({ ...pack(diverse), latencyMs: latency });
  }
  diversityAblation = {
    official: true,
    pool: `top ${DIVERSITY_POOL} by hybrid score, not the full index`,
    note: "Compare diversity only with the relevance order of this same pool. Do not compare it with pixel or lexical search.",
    methods: {
      "hybrid-top50": methodBlock(ablationCases.relevance),
      "hybrid-diverse": methodBlock(ablationCases.diverse),
    },
  };
}

const coatGate = applyHardConstraints(indexProducts, { categories: ["Coat"] });
const budgetGate = applyHardConstraints(indexProducts, { maxBudget: 1000 });
const stockGate = applyHardConstraints(indexProducts, { requireInStock: true });
const sizeGate = applyHardConstraints(indexProducts, { size: "M" });
if (!coatGate.ok || coatGate.report.eligible !== 100 || coatGate.candidates.some((product) => product.category !== "Coat")) {
  throw new Error("Category gate failed on the image index");
}
if (budgetGate.ok || stockGate.ok || sizeGate.ok) {
  throw new Error("A missing catalogue field was treated as available");
}

function sameNameCosine(left, right) {
  if (!textVectors) return null;
  const a = textVectors[left.name];
  const b = textVectors[right.name];
  if (!a || !b) return null;
  return cosine(a, b);
}

const byListing = new Map(listings.listings.map((row) => [row.listingId, row]));
const exactCases = pairsFile.pairs.map((pair) => {
  const left = byListing.get(pair.listingA);
  const right = byListing.get(pair.listingB);
  return {
    id: pair.id,
    label: pair.label,
    nameA: left.name,
    nameB: right.name,
    predicted: decidePair(left, right, { identity: "exact" }).label,
  };
});
let clipDuplicate = { status: "blocked", reason: textBlocker || "Name embeddings are missing." };
if (textVectors) {
  const missing = [];
  const clipCases = pairsFile.pairs.map((pair) => {
    const left = byListing.get(pair.listingA);
    const right = byListing.get(pair.listingB);
    const nameCosine = sameNameCosine(left, right);
    if (!Number.isFinite(nameCosine)) missing.push(pair.id);
    const decision = decidePair(left, right, { identity: "clip", nameCosine, threshold: NAME_COSINE_THRESHOLD });
    return {
      id: pair.id,
      label: pair.label,
      nameA: left.name,
      nameB: right.name,
      nameCosine,
      predicted: decision.ok ? decision.label : null,
    };
  });
  clipDuplicate = missing.length > 0
    ? { status: "blocked", reason: `Missing name embedding for ${missing.join(", ")}` }
    : {
      status: "ok",
      threshold: NAME_COSINE_THRESHOLD,
      thresholdNote: "0.90 was fixed before these names were embedded. It was not searched.",
      ...scoreDecisions(clipCases),
      cases: clipCases,
    };
}

const report = {
  generatedAt: new Date().toISOString(),
  disclaimer: "Fashion-MNIST class match is not shopper relevance and does not validate real-world fashion recommendations. Images are 28x28 grayscale.",
  protocol: {
    modelId: MODEL_ID,
    k: RETRIEVAL_K,
    indexPerClass: manifest.indexPerClass,
    validationPerClass: manifest.validationPerClass,
    testPerClass: manifest.testPerClass,
    hybridWeights: { image: 1, text: 1 },
    diversityLambda: DIVERSITY_LAMBDA,
    diversityPool: DIVERSITY_POOL,
    nameCosineThreshold: NAME_COSINE_THRESHOLD,
    randomSeed: RANDOM_SEED,
    scoreDefinition: SCORE_DEFINITION,
  },
  embed: embedMeta,
  tracks: {
    imageTest,
    imageValidation,
    textLiteral,
    textParaphraseTest,
    textParaphraseValidation,
    pairedTest,
    pairedValidation,
    diversityAblation,
  },
  constraints: {
    coatEligible: coatGate.report.eligible,
    coatViolations: coatGate.candidates.filter((product) => product.category !== "Coat").length,
    budget: { ok: budgetGate.ok, errors: budgetGate.errors },
    availability: { ok: stockGate.ok, errors: stockGate.errors },
    size: { ok: sizeGate.ok, errors: sizeGate.errors },
  },
  duplicates: {
    pairs: pairsFile.pairs.length,
    listings: listings.listings.length,
    warning: "Thirteen hand-labelled pairs are the entire set. There is no held-out split. This is not a reliable estimate of duplicate detection.",
    featuresUsed: ["name", "category", "colour", "material", "silhouette", "price", "currency"],
    featuresExcluded: ["description", "itemId"],
    exactName: {
      status: "ok",
      ...scoreDecisions(exactCases),
      cases: exactCases,
    },
    clipName: clipDuplicate,
  },
};

await writeFile(resultsPath, `${JSON.stringify(report, null, 2)}\n`);

function line(trackResult, method) {
  if (!trackResult || trackResult.status === "blocked") return `${method}: blocked`;
  const row = trackResult.methods?.[method];
  if (!row || row.status === "blocked") return `${method}: blocked`;
  return `${method}: P ${fmt(row.precisionAtK)} R ${fmt(row.recallAtK)} N ${fmt(row.ndcgAtK)} fail ${row.failureCount}`;
}

function fmt(value) {
  return typeof value === "number" ? value.toFixed(3) : "null";
}

console.log(JSON.stringify({
  imageTest: ["random", "pixel", "clip-image", "hybrid"].map((method) => line(imageTest, method)),
  textParaphraseTest: textParaphraseTest?.status === "blocked"
    ? textParaphraseTest
    : ["random", "lexical", "clip-text", "hybrid"].map((method) => line(textParaphraseTest, method)),
  pairedTest: pairedTest?.status === "blocked"
    ? pairedTest
    : ["clip-image", "clip-text", "hybrid"].map((method) => line(pairedTest, method)),
  diversity: diversityAblation?.status === "blocked"
    ? diversityAblation
    : ["hybrid-top50", "hybrid-diverse"].map((method) => line(diversityAblation, method)),
  duplicates: {
    exact: report.duplicates.exactName.accuracy,
    clip: report.duplicates.clipName.status === "ok" ? report.duplicates.clipName.accuracy : report.duplicates.clipName.status,
  },
  constraints: report.constraints,
}, null, 2));

void rankingsMatch;

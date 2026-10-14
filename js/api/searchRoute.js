/**
 * POST /api/search and GET /api/sample-queries.
 * Catalogue ranking stays in the root process. Fashion-MNIST CLIP calls the sidecar.
 * A stopped sidecar still returns a fallback list.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { gunzipOrThrow, readIdxImages } from "../../ml/src/data/idx.mjs";
import { normalizeText, textCacheId } from "../../ml/src/embed/manifest.mjs";
import { products } from "../catalogue.js";
import { buildIntent } from "../intent/buildIntent.js";
import { cosine } from "../vector.js";
import { rankFromSignals } from "../retrieval/rankFromSignals.js";
import { lexicalClassScore, pixelVector } from "../retrieval/sources.js";
import { searchCatalogue } from "../retrieval/search.js";
import { loadVectorStore } from "../retrieval/vectorStore.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SIDECAR = process.env.FITRANK_SIDECAR || "http://127.0.0.1:8787";
const HEALTH_TTL_MS = 5000;
const CALL_TIMEOUT_MS = 3000;

let healthCache = { at: 0, ok: false };
let fmnistCache = null;
let pixelCache = null;

function fail(errors) {
  return { status: 400, body: { ok: false, errors } };
}

export function clearSidecarHealth() {
  healthCache = { at: 0, ok: false };
}

async function sidecarUp(probe) {
  if (probe) return probe();
  if (Date.now() - healthCache.at < HEALTH_TTL_MS) return healthCache.ok;
  let ok = false;
  try {
    const response = await fetch(`${SIDECAR}/health`, { signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
    ok = response.ok;
  } catch {
    ok = false;
  }
  healthCache = { at: Date.now(), ok };
  return ok;
}

async function embedText(text) {
  const response = await fetch(`${SIDECAR}/embed/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  const body = await response.json();
  if (!response.ok || !Array.isArray(body.vector)) throw new Error(body.errors?.[0] || "sidecar text embed failed");
  return body.vector;
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

function loadFmnist() {
  if (fmnistCache) return fmnistCache;
  const split = readJson("ml/data/splits/fmnist.v1.json");
  const queries = readJson("ml/data/text-queries.v1.json");
  const prompts = readJson("ml/config/prompts.v1.json");
  const index = split.items.filter((item) => item.split === "index");
  const val = split.items.filter((item) => item.split === "val");
  const presets = [];
  for (const entry of queries.classes) {
    for (const row of entry.paraphrases) {
      if (row.split !== "val") continue;
      presets.push({ text: row.text, className: entry.className });
    }
  }
  const template = prompts.templates.find((item) => item.id === "literal-product")?.template || "a fashion product photo of a {}";
  fmnistCache = { index, val, presets, template, byId: new Map(split.items.map((item) => [item.id, item])) };
  return fmnistCache;
}

function pointerDir(name) {
  const path = join(root, "ml", "artifacts", "pointers.json");
  if (!existsSync(path)) return null;
  const pointers = JSON.parse(readFileSync(path, "utf8"));
  return pointers[name]?.dir || null;
}

function storeOrNull(name) {
  const dir = pointerDir(name);
  if (!dir || !existsSync(join(dir, "manifest.json"))) return null;
  try {
    return loadVectorStore(dir);
  } catch {
    return null;
  }
}

function sampleQueries() {
  const data = loadFmnist();
  const seen = new Set();
  const images = [];
  for (const item of data.val) {
    if (seen.has(item.rawLabel)) continue;
    seen.add(item.rawLabel);
    images.push({ id: item.id, className: item.rawLabel });
  }
  return {
    ok: true,
    dataset: "fmnist",
    experiment: true,
    text: data.presets.map((row) => ({ text: row.text, className: row.className })),
    images,
  };
}

function catalogueResponse(body) {
  const profile = body.intentProfile;
  if (!profile || typeof profile !== "object") return fail(["intentProfile is required for the catalogue dataset"]);
  const intent = profile.soft || profile.hard ? profile : buildIntent(profile);
  if (!intent.ok && intent.errors) return fail(intent.errors);
  const started = performance.now();
  const ranked = searchCatalogue(intent, { products, arm: "current_scorer" });
  if (!ranked.ok) return fail(ranked.errors || ["catalogue search failed"]);
  const k = body.k == null ? 10 : body.k;
  const rows = ranked.products.slice(0, k).map((row, index) => ({
    id: row.id,
    rank: index + 1,
    score: row.score,
    components: row.components || row.raw || {},
    signalsUsed: row.signalsUsed || ["attribute"],
    category: row.product?.category ?? null,
    attrs: {
      price: row.product?.price ?? null,
      brand: row.product?.brand ?? null,
      color: row.product?.colour ?? null,
      size: row.product?.sizes ?? null,
      stock: row.product?.inStock ?? null,
    },
    explanation: row.explanation || "",
  }));
  return {
    status: 200,
    body: {
      ok: true,
      dataset: "catalogue",
      experiment: false,
      indexVersion: "catalogue-synthetic",
      mode: "attribute",
      backend: "fallback",
      fallbackReason: "catalogue attribute ranking does not call the sidecar",
      results: rows,
      timings: { embedMs: 0, searchMs: performance.now() - started, totalMs: performance.now() - started },
    },
  };
}

function locateTrainImages() {
  const local = join(root, "ml", "data", "idx", "train-images-idx3-ubyte.gz");
  if (existsSync(local)) return local;
  const earlier = join(root, "experiments", "fashion-mnist", "data", "train-images-idx3-ubyte.gz");
  if (existsSync(earlier)) return earlier;
  return null;
}

function indexPixels() {
  if (pixelCache) return pixelCache;
  const file = locateTrainImages();
  if (!file) {
    pixelCache = new Map();
    return pixelCache;
  }
  const images = readIdxImages(gunzipOrThrow(readFileSync(file)));
  const map = new Map();
  for (const item of loadFmnist().index) {
    const start = item.sourceIndex * 784;
    map.set(item.id, Uint8Array.from(images.pixels.subarray(start, start + 784)));
  }
  pixelCache = map;
  return pixelCache;
}

function pixelColumn(pool, gray) {
  const query = pixelVector(gray, "raw");
  const pixels = indexPixels();
  const scores = new Float64Array(pool.length);
  for (let index = 0; index < pool.length; index += 1) {
    const row = pixels.get(pool[index].id);
    const similarity = row && query ? cosine(query, pixelVector(row, "raw")) : null;
    scores[index] = similarity == null ? 0 : similarity;
  }
  return scores;
}

function clipColumn(pool, vector) {
  const store = storeOrNull("index:inverted");
  if (!store || !vector) return null;
  const scores = new Float64Array(pool.length);
  for (let index = 0; index < pool.length; index += 1) {
    const row = store.vector(pool[index].id);
    if (!row) return null;
    let sum = 0;
    for (let d = 0; d < store.dim; d += 1) sum += row[d] * vector[d];
    scores[index] = sum;
  }
  return scores;
}

function presetVector(data, text) {
  const preset = data.presets.find((row) => row.text.toLowerCase() === text.toLowerCase());
  if (!preset) return null;
  const store = storeOrNull("paraphrase");
  if (!store) return null;
  const phrase = normalizeText(data.template.replaceAll("{}", preset.text));
  return store.vector(textCacheId(phrase, "literal-product"));
}

function decodeGray(dataB64) {
  if (typeof dataB64 !== "string" || !dataB64.trim()) return { error: "image dataB64 is required" };
  const bytes = Buffer.from(dataB64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ""), "base64");
  if (bytes.length !== 784) return { error: "gray28 image must be 784 bytes" };
  return { bytes };
}

function matchesCategory(item, categories) {
  if (!categories || categories.length === 0) return true;
  const names = categories.map((value) => String(value).trim().toLowerCase());
  return names.includes(String(item.rawLabel).toLowerCase()) || names.includes(String(item.category || "").toLowerCase());
}

function notApplicable(constraints) {
  if (!constraints || typeof constraints !== "object") return [];
  const names = [];
  if (constraints.maxPrice != null || constraints.maxBudget != null) names.push("maxPrice");
  if (constraints.sizes != null || constraints.size != null) names.push("sizes");
  if (constraints.inStockOnly != null || constraints.requireInStock != null) names.push("inStockOnly");
  return names;
}

function explainScore(signalsUsed, components, score) {
  const parts = signalsUsed.map((name) => `${name} ${Number(components[name]).toFixed(3)}`);
  return `${parts.join("; ")}. Combined score ${Number(score).toFixed(3)}.`;
}

function takeTop(items, columns, weights, k, lambda) {
  const ids = items.map((item) => item.id);
  const order = rankFromSignals(ids, columns, { weights, method: "zscore", lambda });
  const byId = new Map(items.map((item, index) => [item.id, index]));
  return order.slice(0, k).map((id) => ({ item: items[byId.get(id)], index: byId.get(id) }));
}

async function fmnistResponse(body, probe) {
  const mode = body.mode;
  if (mode !== "text" && mode !== "image" && mode !== "hybrid") return fail(["mode must be text, image, or hybrid"]);
  const k = body.k == null ? 10 : body.k;
  const data = loadFmnist();
  const categories = Array.isArray(body.constraints?.categories) ? body.constraints.categories : [];
  const pool = data.index.filter((item) => matchesCategory(item, categories));
  if (pool.length === 0) {
    return {
      status: 200,
      body: emptyFmnist(mode, "no index items passed the category gate", notApplicable(body.constraints), k),
    };
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const image = body.image && typeof body.image === "object" ? body.image : null;
  if ((mode === "text" || mode === "hybrid") && !text) return fail(["text is required for this mode"]);
  if ((mode === "image" || mode === "hybrid") && !image) return fail(["image is required for this mode"]);
  if (image && image.kind !== "sample" && image.kind !== "gray28") return fail(["image.kind must be sample or gray28"]);

  const started = performance.now();
  let embedMs = 0;
  let usedSidecar = false;
  const reasons = [];
  const columns = {};
  const weights = {};

  if (text) {
    const cached = presetVector(data, text);
    const fromPreset = cached ? clipColumn(pool, cached) : null;
    if (fromPreset) {
      columns.txt = fromPreset;
      weights.txt = 1;
      reasons.push("preset text used a cached embedding");
    } else {
      let vector = null;
      const embedStarted = performance.now();
      const up = image?.kind === "sample" ? false : await sidecarUp(probe);
      if (image?.kind === "sample") reasons.push("sample image does not call the sidecar");
      else if (!up) reasons.push("sidecar unavailable");
      else {
        try {
          vector = await embedText(text);
          usedSidecar = true;
        } catch (error) {
          reasons.push(error.message);
        }
      }
      embedMs += performance.now() - embedStarted;
      const fromSidecar = vector ? clipColumn(pool, Float64Array.from(vector)) : null;
      if (fromSidecar) {
        columns.txt = fromSidecar;
        weights.txt = 1;
      } else {
        columns.lexical = Float64Array.from(pool.map((item) => lexicalClassScore(text, item.rawLabel)));
        weights.lexical = 1;
        reasons.push("text used lexical overlap");
      }
    }
  }

  if (image?.kind === "sample") {
    const item = data.byId.get(image.id);
    if (!item) return fail(["sample image id is not in the Fashion-MNIST split"]);
    if (item.split === "index") return fail(["index images are candidates, not queries"]);
    if (item.split === "test") return fail(["test images are not sample queries"]);
    const cached = storeOrNull("val:inverted")?.vector(item.id);
    const fromCache = cached ? clipColumn(pool, cached) : null;
    if (fromCache) {
      columns.img = fromCache;
      weights.img = 1;
      reasons.push("sample image used a cached embedding");
    } else {
      const pixels = indexPixels().get(item.id);
      if (!pixels) return fail(["sample image pixels are not available"]);
      columns.pixel = pixelColumn(pool, pixels);
      weights.pixel = 1;
      reasons.push("sample image used pixel cosine");
    }
  } else if (image?.kind === "gray28") {
    const decoded = decodeGray(image.dataB64);
    if (decoded.error) return fail([decoded.error]);
    let vector = null;
    const embedStarted = performance.now();
    const up = await sidecarUp(probe);
    if (!up) reasons.push("sidecar unavailable");
    else {
      try {
        const response = await fetch(`${SIDECAR}/embed/image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataB64: image.dataB64 }),
          signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        });
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.vector)) throw new Error(payload.errors?.[0] || "sidecar image embed failed");
        vector = payload.vector;
        usedSidecar = true;
      } catch (error) {
        reasons.push(error.message);
      }
    }
    embedMs += performance.now() - embedStarted;
    const fromSidecar = vector ? clipColumn(pool, Float64Array.from(vector)) : null;
    if (fromSidecar) {
      columns.img = fromSidecar;
      weights.img = 1;
    } else {
      columns.pixel = pixelColumn(pool, decoded.bytes);
      weights.pixel = 1;
      reasons.push("image used pixel cosine");
    }
  }

  const signalsUsed = Object.keys(weights);
  if (signalsUsed.length === 0) {
    return { status: 200, body: emptyFmnist(mode, reasons.join("; ") || "no signal", notApplicable(body.constraints), k) };
  }
  const lambda = body.diversity == null ? 1 : 1 - body.diversity;
  const searchStarted = performance.now();
  const top = takeTop(pool, columns, weights, k, lambda);
  const searchMs = performance.now() - searchStarted;
  const results = top.map((row, rank) => {
    const components = {};
    for (const name of signalsUsed) components[name] = columns[name][row.index];
    const score = signalsUsed.reduce((sum, name) => sum + components[name], 0) / signalsUsed.length;
    return {
      id: row.item.id,
      rank: rank + 1,
      score,
      components,
      signalsUsed,
      category: row.item.rawLabel,
      attrs: row.item.attrs,
      explanation: explainScore(signalsUsed, components, score),
    };
  });
  const backend = usedSidecar && reasons.length === 0 ? "clip" : "fallback";
  return {
    status: 200,
    body: {
      ok: true,
      dataset: "fmnist",
      experiment: true,
      indexVersion: "fmnist.v1",
      mode,
      backend,
      fallbackReason: backend === "fallback" ? reasons.join("; ") : undefined,
      notApplicable: notApplicable(body.constraints),
      results,
      timings: { embedMs, searchMs, totalMs: performance.now() - started },
    },
  };
}

function emptyFmnist(mode, reason, skipped, k) {
  return {
    ok: true,
    dataset: "fmnist",
    experiment: true,
    indexVersion: "fmnist.v1",
    mode,
    backend: "fallback",
    fallbackReason: reason,
    notApplicable: skipped,
    results: [],
    k,
    timings: { embedMs: 0, searchMs: 0, totalMs: 0 },
  };
}

function validateCommon(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return ["JSON object body is required"];
  if (body.dataset !== "catalogue" && body.dataset !== "fmnist") return ["dataset must be catalogue or fmnist"];
  if (body.k != null && (!Number.isInteger(body.k) || body.k < 1 || body.k > 50)) return ["k must be an integer from 1 to 50"];
  if (body.diversity != null && (typeof body.diversity !== "number" || body.diversity < 0 || body.diversity > 1)) {
    return ["diversity must be a number from 0 to 1"];
  }
  return [];
}

export async function handleSearch(method, urlPath, body, options = {}) {
  if (method === "GET" && urlPath === "/api/sample-queries") {
    return { status: 200, body: sampleQueries() };
  }
  if (method !== "POST" || urlPath !== "/api/search") return fail(["Unknown search route"]);
  const errors = validateCommon(body);
  if (errors.length > 0) return fail(errors);
  if (body.dataset === "catalogue") return catalogueResponse(body);
  return fmnistResponse(body, options.probe);
}

export function parseSearchBody(raw) {
  if (!raw) return { error: "JSON object body is required" };
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "JSON object body is required" };
    return { body };
  } catch {
    return { error: "Request body is not JSON" };
  }
}

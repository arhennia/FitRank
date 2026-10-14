/**
 * Catalogue search over an IntentProfile.
 * The shopper page does not call this yet. recommendFromIntent remains the page path.
 * A missing text score stays missing. It is not written in as zero.
 */
import { scoreProductBaseline } from "../baseline.js";
import { cosine, l2Normalize } from "../vector.js";
import { answersFromIntent, constraintsFromIntent } from "../intent/adapter.js";
import { mmrSelect } from "./mmr.js";
import { withShoppingAnnotations } from "../shopping/annotations.js";
import { applyShoppingGates, scanBaseCandidates } from "../shopping/gates.js";
import { validateConstraints } from "../shopping/profile.js";
import { recommendFromIntent } from "../shopping/recommendIntent.js";
import { CONTEXTS, shopCategoryById } from "../shopping/vocabulary.js";

export const SEARCH_ARMS = ["legacy_baseline", "current_scorer", "embed_only", "hybrid", "hybrid_mmr"];

export const DEFAULT_SEARCH_CONFIG = {
  weightsValidated: false,
  m: 30,
  weights: { attribute: 0.5, embed: 0.5 },
  lambda: 0.7,
};

const SMALL_POOL = 10;

function compareIds(left, right) {
  return String(left).localeCompare(String(right));
}

function queryText(intent) {
  const text = intent?.query?.text;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

function vectorMap(embeddings) {
  const map = new Map();
  if (!embeddings) return map;
  if (typeof embeddings.get === "function") {
    for (const [id, vector] of embeddings) {
      const normal = l2Normalize(Array.from(vector));
      if (normal) map.set(String(id), normal);
    }
    return map;
  }
  for (const [id, vector] of Object.entries(embeddings)) {
    const normal = l2Normalize(Array.isArray(vector) ? vector : []);
    if (normal) map.set(String(id), normal);
  }
  return map;
}

function topIds(rows, m) {
  return [...rows]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return compareIds(left.id, right.id);
    })
    .slice(0, m)
    .map((row) => row.id);
}

function gateProducts(products, constraints) {
  const annotated = products.map(withShoppingAnnotations).filter(Boolean);
  const scanned = scanBaseCandidates(annotated, constraints);
  const gated = applyShoppingGates(scanned.candidates, constraints);
  return gated.candidates;
}

function passes(product, constraints) {
  return gateProducts([product], constraints).length === 1;
}

function baselinePreferences(intent, constraints) {
  const occasions = new Set();
  for (const id of intent?.soft?.occasions || []) {
    const context = CONTEXTS.find((item) => item.id === id);
    for (const name of Object.keys(context?.occasions || {})) occasions.add(name);
  }
  const categories = [];
  for (const id of constraints.categories || []) {
    const spec = shopCategoryById(id);
    for (const name of spec?.catalogueCategories || []) {
      if (!categories.includes(name)) categories.push(name);
    }
  }
  return {
    occasions: [...occasions],
    styles: [],
    categories,
    colours: [],
    priority: null,
  };
}

function listed(provenance, key) {
  const values = provenance?.[key];
  return Array.isArray(values) && values.length > 0 ? values : [];
}

function softEmpty(intent) {
  const soft = intent?.soft;
  if (!soft || soft.aesthetics == null && soft.occasions == null && soft.priorities == null) return true;
  const aesthetics = soft.aesthetics || [];
  const occasions = soft.occasions || [];
  const priorities = soft.priorities && typeof soft.priorities === "object" ? Object.keys(soft.priorities) : [];
  return aesthetics.length === 0 && occasions.length === 0 && priorities.length === 0;
}

function explainRow(row, intent) {
  const provenance = intent?.provenance || {};
  const lines = [];
  if (row.signalsUsed?.includes("attribute") && typeof row.raw?.attribute === "number") {
    const drivers = ["contexts", "aesthetics", "priorities", "role"]
      .filter((key) => listed(provenance, key).length > 0)
      .map((key) => `${key} ${listed(provenance, key).join(", ")}`);
    lines.push(drivers.length > 0
      ? `Attribute score ${row.raw.attribute} from ${drivers.join("; ")}.`
      : `Attribute score ${row.raw.attribute}.`);
  }
  if (row.signalsUsed?.includes("embed") && typeof row.raw?.embed === "number") {
    const query = queryText(intent);
    lines.push(query
      ? `Text similarity ${row.raw.embed.toFixed(3)} for the template query “${query}”.`
      : `Text similarity ${row.raw.embed.toFixed(3)}.`);
  }
  for (const line of row.tradeoffs || []) lines.push(line);
  if (row.missingEmbedding) lines.push("No catalogue text embedding for this item.");
  return lines.join(" ");
}

function legacyRows(result) {
  return (result.products || []).map((item) => ({
    id: item.product.id,
    score: item.score,
    raw: { attribute: item.score },
    components: { attribute: item.score },
    signalsUsed: ["attribute"],
    missingEmbedding: false,
    tradeoffs: item.tradeoffs || [],
    product: item.product,
  }));
}

function rankNormalize(items, name) {
  const present = items.filter((item) => typeof item.raw[name] === "number");
  present.sort((left, right) => {
    if (right.raw[name] !== left.raw[name]) return right.raw[name] - left.raw[name];
    return compareIds(left.id, right.id);
  });
  const ranks = new Map(present.map((item, index) => [item.id, index]));
  const span = Math.max(present.length - 1, 1);
  return items.map((item) => {
    const rank = ranks.get(item.id);
    if (rank == null) return null;
    return (present.length - 1 - rank) / span;
  });
}

function zNormalize(items, name) {
  const values = items.map((item) => (typeof item.raw[name] === "number" ? item.raw[name] : null));
  const finite = values.filter((value) => value != null);
  if (finite.length === 0) return values.map(() => null);
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance = finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / finite.length;
  const stdev = Math.sqrt(variance);
  return values.map((value) => {
    if (value == null) return null;
    if (stdev === 0) return 0;
    return (value - mean) / stdev;
  });
}

function fuse(items, weights) {
  const names = ["attribute", "embed"].filter((name) => weights[name] > 0);
  const normalization = items.length < SMALL_POOL ? "rank" : "zscore";
  const columns = {};
  for (const name of names) {
    columns[name] = normalization === "rank" ? rankNormalize(items, name) : zNormalize(items, name);
  }
  const rows = items.map((item, index) => {
    let weight = 0;
    let sum = 0;
    const components = {};
    const signalsUsed = [];
    for (const name of names) {
      const value = columns[name][index];
      if (value == null) continue;
      weight += weights[name];
      sum += weights[name] * value;
      components[name] = value;
      signalsUsed.push(name);
    }
    return {
      ...item,
      score: weight === 0 ? null : sum / weight,
      components,
      signalsUsed,
    };
  }).filter((item) => item.score != null);
  return { normalization, rows };
}

function orderRows(rows, arm, vectors, lambda) {
  if (arm !== "hybrid_mmr") {
    return [...rows].sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return compareIds(left.id, right.id);
    });
  }
  const selected = mmrSelect(rows, vectors, lambda);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return selected.map((item) => ({ ...byId.get(item.id), missingEmbedding: item.missingEmbedding || byId.get(item.id).missingEmbedding }));
}

/**
 * @param {object} intent IntentProfile from buildIntent
 * @param {object} options products, embeddings, queryVector, arm, config
 */
export function searchCatalogue(intent, options = {}) {
  const arm = options.arm || "hybrid";
  if (!SEARCH_ARMS.includes(arm)) {
    return { ok: false, errors: [`Unknown search arm ${arm}`], products: [] };
  }
  const config = { ...DEFAULT_SEARCH_CONFIG, ...options.config };
  const products = Array.isArray(options.products) ? options.products : [];
  const answers = answersFromIntent(intent);
  const constraintsResult = validateConstraints(constraintsFromIntent(intent));
  if (!constraintsResult.ok) {
    return { ok: false, errors: constraintsResult.errors, products: [], arm, weightsValidated: false };
  }
  const constraints = constraintsResult.value;
  const legacy = recommendFromIntent(products, { answers, constraints });
  if (!legacy.ok) {
    return { ok: false, errors: legacy.errors, products: [], arm, weightsValidated: false };
  }

  const text = queryText(intent);
  const noQuery = text == null || softEmpty(intent);
  const base = {
    ok: true,
    arm,
    dataset: "catalogue",
    weightsValidated: config.weightsValidated === true,
    queryText: text,
    normalization: noQuery || arm === "current_scorer" ? "legacy" : null,
    missingEmbeddings: [],
    violations: 0,
  };

  if (arm === "current_scorer" || (noQuery && arm !== "legacy_baseline" && arm !== "embed_only")) {
    const rows = legacyRows(legacy).map((row) => ({ ...row, explanation: explainRow(row, intent) }));
    return { ...base, normalization: "legacy", products: rows };
  }

  if (arm === "embed_only" && (noQuery || options.queryVector == null)) {
    return { ...base, products: [], unavailable: "query embedding missing" };
  }

  const vectors = vectorMap(options.embeddings);
  const query = options.queryVector == null ? null : l2Normalize(Array.from(options.queryVector));
  const byId = new Map(products.filter(Boolean).map((product) => [String(product.id), product]));

  if (arm === "legacy_baseline") {
    const eligible = gateProducts(products, constraints);
    const prefs = baselinePreferences(intent, constraints);
    const rows = eligible.map((product) => {
      const scored = scoreProductBaseline(product, prefs);
      const row = {
        id: product.id,
        score: scored.score,
        raw: { attribute: scored.score },
        components: { attribute: scored.score },
        signalsUsed: ["attribute"],
        missingEmbedding: !vectors.has(String(product.id)),
        product,
      };
      return { ...row, explanation: explainRow(row, intent) };
    }).sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return compareIds(left.id, right.id);
    });
    const kept = rows.filter((row) => passes(row.product, constraints));
    return {
      ...base,
      normalization: "legacy",
      products: kept,
      missingEmbeddings: kept.filter((row) => row.missingEmbedding).map((row) => row.id),
      violations: rows.length - kept.length,
    };
  }

  const attributeIds = new Set(topIds(legacyRows(legacy), config.m));
  const embedRows = [];
  if (query && arm !== "current_scorer") {
    for (const product of products) {
      if (!product) continue;
      const vector = vectors.get(String(product.id));
      if (!vector) continue;
      const similarity = cosine(query, vector);
      if (similarity == null) continue;
      embedRows.push({ id: String(product.id), score: similarity });
    }
  }
  const embedIds = new Set(topIds(embedRows, config.m));
  const mergedIds = arm === "embed_only" ? [...embedIds] : [...new Set([...attributeIds, ...embedIds])];

  const attributeScore = new Map(legacyRows(legacy).map((row) => [String(row.id), row]));
  const embedScore = new Map(embedRows.map((row) => [row.id, row.score]));
  const mergedProducts = mergedIds.map((id) => byId.get(id)).filter(Boolean);
  const eligible = gateProducts(mergedProducts, constraints);
  const eligibleIds = new Set(eligible.map((product) => String(product.id)));

  const pool = eligible.map((product) => {
    const id = String(product.id);
    const prior = attributeScore.get(id);
    const raw = {};
    if (arm !== "embed_only" && prior) raw.attribute = prior.score;
    if (embedScore.has(id)) raw.embed = embedScore.get(id);
    return {
      id,
      raw,
      tradeoffs: prior?.tradeoffs || [],
      missingEmbedding: !vectors.has(id),
      product,
    };
  });

  const fused = fuse(pool, arm === "embed_only" ? { attribute: 0, embed: 1 } : config.weights);
  const ordered = orderRows(fused.rows, arm, vectors, config.lambda);
  const checked = ordered.filter((row) => eligibleIds.has(row.id) && passes(row.product, constraints));
  return {
    ...base,
    normalization: fused.normalization,
    products: checked.map((row) => ({ ...row, explanation: explainRow(row, intent) })),
    missingEmbeddings: checked.filter((row) => row.missingEmbedding).map((row) => row.id),
    violations: ordered.length - checked.length,
  };
}

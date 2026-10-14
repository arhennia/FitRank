/**
 * Build blinded judging pools. Judgment cells are written empty.
 * Arm labels go to ml/results/shopper, not into the CSV the judge edits.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { products } from "../../../../js/catalogue.js";
import { SEARCH_ARMS, searchCatalogue } from "../../../../js/retrieval/search.js";
import { mulberry32 } from "../../../../js/vector.js";
import { personasFor, personaFileHash } from "./personas.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const TOP = 10;
const ARMS = SEARCH_ARMS;

function csvCell(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll("\"", "\"\"")}"`;
  return text;
}

function attrs(product) {
  return [
    `category=${product.category}`,
    `price=${product.price}`,
    `colour=${product.colour || ""}`,
    `material=${product.material || ""}`,
    `sizes=${(product.sizes || []).join("|")}`,
  ].join("; ");
}

function shuffle(rows, seed) {
  const random = mulberry32(seed);
  const copy = [...rows];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function armResult(intent, arm) {
  if (arm === "embed_only" || arm === "hybrid" || arm === "hybrid_mmr") {
    return { arm, ok: false, unavailable: "catalogue text embeddings were not passed" };
  }
  const started = performance.now();
  const result = searchCatalogue(intent, { products, arm });
  return {
    arm,
    ok: result.ok === true && !result.unavailable,
    unavailable: result.unavailable || null,
    ids: (result.products || []).slice(0, TOP).map((item) => item.id),
    eligible: result.normalization === "legacy" ? result.products.length : null,
    violations: result.violations ?? null,
    ms: performance.now() - started,
  };
}

export function buildPool(split) {
  const rubric = join(root, "docs", "JUDGING.md");
  if (!existsSync(rubric)) throw new Error("docs/JUDGING.md must exist before a pool is generated");
  if (!readFileSync(rubric, "utf8").includes("Not relevant")) throw new Error("Judging rubric is missing the 0/1/2 scale");
  const file = personasFor(split);
  const byId = new Map(products.map((product) => [product.id, product]));
  const rows = [];
  const arms = {};
  const eligible = [];
  for (const persona of file.personas) {
    const itemArms = {};
    for (const arm of ARMS) {
      const result = armResult(persona.intent, arm);
      if (!result.ok) continue;
      for (const id of result.ids) {
        if (!itemArms[id]) itemArms[id] = [];
        itemArms[id].push(arm);
      }
    }
    const current = searchCatalogue(persona.intent, { products, arm: "current_scorer" });
    eligible.push({ id: persona.id, tight: persona.tight, eligible: current.products.length });
    arms[persona.id] = itemArms;
    for (const itemId of Object.keys(itemArms)) {
      const product = byId.get(itemId);
      rows.push({
        persona_id: persona.id,
        item_id: itemId,
        persona_text: persona.want,
        item_title: product?.name || "",
        item_description: product?.description || "",
        item_attrs: product ? attrs(product) : "",
        judgment: "",
      });
    }
  }
  const shuffled = shuffle(rows, split === "val" ? 20261014 : 20261015);
  return { split, hash: file.hash, rows: shuffled, arms, eligible };
}

function writePool(pool) {
  const judging = join(root, "ml", "data", "judging");
  const hidden = join(root, "ml", "results", "shopper");
  mkdirSync(judging, { recursive: true });
  mkdirSync(hidden, { recursive: true });
  const header = "persona_id,item_id,persona_text,item_title,item_description,item_attrs,judgment";
  const lines = pool.rows.map((row) => [
    row.persona_id,
    row.item_id,
    row.persona_text,
    row.item_title,
    row.item_description,
    row.item_attrs,
    "",
  ].map(csvCell).join(","));
  writeFileSync(join(judging, `pool.${pool.split}.csv`), `${header}\n${lines.join("\n")}\n`);
  writeFileSync(join(hidden, `arm-map.${pool.split}.json`), `${JSON.stringify({
    note: "Hidden from the judge. Do not copy these labels into the pool CSV.",
    personaHash: pool.hash,
    arms: pool.arms,
  }, null, 2)}\n`);
  return pool.rows.length;
}

const splitArg = process.argv.includes("--split")
  ? process.argv[process.argv.indexOf("--split") + 1]
  : "all";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const splits = splitArg === "all" ? ["val", "test"] : [splitArg];
  const summary = [];
  for (const split of splits) {
    const pool = buildPool(split);
    const count = writePool(pool);
    summary.push({ split, rows: count, eligible: pool.eligible });
  }
  const statsPath = join(root, "ml", "results", "shopper", "pool-stats.json");
  mkdirSync(dirname(statsPath), { recursive: true });
  const personaHash = personaFileHash();
  writeFileSync(join(root, "ml", "data", "personas.v1.sha256"), `${personaHash}\n`);
  writeFileSync(statsPath, `${JSON.stringify({
    personaHash,
    catalogue: "fictional",
    embedArms: "embed_only, hybrid, and hybrid_mmr are omitted when no catalogue text embedding is passed. They are not filled with stand-in vectors.",
    judgment: "empty",
    summary,
  }, null, 2)}\n`);
  console.log(JSON.stringify(summary.map((item) => ({ split: item.split, rows: item.rows })), null, 2));
}

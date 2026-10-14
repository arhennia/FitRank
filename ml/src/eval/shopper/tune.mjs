/**
 * Val-only shopper tune. Refuses the test split and refuses empty judgments.
 * Does not invent grades. Frozen weights are written only after ingest succeeds.
 *
 * Usage: node ml/src/eval/shopper/tune.mjs --split val --file ml/data/judging/pool.val.csv
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateJudgments } from "./ingest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const rulePath = join(root, "ml", "config", "shopper-tuning.v1.json");
const logPath = join(root, "ml", "results", "shopper", "tune_log.jsonl");

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function log(entry) {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

export function ruleHash() {
  return createHash("sha256").update(readFileSync(rulePath)).digest("hex");
}

export function tuneGuard({ split, file }) {
  const rule = JSON.parse(readFileSync(rulePath, "utf8"));
  if (split === "test" || split === rule.doesNotScore) {
    return { ok: false, reason: "test split is refused until validation judgments select a frozen config" };
  }
  if (split !== "val") return { ok: false, reason: "tune the validation split only" };
  if (!file || !existsSync(file)) return { ok: false, reason: "validation judgment file is missing" };
  const judged = validateJudgments(readFileSync(file, "utf8"));
  if (!judged.ok) return { ok: false, reason: "judgments are incomplete", errors: judged.errors.slice(0, 5) };
  const frozenPath = join(root, "configs", "frozen.shopper.v1.json");
  if (!existsSync(frozenPath)) {
    return { ok: false, reason: "configs/frozen.shopper.v1.json does not exist yet. It is written only after this script selects weights from filled validation judgments." };
  }
  const frozen = JSON.parse(readFileSync(frozenPath, "utf8"));
  if (frozen.ruleHash !== ruleHash()) return { ok: false, reason: "frozen shopper config hash does not match the selection rule" };
  return { ok: true, rows: judged.rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const split = arg("--split");
  const file = arg("--file");
  const result = tuneGuard({ split, file });
  log({ split, file, ok: result.ok, reason: result.reason || null });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

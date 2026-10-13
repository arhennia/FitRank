/**
 * Score one validation config. --split test is refused in this phase.
 *
 * Usage: npm run eval:arm -- --config configs/exp/<arm>.json --split val
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateArm, publicResult, renderArmMarkdown } from "./evaluate.mjs";
import { loadValidationContext } from "./prepare.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const configPath = argument("--config");
const split = argument("--split");
if (!configPath || (split !== "val" && split !== "test")) {
  throw new Error("Usage: npm run eval:arm -- --config configs/exp/<arm>.json --split val|test");
}
if (split === "test") {
  throw new Error("This command does not score the test split. T5 checks the frozen config hash before that run.");
}

const spec = JSON.parse(readFileSync(join(repoRoot, "ml", "config", "tuning.v1.json"), "utf8"));
const arm = JSON.parse(readFileSync(configPath, "utf8"));
const data = loadValidationContext(spec);
const result = evaluateArm(arm, data, spec);
const resultDir = join(repoRoot, "ml", "results", "val");
await mkdir(resultDir, { recursive: true });
await writeFile(join(resultDir, `${arm.id}.json`), `${JSON.stringify(publicResult(result), null, 2)}\n`);
await writeFile(join(resultDir, `${arm.id}.md`), renderArmMarkdown(result));
console.log(JSON.stringify({
  id: arm.id,
  macroNdcgAt10: result.macro.ndcgAt10,
  violationRate: result.violationRate,
}, null, 2));

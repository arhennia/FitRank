/**
 * Validation tuning. This command refuses the test split.
 *
 * Usage: npm run eval:val
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pairedBootstrap } from "../../../js/retrieval/bootstrap.js";
import { macroAverage } from "../../../js/retrieval/metrics.js";
import { selectHybridArm, selectLambda } from "../../../js/retrieval/selection.js";
import { buildArms } from "./arms.mjs";
import { evaluateArm, fmt, publicResult, renderArmMarkdown } from "./evaluate.mjs";
import { hashConfig } from "./hash.mjs";
import { loadValidationContext } from "./prepare.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const spec = JSON.parse(readFileSync(join(repoRoot, "ml", "config", "tuning.v1.json"), "utf8"));

if (argument("--split") === "test" || spec.doesNotScore !== "test") {
  throw new Error("T4 does not score the test split. The frozen config has to be committed before that run.");
}

const arms = buildArms(spec);
const configDir = join(repoRoot, "configs", "exp");
await mkdir(configDir, { recursive: true });
for (const arm of arms) {
  await writeFile(join(configDir, `${arm.id}.json`), `${JSON.stringify(arm, null, 2)}\n`);
}

const data = loadValidationContext(spec);
const results = [];
for (let index = 0; index < arms.length; index += 1) {
  const arm = arms[index];
  console.log(`arm ${index + 1} / ${arms.length}: ${arm.id}`);
  results.push(evaluateArm(arm, data, spec));
}

const chosen = selectHybridArm(results.map((result) => ({
  ...result.arm,
  macroNdcg: result.macro.ndcgAt10,
})), spec);
const chosenResult = results.find((result) => result.arm.id === chosen.id);

const lambdaResults = [];
for (const lambda of spec.lambdas) {
  if (lambda === 1) {
    lambdaResults.push(chosenResult);
    continue;
  }
  const arm = { ...chosen, lambda, id: `${chosen.id}__l${lambda}`, selectable: false };
  console.log(`lambda sweep ${arm.id}`);
  lambdaResults.push(evaluateArm(arm, data, spec));
}
const lambdaChoice = selectLambda(lambdaResults.map((result) => ({
  lambda: result.arm.lambda,
  macroNdcg: result.macro.ndcgAt10,
  diversity: result.macro.diversityAt10,
})), spec);
const frozenResult = lambdaResults.find((result) => result.arm.lambda === lambdaChoice.lambda);

function seriesRows(result, metric) {
  const values = result.series[metric];
  return Array.from(values, (value, index) => ({
    className: data.labelNames[result.series.classIds[index]],
    value,
  }));
}

function macroOf(rows) {
  return macroAverage(rows, (row) => row.value, (row) => row.className);
}

const otherFusion = chosen.fusion === "zscore" ? "rrf" : "zscore";
const fusionMate = results.find((result) => (
  result.arm.task === "hybrid"
  && result.arm.preprocess === chosen.preprocess
  && result.arm.promptTemplate === chosen.promptTemplate
  && result.arm.alpha === chosen.alpha
  && result.arm.fusion === otherFusion
  && result.arm.lambda === 1
));
if (!fusionMate) throw new Error("The other fusion arm is missing");
const paired = {};
paired.fusion = pairedBootstrap(
  seriesRows(chosenResult, "ndcgAt10"),
  seriesRows(fusionMate, "ndcgAt10"),
  macroOf,
  { samples: spec.bootstrap.samples, seed: spec.bootstrap.seed },
);
paired.fusion.comparedWith = fusionMate.arm.id;
if (lambdaChoice.lambda !== 1) {
  paired.lambda = pairedBootstrap(
    seriesRows(frozenResult, "ndcgAt10"),
    seriesRows(chosenResult, "ndcgAt10"),
    macroOf,
    { samples: spec.bootstrap.samples, seed: spec.bootstrap.seed },
  );
  paired.lambda.comparedWith = chosenResult.arm.id;
}

const resultDir = join(repoRoot, "ml", "results", "val");
await mkdir(resultDir, { recursive: true });
const written = [...results, ...lambdaResults.filter((result) => result.arm.lambda !== 1)];
for (const result of written) {
  await writeFile(join(resultDir, `${result.arm.id}.json`), `${JSON.stringify(publicResult(result), null, 2)}\n`);
  await writeFile(join(resultDir, `${result.arm.id}.md`), renderArmMarkdown(result));
}

const frozen = {
  id: "frozen.v1",
  schemaVersion: 1,
  sourceSpec: "ml/config/tuning.v1.json",
  task: "hybrid",
  dataset: "fmnist",
  scoredSplit: "val",
  testSplitScored: false,
  k: spec.k,
  mmrPool: spec.mmrPool,
  preprocess: chosen.preprocess,
  promptTemplate: chosen.promptTemplate,
  fusion: chosen.fusion,
  alpha: chosen.alpha,
  lambda: lambdaChoice.lambda,
  signals: ["img", "txt"],
  weights: { img: chosen.alpha, txt: 1 - chosen.alpha },
  selectionRule: spec.selection,
  lambdaDecision: lambdaChoice,
  validation: {
    lambda1: {
      armId: chosenResult.arm.id,
      macroNdcgAt10: chosenResult.macro.ndcgAt10,
      macroDiversityAt10: chosenResult.macro.diversityAt10,
    },
    chosen: {
      armId: frozenResult.arm.id,
      macroNdcgAt10: frozenResult.macro.ndcgAt10,
      macroDiversityAt10: frozenResult.macro.diversityAt10,
    },
  },
  bootstrap: spec.bootstrap,
  queryDefinition: spec.hybridQueries,
  queryOrder: spec.queryOrder,
};
frozen.configHash = hashConfig(frozen);
await writeFile(join(repoRoot, "configs", "frozen.v1.json"), `${JSON.stringify(frozen, null, 2)}\n`);

const summary = {
  spec: spec.id,
  scoredSplit: "val",
  testSplitScored: false,
  prepareMs: data.prepareMs,
  arms: written.map((result) => ({
    id: result.arm.id,
    task: result.arm.task,
    selectable: result.arm.selectable,
    macroNdcgAt10: result.macro.ndcgAt10,
    ndcgInterval: result.interval.ndcgAt10,
    macroPrecisionAt10: result.macro.precisionAt10,
    macroDiversityAt10: result.macro.diversityAt10,
    coverageAt10: result.coverageAt10,
    violationRate: result.violationRate,
  })),
  chosen: frozen,
  paired,
};
await writeFile(join(resultDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

const sorted = [...summary.arms].sort((left, right) => right.macroNdcgAt10 - left.macroNdcgAt10);
const summaryLines = [
  "# Validation summary",
  "",
  "The test split was not scored. The selection rule is `ml/config/tuning.v1.json`.",
  "",
  `Chosen arm \`${frozenResult.arm.id}\`. Macro NDCG@10 ${fmt(frozenResult.macro.ndcgAt10)}. Lambda decision: ${lambdaChoice.reason}.`,
  "",
  `Config hash \`${frozen.configHash}\`.`,
  "",
  "| Arm | Task | Macro NDCG@10 | 95% interval | Precision@10 | Diversity@10 |",
  "| --- | --- | ---: | --- | ---: | ---: |",
];
for (const arm of sorted) {
  summaryLines.push(`| ${arm.id} | ${arm.task} | ${fmt(arm.macroNdcgAt10)} | ${fmt(arm.ndcgInterval.low)} to ${fmt(arm.ndcgInterval.high)} | ${fmt(arm.macroPrecisionAt10)} | ${fmt(arm.macroDiversityAt10)} |`);
}
summaryLines.push("");
await writeFile(join(resultDir, "summary.md"), `${summaryLines.join("\n")}\n`);
console.log(JSON.stringify({
  chosen: frozenResult.arm.id,
  macroNdcgAt10: frozenResult.macro.ndcgAt10,
  lambda: lambdaChoice.lambda,
  configHash: frozen.configHash,
}, null, 2));

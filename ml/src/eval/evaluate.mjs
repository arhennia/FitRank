/**
 * Score one arm with the retrieval core and summarise it.
 * Intervals are a query-level bootstrap of the macro average. The seed restarts for each metric.
 */
import { passesConstraints } from "../../../js/retrieval/constraints.js";
import {
  coverageAtK,
  distinctCount,
  hitAtK,
  intraListDiversity,
  macroAverage,
  ndcgAtK,
  percentile,
  precisionAtK,
  rPrecision,
  recallAtK,
} from "../../../js/retrieval/metrics.js";
import { rankFromSignals } from "../../../js/retrieval/rankFromSignals.js";
import { mulberry32 } from "../../../js/vector.js";
import { diversityMapFor, queriesFor } from "./prepare.mjs";

const METRICS = [
  "precisionAt10",
  "recallAt10",
  "rPrecision",
  "hitAt10",
  "mrr",
  "ndcgAt10",
  "diversityAt10",
  "distinctClasses",
];

function macroIndexed(values, classIds, classCount) {
  const sum = new Float64Array(classCount);
  const count = new Uint32Array(classCount);
  for (let index = 0; index < values.length; index += 1) {
    const classId = classIds[index];
    sum[classId] += values[index];
    count[classId] += 1;
  }
  let total = 0;
  let seen = 0;
  for (let classId = 0; classId < classCount; classId += 1) {
    if (count[classId] === 0) continue;
    total += sum[classId] / count[classId];
    seen += 1;
  }
  return seen === 0 ? null : total / seen;
}

function bootstrapMacro(values, classIds, classCount, samples, seed) {
  const random = mulberry32(seed >>> 0);
  const count = values.length;
  const replicates = [];
  const drawnValues = new Float64Array(count);
  const drawnClasses = new Uint8Array(count);
  for (let sample = 0; sample < samples; sample += 1) {
    for (let index = 0; index < count; index += 1) {
      const draw = Math.floor(random() * count);
      drawnValues[index] = values[draw];
      drawnClasses[index] = classIds[draw];
    }
    replicates.push(macroIndexed(drawnValues, drawnClasses, classCount));
  }
  replicates.sort((left, right) => left - right);
  return {
    point: macroIndexed(values, classIds, classCount),
    low: percentile(replicates, 0.025),
    high: percentile(replicates, 0.975),
    samples,
    seed: seed >>> 0,
  };
}

function diversitySpace(arm) {
  if (arm.task === "pixel") return `pixel-${arm.pixelVariant}`;
  if (arm.task === "lexical") return "clip-as-is";
  return `clip-${arm.preprocess}`;
}

function emptyAttrs() {
  return { price: null, brand: null, color: null, size: null, stock: null, rating: null };
}

export function evaluateArm(arm, data, spec) {
  const queries = queriesFor(arm, data);
  const vectors = diversityMapFor(arm, data);
  const classCount = data.labelNames.length;
  const classIds = new Uint8Array(queries.length);
  const columns = Object.fromEntries(METRICS.map((metric) => [metric, new Float64Array(queries.length)]));
  const searchTimes = new Float64Array(queries.length);
  const topIds = [];
  let violations = 0;
  let returned = 0;
  const k = arm.k;
  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index];
    const started = performance.now();
    const order = rankFromSignals(data.indexIds, query.columns, {
      weights: arm.weights,
      method: arm.fusion,
      lambda: arm.lambda,
      vectors,
      mmrPool: arm.mmrPool,
    });
    searchTimes[index] = performance.now() - started;
    const relevantInPool = data.relevantInPool.get(query.className);
    const limit = Math.max(k, relevantInPool);
    const relevance = new Array(limit);
    let first = 0;
    for (let rank = 0; rank < limit; rank += 1) {
      const relevant = data.labelById.get(order[rank]) === query.className ? 1 : 0;
      relevance[rank] = relevant;
      if (relevant === 1 && first === 0) first = rank + 1;
    }
    if (first === 0) {
      for (let rank = limit; rank < order.length; rank += 1) {
        if (data.labelById.get(order[rank]) === query.className) {
          first = rank + 1;
          break;
        }
      }
    }
    const topLabels = [];
    const topVectors = [];
    const ids = [];
    for (let rank = 0; rank < k; rank += 1) {
      const id = order[rank];
      ids.push(id);
      topLabels.push(data.labelById.get(id));
      topVectors.push(vectors.get(id));
      const item = { id, category: data.labelById.get(id), attrs: emptyAttrs() };
      returned += 1;
      if (!passesConstraints(item, {})) violations += 1;
    }
    topIds.push(ids);
    classIds[index] = data.classIndex.get(query.className);
    const metrics = {
      precisionAt10: precisionAtK(relevance, k),
      recallAt10: recallAtK(relevance, k, relevantInPool),
      rPrecision: rPrecision(relevance, relevantInPool),
      hitAt10: hitAtK(relevance, k),
      mrr: first === 0 ? 0 : 1 / first,
      ndcgAt10: ndcgAtK(relevance, k, relevantInPool),
      diversityAt10: intraListDiversity(topVectors),
      distinctClasses: distinctCount(topLabels),
    };
    for (const [metric, value] of Object.entries(metrics)) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Query ${query.id} produced a non-finite ${metric}`);
      }
      columns[metric][index] = value;
    }
  }

  const samples = spec.bootstrap.samples;
  const seed = spec.bootstrap.seed;
  const macro = {};
  const interval = {};
  const perClass = {};
  for (const name of data.labelNames) perClass[name] = { queries: 0 };
  for (const metric of METRICS) {
    const values = columns[metric];
    const point = macroIndexed(values, classIds, classCount);
    const check = macroAverage(
      queries.map((query, index) => ({ className: query.className, value: values[index] })),
      (row) => row.value,
      (row) => row.className,
    );
    if (Math.abs(point - check) > 1e-9) {
      throw new Error(`Macro ${metric} drifted from the tested average`);
    }
    macro[metric] = point;
    interval[metric] = bootstrapMacro(values, classIds, classCount, samples, seed);
    for (let index = 0; index < queries.length; index += 1) {
      const name = queries[index].className;
      perClass[name][metric] = (perClass[name][metric] || 0) + values[index];
      if (metric === METRICS[0]) perClass[name].queries += 1;
    }
  }
  for (const name of data.labelNames) {
    const row = perClass[name];
    for (const metric of METRICS) row[metric] /= row.queries;
  }

  return {
    arm,
    queries: queries.length,
    diversitySpace: diversitySpace(arm),
    macro,
    interval,
    perClass,
    coverageAt10: coverageAtK(topIds, data.indexIds.length, k),
    violationRate: returned === 0 ? null : violations / returned,
    latencyMs: {
      p50: percentile([...searchTimes].sort((left, right) => left - right), 0.5),
      p95: percentile([...searchTimes].sort((left, right) => left - right), 0.95),
    },
    series: {
      ndcgAt10: columns.ndcgAt10,
      diversityAt10: columns.diversityAt10,
      classIds,
    },
  };
}

export function fmt(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return value.toFixed(3);
}

export function renderArmMarkdown(result) {
  const lines = [
    `# ${result.arm.id}`,
    "",
    `Task \`${result.arm.task}\`. Fusion \`${result.arm.fusion}\`. Lambda ${result.arm.lambda}. Diversity space \`${result.diversitySpace}\`.`,
    "",
    `${result.queries} validation queries. Coverage@10 ${fmt(result.coverageAt10)}. Violation rate ${fmt(result.violationRate)}. Search p50 ${fmt(result.latencyMs.p50)} ms, p95 ${fmt(result.latencyMs.p95)} ms.`,
    "",
    "| Metric | Macro | 95% interval |",
    "| --- | ---: | --- |",
  ];
  for (const metric of METRICS) {
    const band = result.interval[metric];
    lines.push(`| ${metric} | ${fmt(result.macro[metric])} | ${fmt(band.low)} to ${fmt(band.high)} |`);
  }
  lines.push("", "| Class | NDCG@10 | Precision@10 | Diversity@10 |", "| --- | ---: | ---: | ---: |");
  for (const [name, row] of Object.entries(result.perClass)) {
    lines.push(`| ${name} | ${fmt(row.ndcgAt10)} | ${fmt(row.precisionAt10)} | ${fmt(row.diversityAt10)} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function publicResult(result) {
  return {
    arm: result.arm,
    queries: result.queries,
    diversitySpace: result.diversitySpace,
    macro: result.macro,
    interval: result.interval,
    perClass: result.perClass,
    coverageAt10: result.coverageAt10,
    violationRate: result.violationRate,
    latencyMs: result.latencyMs,
  };
}

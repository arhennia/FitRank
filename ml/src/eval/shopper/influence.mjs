/**
 * Answer-influence check. No human labels.
 * One alternate value per question, then one change per hard constraint.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { products } from "../../../../js/catalogue.js";
import { answersFromIntent, constraintsFromIntent } from "../../../../js/intent/adapter.js";
import { buildIntent } from "../../../../js/intent/buildIntent.js";
import { searchCatalogue } from "../../../../js/retrieval/search.js";
import { QUESTIONS } from "../../../../js/shopping/vocabulary.js";
import { kendallTau, topOverlap } from "./metrics.mjs";
import { loadPersonas } from "./personas.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const FIELDS = ["trigger", "outcome", "role", "discovery", "contexts", "aesthetics", "priorities"];

function alternate(question, current) {
  const options = question.options.map((option) => option.id).filter((id) => !current.includes(id));
  if (options.length === 0) return current;
  if (question.selection === "single") return options[0];
  return [options[0]];
}

function ranking(intent) {
  const result = searchCatalogue(intent, { products, arm: "current_scorer" });
  return {
    ids: (result.products || []).map((item) => item.id),
    eligible: (result.products || []).length,
  };
}

function withAnswers(persona, answers) {
  return buildIntent({ answers, constraints: persona.constraints });
}

export function influenceReport(personas = loadPersonas().personas) {
  const rows = [];
  for (const persona of personas) {
    const baseIntent = persona.intent || buildIntent({ answers: persona.answers, constraints: persona.constraints });
    const base = ranking(baseIntent);
    const answers = answersFromIntent(baseIntent);
    for (const field of FIELDS) {
      const question = QUESTIONS.find((item) => item.id === field);
      const current = question.selection === "single" ? [answers[field]].filter(Boolean) : [...(answers[field] || [])];
      const nextAnswers = { ...answers, [field]: alternate(question, current) };
      const next = ranking(withAnswers(persona, nextAnswers));
      rows.push({
        persona: persona.id,
        field,
        kind: "answer",
        top5Overlap: topOverlap(base.ids, next.ids, 5),
        kendallTau: kendallTau(base.ids, next.ids),
        eligibleBefore: base.eligible,
        eligibleAfter: next.eligible,
        rankingChanged: base.ids.join() !== next.ids.join(),
      });
    }
    const constraints = { ...constraintsFromIntent(baseIntent) };
    const hard = [
      ["budget", { ...constraints, maxBudget: constraints.maxBudget === 1 ? 50 : 1 }],
      ["category", { ...constraints, categories: constraints.categories?.includes("boots") ? ["jewellery"] : ["boots"] }],
      ["size", { ...constraints, size: constraints.size === "28" ? "" : "28" }],
    ];
    for (const [field, nextConstraints] of hard) {
      const next = ranking(buildIntent({ answers, constraints: nextConstraints }));
      rows.push({
        persona: persona.id,
        field,
        kind: "hard",
        top5Overlap: topOverlap(base.ids, next.ids, 5),
        kendallTau: kendallTau(base.ids, next.ids),
        eligibleBefore: base.eligible,
        eligibleAfter: next.eligible,
        eligibilityChanged: base.eligible !== next.eligible,
        rankingChanged: base.ids.join() !== next.ids.join(),
      });
    }
  }
  const fields = [...FIELDS, "budget", "category", "size"];
  const summary = fields.map((field) => {
    const subset = rows.filter((row) => row.field === field);
    const dead = subset.every((row) => row.rankingChanged === false);
    const eligibilityMoves = subset.some((row) => row.eligibilityChanged === true);
    return {
      field,
      kind: subset[0]?.kind,
      personas: subset.length,
      rankingChanges: subset.filter((row) => row.rankingChanged).length,
      meanTop5Overlap: subset.reduce((sum, row) => sum + row.top5Overlap, 0) / subset.length,
      dead,
      hardEligibilityMoved: subset[0]?.kind === "hard" ? eligibilityMoves : null,
    };
  });
  const hardFailures = summary.filter((row) => row.kind === "hard" && row.hardEligibilityMoved !== true);
  return { rows, summary, hardFailures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = influenceReport();
  const out = join(root, "ml", "results", "shopper", "influence.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({
    note: "No human labels. A dead field never changed the current_scorer order on these 24 personas.",
    summary: report.summary,
    hardFailures: report.hardFailures,
  }, null, 2)}\n`);
  console.log(JSON.stringify(report.summary, null, 2));
  if (report.hardFailures.length > 0) process.exit(1);
}

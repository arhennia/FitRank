/**
 * Check a filled judging CSV. Does not score and does not invent grades.
 * Usage: node ml/src/eval/shopper/ingest.mjs --split val --file ml/data/judging/pool.val.csv
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === "\"" && text[index + 1] === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") quoted = false;
      else cell += char;
      continue;
    }
    if (char === "\"") quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => value !== ""));
}

export function validateJudgments(text) {
  const table = parseCsv(text);
  const header = table[0] || [];
  const judgmentIndex = header.indexOf("judgment");
  const errors = [];
  if (judgmentIndex < 0) errors.push("missing judgment column");
  const grades = [];
  for (let index = 1; index < table.length; index += 1) {
    const value = (table[index][judgmentIndex] || "").trim();
    if (value !== "0" && value !== "1" && value !== "2") {
      errors.push(`row ${index + 1} judgment must be 0, 1, or 2`);
    } else grades.push(Number(value));
  }
  if (table.length < 2) errors.push("no judged rows");
  return { ok: errors.length === 0, errors, rows: Math.max(0, table.length - 1), grades };
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = arg("--file");
  if (!file) {
    console.error("Pass --file path/to/pool.csv");
    process.exit(1);
  }
  const result = validateJudgments(readFileSync(file, "utf8"));
  console.log(JSON.stringify({ ok: result.ok, rows: result.rows, errors: result.errors.slice(0, 20) }, null, 2));
  if (!result.ok) process.exit(1);
}

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildIntent } from "../../../../js/intent/buildIntent.js";
import { validateConstraints, validateQuestionnaire } from "../../../../js/shopping/profile.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

export function personasPath() {
  return join(root, "ml", "data", "personas.v1.json");
}

export function personaFileHash() {
  const bytes = readFileSync(personasPath());
  return createHash("sha256").update(bytes).digest("hex");
}

export function loadPersonas() {
  const file = JSON.parse(readFileSync(personasPath(), "utf8"));
  const personas = file.personas || [];
  if (personas.length !== 24) throw new Error(`Expected 24 personas, found ${personas.length}`);
  const val = personas.filter((persona) => persona.split === "val");
  const test = personas.filter((persona) => persona.split === "test");
  if (val.length !== 8 || test.length !== 16) throw new Error("Split must be 8 validation and 16 test");
  const tight = personas.filter((persona) => persona.tight === true);
  if (tight.length !== 3) throw new Error("Expected 3 tight personas");
  for (const persona of personas) {
    if (!persona.want || !persona.want.trim()) throw new Error(`${persona.id} has no want sentence`);
    const answers = validateQuestionnaire(persona.answers);
    if (!answers.ok) throw new Error(`${persona.id}: ${answers.errors.join(" ")}`);
    const constraints = validateConstraints(persona.constraints);
    if (!constraints.ok) throw new Error(`${persona.id}: ${constraints.errors.join(" ")}`);
    persona.intent = buildIntent({ answers: answers.value, constraints: persona.constraints });
  }
  return { ...file, personas, hash: personaFileHash() };
}

export function personasFor(split) {
  const file = loadPersonas();
  if (split !== "val" && split !== "test") throw new Error("split must be val or test");
  return { ...file, personas: file.personas.filter((persona) => persona.split === split) };
}

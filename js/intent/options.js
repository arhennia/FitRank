import { QUESTIONS } from "../shopping/vocabulary.js";

/**
 * priorities.fit is collected and then discarded. Every other option
 * changes the profile, the ranking mode, a score component, or a gate.
 */
export const UNUSED_OPTIONS = [
  {
    question: "priorities",
    id: "fit",
    reason: "scoringPreferences forces fit to 0. The catalogue has no flattering-fit measurement, so this answer does not change the ranking.",
  },
];

export function isUnused(question, id) {
  return UNUSED_OPTIONS.some((item) => item.question === question && item.id === id);
}

export function questionnaireOptions() {
  const rows = [];
  for (const question of QUESTIONS) {
    for (const option of question.options) {
      rows.push({ question: question.id, id: option.id, unused: isUnused(question.id, option.id) });
    }
  }
  return rows;
}

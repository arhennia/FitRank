import { QUESTIONS } from "./vocabulary.js";
import { defaultConstraints, normaliseAnswers, validateConstraints, validateQuestionnaire } from "./profile.js";

export const QUESTION_COUNT = QUESTIONS.length;
export const STEP_CONSTRAINTS = QUESTION_COUNT;
export const STEP_REVIEW = QUESTION_COUNT + 1;
export const LAST_STEP = STEP_REVIEW;

export function createFlowState() {
  return {
    step: 0,
    answers: normaliseAnswers({}),
    constraints: defaultConstraints(),
  };
}

function clone(state) {
  return {
    step: state.step,
    answers: {
      ...state.answers,
      contexts: [...(state.answers.contexts || [])],
      aesthetics: [...(state.answers.aesthetics || [])],
      priorities: [...(state.answers.priorities || [])],
    },
    constraints: {
      ...state.constraints,
      categories: [...(state.constraints.categories || [])],
      colours: [...(state.constraints.colours || [])],
      materials: [...(state.constraints.materials || [])],
      avoid: [...(state.constraints.avoid || [])],
      seasons: [...(state.constraints.seasons || [])],
      brands: [...(state.constraints.brands || [])],
      avoidIds: [...(state.constraints.avoidIds || [])],
    },
  };
}

function questionAt(step) {
  return QUESTIONS[step] || null;
}

export function validateStep(state) {
  if (state.step >= 0 && state.step < QUESTION_COUNT) {
    const question = questionAt(state.step);
    const probe = { ...state.answers };
    if (question.selection === "single") {
      if (!probe[question.id]) return { ok: false, errors: ["Choose an answer to continue."] };
    } else if (!probe[question.id] || probe[question.id].length === 0) {
      return { ok: false, errors: ["Choose at least one option to continue."] };
    }
    return { ok: true, errors: [] };
  }
  if (state.step === STEP_CONSTRAINTS) {
    const check = validateConstraints(state.constraints);
    return { ok: check.ok, errors: check.errors };
  }
  return { ok: true, errors: [] };
}

export function goNext(state) {
  const check = validateStep(state);
  if (!check.ok) return { ok: false, errors: check.errors, state };
  if (state.step >= LAST_STEP) return { ok: true, errors: [], state };
  const next = clone(state);
  next.step += 1;
  return { ok: true, errors: [], state: next };
}

export function goBack(state) {
  const next = clone(state);
  next.step = Math.max(0, state.step - 1);
  return next;
}

export function goToStep(state, step) {
  const next = clone(state);
  const target = Number(step);
  if (!Number.isInteger(target)) return next;
  next.step = Math.min(LAST_STEP, Math.max(0, target));
  return next;
}

function toggleValue(list, value) {
  const next = [...list];
  const index = next.indexOf(value);
  if (index >= 0) next.splice(index, 1);
  else next.push(value);
  return next;
}

/**
 * Select or toggle an answer. Balance on the last question replaces the
 * other trade-offs, and choosing another trade-off clears balance.
 * Open exploration can sit beside named aesthetics.
 */
export function setAnswer(state, questionId, optionId) {
  const next = clone(state);
  const question = QUESTIONS.find((item) => item.id === questionId);
  if (!question || !question.options.some((option) => option.id === optionId)) return next;
  if (question.selection === "single") {
    next.answers[questionId] = optionId;
    return next;
  }
  if (questionId === "priorities" && optionId === "balance") {
    next.answers.priorities = next.answers.priorities.includes("balance") ? [] : ["balance"];
    return next;
  }
  if (questionId === "priorities") {
    const withoutBalance = next.answers.priorities.filter((id) => id !== "balance");
    next.answers.priorities = toggleValue(withoutBalance, optionId);
    return next;
  }
  next.answers[questionId] = toggleValue(next.answers[questionId], optionId);
  return next;
}

export function patchConstraints(state, patch) {
  const next = clone(state);
  next.constraints = { ...next.constraints, ...patch };
  return next;
}

export function toggleConstraint(state, key, value) {
  const next = clone(state);
  const current = Array.isArray(next.constraints[key]) ? next.constraints[key] : [];
  next.constraints[key] = toggleValue(current, value);
  return next;
}

export function resetFlow() {
  return createFlowState();
}

export function flowIsComplete(state) {
  return validateQuestionnaire(state.answers).ok && validateConstraints(state.constraints).ok;
}

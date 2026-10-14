import { formatInr } from "../format.js";
import { reviewModel } from "./profile.js";
import {
  AVOIDS,
  BUDGET_PRESETS,
  DRESS_CODES,
  FITS,
  MATERIALS,
  QUESTIONS,
  SEASONS,
  SHOP_CATEGORIES,
  SIZE_OPTIONS,
} from "./vocabulary.js";
import { COLOURS } from "../weights.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function displayLabel(label) {
  return String(label).replace(/\.$/, "");
}

function optionButton(kind, id, label, pressed, extraClass = "option-card", marker = "circle") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = extraClass;
  button.dataset.kind = kind;
  button.dataset.value = id;
  button.setAttribute("aria-pressed", pressed ? "true" : "false");
  const mark = document.createElement("span");
  mark.className = marker === "square" ? "mark mark-square" : "mark mark-circle";
  mark.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.className = "option-label";
  text.textContent = displayLabel(label);
  button.append(mark, text);
  return button;
}

function questionView(question, answers) {
  const wrap = el("div", "step-panel");
  const title = el("h3", null, question.prompt);
  title.id = "question-title";
  title.tabIndex = -1;
  const hint = el("p", "hint", question.hint);
  const grid = el("div", "option-grid");
  grid.setAttribute("role", "group");
  grid.setAttribute("aria-labelledby", "question-title");
  const selected = answers[question.id];
  for (const option of question.options) {
    const pressed = question.selection === "single" ? selected === option.id : selected.includes(option.id);
    const marker = question.selection === "single" ? "circle" : "square";
    const button = optionButton("answer", option.id, option.label, pressed, "option-card", marker);
    button.dataset.question = question.id;
    grid.append(button);
  }
  wrap.append(title, hint, grid);
  return wrap;
}

function chipSet(kind, options, selected, className = "chip-grid", marker = "square") {
  const grid = el("div", className);
  for (const option of options) {
    const id = option.id || option;
    const label = option.label || option;
    const button = optionButton(kind, id, label, selected.includes(id), "chip", marker);
    if (option.swatch) {
      const swatch = el("span", "swatch");
      swatch.dataset.colour = id;
      button.insertBefore(swatch, button.querySelector(".option-label"));
    }
    grid.append(button);
  }
  return grid;
}

function constraintsView(state, brands) {
  const constraints = state.constraints;
  const wrap = el("div", "step-panel");
  const title = el("h3", null, "What are the practical limits?");
  title.id = "question-title";
  title.tabIndex = -1;
  const hint = el("p", "hint", "Categories and budget are eligibility rules. Leave a control unset if it should not filter the catalogue.");

  const categoriesTitle = el("h4", null, "Product categories");
  const categoriesHint = el("p", "hint", "Choose any that apply. A product qualifies if it belongs to one of them. Missing category tags are not treated as a match.");
  const categories = chipSet("categories", SHOP_CATEGORIES, constraints.categories);

  const budgetTitle = el("h4", null, "Budget");
  const budgetType = el("div", "choices");
  budgetType.setAttribute("role", "group");
  budgetType.setAttribute("aria-label", "Budget type");
  for (const [id, label] of [["item", "Budget per item"], ["total", "Total budget for the purchase"]]) {
    const button = optionButton("budgetType", id, label, constraints.budgetType === id, "chip", "circle");
    budgetType.append(button);
  }
  const presets = el("div", "chip-grid");
  for (const preset of BUDGET_PRESETS) {
    const button = optionButton("preset", String(preset.amount), preset.label, String(constraints.maxBudget) === String(preset.amount), "chip", "circle");
    presets.append(button);
  }
  const budgetLabel = el("label", "stack");
  budgetLabel.htmlFor = "budget-input";
  budgetLabel.append(document.createTextNode(constraints.budgetType === "total" ? "Total budget (INR)" : "Budget per item (INR)"));
  const budget = document.createElement("input");
  budget.id = "budget-input";
  budget.type = "text";
  budget.inputMode = "decimal";
  budget.value = constraints.maxBudget;
  budgetLabel.append(budget);

  const sizeLabel = el("label", "stack");
  sizeLabel.htmlFor = "size-input";
  sizeLabel.append(document.createTextNode("Size, if you need one"));
  const size = document.createElement("select");
  size.id = "size-input";
  const anySize = document.createElement("option");
  anySize.value = "";
  anySize.textContent = "Any size";
  size.append(anySize);
  for (const token of SIZE_OPTIONS) {
    const option = document.createElement("option");
    option.value = token;
    option.textContent = token === "one-size" ? "One size" : token.startsWith("UK") ? `UK ${token.slice(2)}` : token;
    size.append(option);
  }
  size.value = constraints.size || "";
  sizeLabel.append(size);
  const sizeHint = el("p", "hint", "Sizes are the tokens stored on each product. Different brands in this catalogue do not share a real size chart.");

  const stock = el("label", "compare-toggle");
  const stockBox = document.createElement("input");
  stockBox.type = "checkbox";
  stockBox.id = "stock-input";
  stockBox.checked = constraints.requireInStock !== false;
  stock.append(stockBox, document.createTextNode(" In stock only"));

  const more = document.createElement("details");
  more.id = "more-constraints";
  more.className = "extra";
  if (constraints.detailsOpen) more.open = true;
  const summary = document.createElement("summary");
  summary.textContent = "Colour, material, fit, and other limits";
  more.append(summary);
  more.append(el("p", "hint", "These apply only when you set them. If a product does not record the field, it is left out."));

  more.append(el("h4", null, "Colours"));
  more.append(chipSet("colours", COLOURS.map((colour) => ({ id: colour, label: colour, swatch: true })), constraints.colours));

  more.append(el("h4", null, "Materials"));
  more.append(chipSet("materials", MATERIALS.map((material) => ({ id: material, label: material })), constraints.materials));

  const fitLabel = el("label", "stack");
  fitLabel.htmlFor = "fit-input";
  fitLabel.append(document.createTextNode("Fit, optional"));
  const fit = document.createElement("select");
  fit.id = "fit-input";
  const anyFit = document.createElement("option");
  anyFit.value = "";
  anyFit.textContent = "No fit preference";
  fit.append(anyFit);
  for (const option of FITS) {
    const node = document.createElement("option");
    node.value = option.id;
    node.textContent = option.label;
    fit.append(node);
  }
  fit.value = constraints.fit || "";
  fitLabel.append(fit);
  more.append(fitLabel);

  more.append(el("h4", null, "Features or details to avoid"));
  more.append(chipSet("avoid", AVOIDS, constraints.avoid));

  more.append(el("h4", null, "Season or weather"));
  more.append(el("p", "hint", "Only wool and linen have a material hint. Rain has no records in this catalogue."));
  more.append(chipSet("seasons", SEASONS, constraints.seasons));

  const dressLabel = el("label", "stack");
  dressLabel.htmlFor = "dress-input";
  dressLabel.append(document.createTextNode("Required dress code"));
  const dress = document.createElement("select");
  dress.id = "dress-input";
  const noDress = document.createElement("option");
  noDress.value = "";
  noDress.textContent = "No dress code";
  dress.append(noDress);
  for (const option of DRESS_CODES) {
    const node = document.createElement("option");
    node.value = option.id;
    node.textContent = option.label;
    dress.append(node);
  }
  dress.value = constraints.dressCode || "";
  dressLabel.append(dress);
  more.append(dressLabel);

  more.append(el("h4", null, "Brands"));
  more.append(el("p", "hint", "Fictional brands from the current catalogue."));
  more.append(chipSet("brands", brands.map((brand) => ({ id: brand, label: brand })), constraints.brands));

  const importLabel = el("label", "stack");
  importLabel.htmlFor = "catalogue-file";
  importLabel.append(document.createTextNode("Import a JSON or CSV catalogue for this session"));
  const file = document.createElement("input");
  file.id = "catalogue-file";
  file.type = "file";
  file.accept = ".json,.csv,application/json,text/csv";
  importLabel.append(file);
  const importNote = el("p", "hint");
  importNote.id = "import-note";
  more.append(importLabel, importNote);

  wrap.append(
    title,
    hint,
    categoriesTitle,
    categoriesHint,
    categories,
    budgetTitle,
    budgetType,
    presets,
    budgetLabel,
    sizeLabel,
    sizeHint,
    stock,
    more,
  );
  return wrap;
}

function reviewView(state) {
  const wrap = el("div", "step-panel");
  const title = el("h3", null, "Review before the shortlist");
  title.id = "question-title";
  title.tabIndex = -1;
  const hint = el("p", "hint", "This is a reading of today's answers. It is not a shopper type.");
  const { rows } = reviewModel(state.answers, state.constraints);
  const list = el("div", "summary-list");
  for (const row of rows) {
    const item = el("div", "summary-row");
    const text = el("div", "summary-copy");
    const name = el("strong", null, row.label);
    const shown = row.value && String(row.value).trim() ? row.value : "Not provided";
    const value = el("span", "summary-value", shown);
    text.append(name, value);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "text-button";
    edit.dataset.kind = "edit";
    edit.dataset.step = String(row.step);
    edit.append(document.createTextNode("Change"), el("span", "sr-only", ` ${row.label}`));
    item.append(text, edit);
    list.append(item);
  }
  wrap.append(title, hint, list);
  return wrap;
}

export function renderQuestionnaire(root, { state, errors, brands }) {
  root.replaceChildren();
  const progress = el("p", "progress");
  progress.id = "progress";
  const progressSteps = QUESTIONS.length + 2;
  const fraction = String((state.step + 1) / progressSteps);
  progress.style.setProperty("--progress", fraction);
  document.documentElement.style.setProperty("--progress", fraction);
  if (state.step < QUESTIONS.length) {
    progress.textContent = `Question ${state.step + 1} of ${QUESTIONS.length}`;
    progress.setAttribute("aria-label", `Question ${state.step + 1} of ${QUESTIONS.length}`);
  } else if (state.step === QUESTIONS.length) {
    progress.textContent = "Requirements";
    progress.setAttribute("aria-label", "Requirements");
  } else {
    progress.textContent = "Review";
    progress.setAttribute("aria-label", "Review");
  }
  const track = el("span", "progress-track");
  track.setAttribute("aria-hidden", "true");
  track.append(el("span", "progress-fill"));
  progress.append(track);

  let panel;
  if (state.step < QUESTIONS.length) panel = questionView(QUESTIONS[state.step], state.answers);
  else if (state.step === QUESTIONS.length) panel = constraintsView(state, brands);
  else panel = reviewView(state);

  const errorBox = el("div", "form-error");
  errorBox.id = "form-errors";
  errorBox.setAttribute("role", "alert");
  if (errors?.length) {
    const list = document.createElement("ul");
    for (const error of errors) list.append(el("li", null, `Error: ${String(error).replace(/^Error:\s*/, "")}`));
    errorBox.append(list);
    const anchor = panel.querySelector(".option-grid, .choices, .chip-grid");
    if (anchor) anchor.before(errorBox);
    else panel.prepend(errorBox);
    panel.classList.add("has-error");
  }

  const actions = el("div", "form-actions nav-actions");
  const back = document.createElement("button");
  back.type = "button";
  back.className = "text-button";
  back.dataset.kind = "back";
  back.textContent = "Back";
  back.hidden = state.step === 0;
  const next = document.createElement("button");
  next.type = "button";
  next.className = "primary";
  next.dataset.kind = "next";
  next.textContent = state.step < QUESTIONS.length ? "Continue" : state.step === QUESTIONS.length ? "Review" : "Show recommendations";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "text-button";
  reset.dataset.kind = "reset";
  reset.textContent = "Reset";
  actions.append(back, reset, next);

  root.append(progress, panel, actions);
}

export function budgetDisplay(amount) {
  return formatInr(amount);
}

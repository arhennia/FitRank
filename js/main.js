import { MAX_COMPARISON, toggleComparison } from "./compare.js";
import { products } from "./catalogue.js";
import { formatInr, formatList } from "./format.js";
import { recommend } from "./recommend.js";
import { OCCASION_LABELS } from "./weights.js";

const form = document.querySelector("#preferences-form");
const errorsEl = document.querySelector("#form-errors");
const resultsView = document.querySelector("#results-view");
const preferencesView = document.querySelector("#preferences-view");
const comparisonView = document.querySelector("#comparison-view");
const resultsEl = document.querySelector("#results");
const summaryEl = document.querySelector("#results-summary");
const noteEl = document.querySelector("#comparison-note");
const comparisonEl = document.querySelector("#comparison");
const compareButton = document.querySelector("#open-comparison");

let lastResult = null;
let selectedIds = [];

function checkedValues(name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function readPreferences() {
  return {
    occasions: checkedValues("occasion"),
    styles: checkedValues("style"),
    categories: checkedValues("category"),
    colours: checkedValues("colour"),
    maxBudget: form.elements.maxBudget.value,
    priority: form.elements.priority.value,
  };
}

function showPreferences() {
  preferencesView.hidden = false;
  resultsView.hidden = true;
  comparisonView.hidden = true;
}

function showResults() {
  preferencesView.hidden = true;
  resultsView.hidden = false;
  comparisonView.hidden = true;
}

function showComparison() {
  preferencesView.hidden = true;
  resultsView.hidden = true;
  comparisonView.hidden = false;
}

function renderErrors(errors) {
  errorsEl.replaceChildren();
  if (!errors || errors.length === 0) return;
  const list = document.createElement("ul");
  for (const error of errors) {
    const item = document.createElement("li");
    item.textContent = error;
    list.append(item);
  }
  errorsEl.append(list);
}

function attributeLine(product) {
  const occasions = Array.isArray(product.occasions)
    ? product.occasions.map((occasion) => OCCASION_LABELS[occasion] || occasion)
    : [];
  const bits = [
    product.category,
    product.colour,
    product.material,
    occasions.length ? formatList(occasions) : null,
    Number.isFinite(Number(product.comfortRating)) ? `comfort ${product.comfortRating}/5` : null,
    Number.isFinite(Number(product.formalityRating)) ? `formality ${product.formalityRating}/5` : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

function renderResults(result) {
  resultsEl.replaceChildren();
  noteEl.textContent = "";

  if (!result.ok) {
    summaryEl.textContent = "";
    return;
  }

  if (result.products.length === 0) {
    summaryEl.textContent = result.message;
    updateCompareControls();
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "primary";
    edit.textContent = "Edit preferences";
    edit.addEventListener("click", showPreferences);
    resultsEl.append(edit);
    return;
  }

  summaryEl.textContent = `${result.products.length} product${result.products.length === 1 ? "" : "s"} match your preferences.`;
  const cards = document.createElement("div");
  cards.className = "cards";

  result.products.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "card";

    const rank = document.createElement("div");
    rank.className = "rank";
    rank.textContent = String(index + 1);

    const body = document.createElement("div");
    const top = document.createElement("div");
    top.className = "card-top";
    const title = document.createElement("h3");
    title.textContent = item.product.name;
    const score = document.createElement("p");
    score.className = "score";
    score.textContent = `${item.score} / 100`;
    top.append(title, score);

    const bar = document.createElement("div");
    bar.className = "score-bar";
    bar.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.style.width = `${item.score}%`;
    bar.append(fill);

    const meta = document.createElement("p");
    meta.textContent = `${attributeLine(item.product)} · ${formatInr(item.product.price)}`;

    const description = document.createElement("p");
    description.textContent = item.product.description || "";

    const reasons = document.createElement("ul");
    for (const line of item.explanation) {
      const reason = document.createElement("li");
      reason.textContent = line;
      reasons.append(reason);
    }

    const label = document.createElement("label");
    label.className = "compare-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedIds.includes(item.product.id);
    checkbox.addEventListener("change", () => onToggle(item.product.id, checkbox));
    label.append(checkbox, document.createTextNode("Select for comparison"));

    body.append(top, bar, meta, description, reasons, label);
    card.append(rank, body);
    cards.append(card);
  });

  resultsEl.append(cards);
  updateCompareControls();
}

function updateCompareControls() {
  const count = selectedIds.length;
  compareButton.disabled = count < 2;
  compareButton.textContent = count === 0
    ? "Compare selected"
    : `Compare selected (${count} of ${MAX_COMPARISON})`;
}

function onToggle(productId, checkbox) {
  const outcome = toggleComparison(selectedIds, productId);
  selectedIds = outcome.selectedIds;
  if (!outcome.ok) {
    checkbox.checked = false;
    noteEl.textContent = outcome.error;
  } else {
    noteEl.textContent = selectedIds.length === MAX_COMPARISON
      ? "Comparison is limited to 3 products."
      : "";
  }
  updateCompareControls();
}

function selectedItems() {
  if (!lastResult) return [];
  return selectedIds
    .map((id) => lastResult.products.find((item) => item.product.id === id))
    .filter(Boolean);
}

function addCell(row, tag, text) {
  const cell = document.createElement(tag);
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function renderComparison() {
  const items = selectedItems();
  comparisonEl.replaceChildren();
  if (items.length < 2) {
    showResults();
    noteEl.textContent = "Select at least two products to compare.";
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  const head = document.createElement("tr");
  addCell(head, "th", "");
  for (const item of items) {
    const cell = addCell(head, "th", item.product.name);
    const remove = document.createElement("div");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Remove";
    button.addEventListener("click", () => {
      const outcome = toggleComparison(selectedIds, item.product.id);
      selectedIds = outcome.selectedIds;
      renderResults(lastResult);
      renderComparison();
    });
    remove.append(button);
    cell.append(remove);
  }

  const rows = [
    ["Match score", (item) => `${item.score} / 100`],
    ["Price", (item) => formatInr(item.product.price)],
    ["Category", (item) => item.product.category || "—"],
    ["Colour", (item) => item.product.colour || "—"],
    ["Material", (item) => item.product.material || "—"],
    ["Occasions", (item) => {
      const occasions = Array.isArray(item.product.occasions) ? item.product.occasions : [];
      return occasions.length
        ? formatList(occasions.map((occasion) => OCCASION_LABELS[occasion] || occasion))
        : "—";
    }],
  ];

  const body = document.createElement("tbody");
  body.append(head);
  for (const [label, value] of rows) {
    const row = document.createElement("tr");
    addCell(row, "th", label);
    for (const item of items) addCell(row, "td", value(item));
    body.append(row);
  }
  table.append(body);
  wrap.append(table);
  comparisonEl.append(wrap);
  showComparison();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const result = recommend(products, readPreferences());
  if (!result.ok) {
    renderErrors(result.errors);
    return;
  }
  renderErrors([]);
  lastResult = result;
  selectedIds = [];
  renderResults(result);
  showResults();
});

form.addEventListener("reset", () => {
  window.setTimeout(() => {
    renderErrors([]);
    lastResult = null;
    selectedIds = [];
    updateCompareControls();
    resultsEl.replaceChildren();
    comparisonEl.replaceChildren();
    summaryEl.textContent = "";
    noteEl.textContent = "";
    showPreferences();
  }, 0);
});

document.querySelector("#edit-preferences").addEventListener("click", showPreferences);
document.querySelector("#back-to-results").addEventListener("click", () => {
  renderResults(lastResult);
  showResults();
});
compareButton.addEventListener("click", renderComparison);

import { MAX_COMPARISON, toggleComparison } from "./compare.js";
import { products as builtinProducts } from "./catalogue.js";
import { parseCsvCatalogue, parseJsonCatalogue } from "./catalogueIO.js";
import { evaluateSuite } from "./evaluate.js";
import { formatInr, formatList } from "./format.js";
import { recommend } from "./recommend.js";
import { similarProducts } from "./similarity.js";
import { situationDefaults } from "./situations.js";
import { CLASS_NAMES } from "./retrievalProtocol.js";
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
const situationNote = document.querySelector("#situation-note");
const importNote = document.querySelector("#import-note");
const evaluationEl = document.querySelector("#evaluation");

let currentProducts = builtinProducts;
let lastResult = null;
let selectedIds = [];

fillReferenceSelect();

function checkedValues(name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function setChecked(name, values) {
  for (const input of form.querySelectorAll(`input[name="${name}"]`)) {
    input.checked = values.includes(input.value);
  }
}

function readPreferences() {
  const ranking = form.querySelector('input[name="ranking"]:checked');
  return {
    situation: form.elements.situation.value,
    occasions: checkedValues("occasion"),
    styles: checkedValues("style"),
    dislikedStyles: checkedValues("dislikedStyle"),
    categories: checkedValues("category"),
    colours: checkedValues("colour"),
    dislikedColours: checkedValues("dislikedColour"),
    materials: checkedValues("material"),
    maxBudget: form.elements.maxBudget.value,
    requireInStock: form.elements.requireInStock.checked,
    size: form.elements.size.value,
    emphasis: form.elements.emphasis.value,
    likedProductId: form.elements.likedProductId.value,
    flexible: form.elements.flexible.checked,
    ranking: ranking ? ranking.value : "relevance",
  };
}

function fillReferenceSelect() {
  const select = form.elements.likedProductId;
  const current = select.value;
  select.replaceChildren();
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "No reference item";
  select.append(none);
  const ordered = [...currentProducts].sort((a, b) => a.name.localeCompare(b.name));
  for (const product of ordered) {
    const option = document.createElement("option");
    option.value = product.id;
    option.textContent = `${product.name} (${product.category})`;
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === current)) select.value = current;
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
    product.brand,
    product.category,
    product.colour,
    product.material,
    occasions.length ? formatList(occasions) : null,
    Number.isFinite(Number(product.comfortRating)) ? `comfort ${product.comfortRating}/5` : null,
    Number.isFinite(Number(product.versatilityRating)) ? `versatility ${product.versatilityRating}/5` : null,
    Number.isFinite(Number(product.formalityRating)) ? `formality ${product.formalityRating}/5` : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

function renderBreakdown(components) {
  const wrap = document.createElement("div");
  wrap.className = "breakdown";
  for (const component of Object.values(components)) {
    if (!component.active) continue;
    const row = document.createElement("div");
    row.textContent = `${component.label}: ${Math.round(component.value * 100)}% · ${component.contribution.toFixed(1)} pts`;
    wrap.append(row);
  }
  return wrap;
}

function renderLines(lines, className) {
  const list = document.createElement("ul");
  if (className) list.className = className;
  for (const line of lines) {
    const item = document.createElement("li");
    item.textContent = line;
    list.append(item);
  }
  return list;
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

function renderResults(result) {
  resultsEl.replaceChildren();
  noteEl.textContent = "";

  if (!result.ok) {
    summaryEl.textContent = "";
    return;
  }

  const mode = result.ranking === "diverse" ? "Diversity-aware order" : "Relevance-only order";
  const assumptions = result.assumptions?.length ? ` ${result.assumptions.join(" ")}` : "";
  const situation = situationNote.textContent ? ` ${situationNote.textContent}` : "";

  if (result.products.length === 0) {
    summaryEl.textContent = `${result.message}${assumptions}`;
    updateCompareControls();
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "primary";
    edit.textContent = "Edit preferences";
    edit.addEventListener("click", showPreferences);
    resultsEl.append(edit);
    return;
  }

  summaryEl.textContent = `${result.products.length} product${result.products.length === 1 ? "" : "s"} match your preferences. ${mode}.${assumptions}${situation}`;
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

    const labels = document.createElement("div");
    for (const label of item.labels) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = label;
      labels.append(tag);
    }

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

    const reasons = renderLines(item.explanation);
    const tradeoffs = item.tradeoffs?.length ? renderLines(item.tradeoffs, "tradeoffs") : document.createElement("span");

    const actions = document.createElement("div");
    actions.className = "form-actions";
    const more = document.createElement("button");
    more.type = "button";
    more.textContent = "More like this";
    more.addEventListener("click", () => {
      form.elements.likedProductId.value = item.product.id;
      runSearch();
    });
    const less = document.createElement("button");
    less.type = "button";
    less.textContent = "Less like this";
    less.addEventListener("click", () => {
      for (const style of item.product.styles || []) {
        const box = form.querySelector(`input[name="dislikedStyle"][value="${style}"]`);
        if (box) box.checked = true;
      }
      if (item.product.colour) {
        const box = form.querySelector(`input[name="dislikedColour"][value="${item.product.colour}"]`);
        if (box) box.checked = true;
      }
      runSearch();
    });
    const similar = document.createElement("button");
    similar.type = "button";
    similar.textContent = "Show similar";
    similar.addEventListener("click", () => renderSimilar(body, item.product.id));

    const label = document.createElement("label");
    label.className = "compare-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedIds.includes(item.product.id);
    checkbox.addEventListener("change", () => onToggle(item.product.id, checkbox));
    label.append(checkbox, document.createTextNode(" Select for comparison"));
    actions.append(more, less, similar, label);

    body.append(top, labels, bar, meta, description, renderBreakdown(item.components), reasons, tradeoffs, actions);
    card.append(rank, body);
    cards.append(card);
  });

  resultsEl.append(cards);
  updateCompareControls();
}

function renderSimilar(body, productId) {
  const existing = body.querySelector(".similar");
  if (existing) existing.remove();
  const wrap = document.createElement("div");
  wrap.className = "similar";
  const heading = document.createElement("h4");
  heading.textContent = "Similar items";
  wrap.append(heading);
  const matches = similarProducts(currentProducts, productId, readPreferences(), 5);
  if (matches.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No other eligible item is similar under the current constraints.";
    wrap.append(empty);
  } else {
    const list = document.createElement("ul");
    for (const match of matches) {
      const row = document.createElement("li");
      const reasons = match.similarity.features
        .filter((feature) => feature.contribution > 0)
        .slice(0, 3)
        .map((feature) => feature.key);
      row.textContent = `${match.product.name} · similarity ${match.similarity.score.toFixed(2)} · ${reasons.join(", ")}`;
      list.append(row);
    }
    wrap.append(list);
    const caption = document.createElement("p");
    caption.className = "hint";
    caption.textContent = "Similarity compares attributes. It does not mean these are the same item.";
    wrap.append(caption);
  }
  body.append(wrap);
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

function percent(component) {
  if (!component?.active) return "—";
  return `${Math.round(component.value * 100)}%`;
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
    ["Comfort", (item) => percent(item.components.comfort)],
    ["Versatility", (item) => percent(item.components.versatility)],
    ["Formality", (item) => (
      Number.isFinite(Number(item.product.formalityRating)) ? `${item.product.formalityRating}/5` : "—"
    )],
    ["Review estimate", (item) => (
      item.smoothedRating == null
        ? "—"
        : `${item.smoothedRating.toFixed(2)} from ${item.reviewCount} synthetic reviews`
    )],
    ["Budget fit", (item) => percent(item.components.budgetFit)],
    ["Similarity", (item) => (item.similarity == null ? "—" : item.similarity.toFixed(2))],
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

function formatMetric(value) {
  return typeof value === "number" ? value.toFixed(3) : "—";
}

function formatRuntime(value) {
  return typeof value === "number" ? value.toFixed(1) : "—";
}

function renderEvaluation() {
  const report = evaluateSuite(currentProducts);
  evaluationEl.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  const head = document.createElement("tr");
  for (const label of ["Scenario", "Baseline P@5", "Hybrid P@5", "Baseline NDCG", "Hybrid NDCG", "Baseline diversity", "Hybrid diversity", "Violations", "Baseline ms", "Hybrid ms"]) {
    addCell(head, "th", label);
  }
  const body = document.createElement("tbody");
  body.append(head);
  for (const row of report.scenarios) {
    const tr = document.createElement("tr");
    addCell(tr, "th", row.name);
    addCell(tr, "td", formatMetric(row.baseline.precisionAtK));
    addCell(tr, "td", formatMetric(row.hybrid.precisionAtK));
    addCell(tr, "td", formatMetric(row.baseline.ndcgAtK));
    addCell(tr, "td", formatMetric(row.hybrid.ndcgAtK));
    addCell(tr, "td", formatMetric(row.baseline.intraListDiversity));
    addCell(tr, "td", formatMetric(row.hybrid.intraListDiversity));
    const violations = row.hybrid.violationRate == null && row.baseline.violationRate == null
      ? "—"
      : `${formatMetric(row.baseline.violationRate)} / ${formatMetric(row.hybrid.violationRate)}`;
    addCell(tr, "td", violations);
    addCell(tr, "td", formatRuntime(row.baseline.runtimeMs));
    addCell(tr, "td", formatRuntime(row.hybrid.runtimeMs));
    body.append(tr);
  }
  table.append(body);
  wrap.append(table);
  const coverage = document.createElement("p");
  coverage.textContent = `Catalogue coverage: baseline ${formatMetric(report.coverage.baseline)}, hybrid MMR ${formatMetric(report.coverage.hybrid)}. Strategy runtime: baseline ${formatRuntime(report.runtimeMs.baseline)} ms, hybrid ${formatRuntime(report.runtimeMs.hybrid)} ms. Runtime is machine-dependent and is not a quality score.`;
  const notes = document.createElement("ul");
  notes.className = "tradeoffs";
  for (const note of report.notes) {
    const item = document.createElement("li");
    item.textContent = note;
    notes.append(item);
  }
  evaluationEl.append(wrap, coverage, notes);
}

function runSearch() {
  const result = recommend(currentProducts, readPreferences());
  if (!result.ok) {
    renderErrors(result.errors);
    return;
  }
  renderErrors([]);
  lastResult = result;
  selectedIds = [];
  renderResults(result);
  showResults();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch();
});

form.elements.situation.addEventListener("change", () => {
  const defaults = situationDefaults(form.elements.situation.value);
  if (!defaults) {
    situationNote.textContent = "";
    return;
  }
  setChecked("occasion", defaults.occasions);
  if (defaults.emphasis) form.elements.emphasis.value = defaults.emphasis;
  situationNote.textContent = defaults.note;
});

form.addEventListener("reset", () => {
  window.setTimeout(() => {
    renderErrors([]);
    situationNote.textContent = "";
    importNote.textContent = "";
    lastResult = null;
    selectedIds = [];
    updateCompareControls();
    resultsEl.replaceChildren();
    comparisonEl.replaceChildren();
    summaryEl.textContent = "";
    noteEl.textContent = "";
    currentProducts = builtinProducts;
    fillReferenceSelect();
    showPreferences();
  }, 0);
});

document.querySelector("#catalogue-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const parsed = file.name.toLowerCase().endsWith(".csv")
    ? parseCsvCatalogue(text)
    : parseJsonCatalogue(text);
  if (parsed.products.length === 0) {
    importNote.textContent = parsed.errors.join(" ") || "Import failed. The built-in catalogue is still in use.";
    return;
  }
  currentProducts = parsed.products;
  fillReferenceSelect();
  const problems = [...parsed.errors, ...parsed.warnings];
  importNote.textContent = `Imported ${parsed.products.length} rows for this session only.${problems.length ? ` ${problems.join(" ")}` : ""}`;
});

const retrievalForm = document.querySelector("#retrieval-form");
const retrievalStatus = document.querySelector("#retrieval-status");
const retrievalResults = document.querySelector("#retrieval-results");
const experimentReport = document.querySelector("#experiment-report");
const exampleSelect = document.querySelector("#retrieval-example");
const categorySelect = document.querySelector("#retrieval-category");

for (const name of CLASS_NAMES) {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  categorySelect.append(option);
}

function retrievalMessage(text) {
  retrievalStatus.textContent = text;
}

function renderRetrieval(result) {
  retrievalResults.replaceChildren();
  if (!result.ok) {
    retrievalMessage(result.errors?.join(" ") || "Search failed.");
    return;
  }
  const removed = result.constraintReport?.removed;
  const removedText = removed
    ? ` Category removed ${removed.wrongCategory}.`
    : "";
  retrievalMessage(`${result.products.length} images. Signals: ${(result.activeSignals || []).join(", ") || "none"}.${removedText} ${result.disclaimer || ""}`);
  const cards = document.createElement("div");
  cards.className = "cards";
  result.products.forEach((product, index) => {
    const card = document.createElement("article");
    card.className = "card retrieval-card";
    const img = document.createElement("img");
    img.src = product.image;
    img.alt = product.category;
    img.width = 72;
    img.height = 72;
    const body = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = `${index + 1}. ${product.category}`;
    const score = document.createElement("p");
    score.textContent = `Retrieval score ${product.score.toFixed(3)}`;
    body.append(title, score, renderLines(product.reasons || []));
    card.append(img, body);
    cards.append(card);
  });
  retrievalResults.append(cards);
}

function metricCell(value) {
  return typeof value === "number" ? value.toFixed(3) : "—";
}

function renderExperiment(report) {
  experimentReport.replaceChildren();
  if (!report) {
    experimentReport.textContent = "No saved experiment file was found. Run npm run evaluate-retrieval.";
    return;
  }
  const warning = document.createElement("p");
  warning.textContent = report.disclaimer || "";
  experimentReport.append(warning);
  const tracks = [
    ["Image test", report.tracks?.imageTest, ["random", "pixel", "clip-image", "hybrid"]],
    ["Text paraphrase test", report.tracks?.textParaphraseTest, ["random", "lexical", "clip-text", "hybrid"]],
    ["Image plus paraphrase test", report.tracks?.pairedTest, ["random", "pixel", "lexical", "clip-image", "clip-text", "hybrid"]],
    ["Diversity ablation", report.tracks?.diversityAblation, ["hybrid-top50", "hybrid-diverse"]],
  ];
  for (const [title, track, methods] of tracks) {
    const heading = document.createElement("h3");
    heading.textContent = title;
    experimentReport.append(heading);
    if (!track || track.status === "blocked") {
      const blocked = document.createElement("p");
      blocked.textContent = track?.reason || track?.note || "This track did not run.";
      experimentReport.append(blocked);
      continue;
    }
    if (track.note) {
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = track.note;
      experimentReport.append(note);
    }
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    const table = document.createElement("table");
    const head = document.createElement("tr");
    for (const label of ["Method", "P@10", "R@10", "NDCG@10", "Failures", "Pixel diversity"]) addCell(head, "th", label);
    const body = document.createElement("tbody");
    body.append(head);
    for (const method of methods) {
      const row = track.methods?.[method];
      const tr = document.createElement("tr");
      addCell(tr, "th", method);
      if (!row) {
        addCell(tr, "td", "—");
        body.append(tr);
        continue;
      }
      addCell(tr, "td", metricCell(row.precisionAtK));
      addCell(tr, "td", metricCell(row.recallAtK));
      addCell(tr, "td", metricCell(row.ndcgAtK));
      addCell(tr, "td", row.failureCount == null ? "—" : String(row.failureCount));
      addCell(tr, "td", metricCell(row.intraListDiversity));
      body.append(tr);
    }
    table.append(body);
    wrap.append(table);
    experimentReport.append(wrap);
  }
  const duplicates = report.duplicates;
  if (duplicates) {
    const heading = document.createElement("h3");
    heading.textContent = "Duplicate pairs";
    const note = document.createElement("p");
    note.textContent = duplicates.warning || "";
    const exact = duplicates.exactName?.accuracy;
    const clip = duplicates.clipName?.status === "ok" ? duplicates.clipName.accuracy : duplicates.clipName?.status;
    const line = document.createElement("p");
    line.textContent = `Exact-name accuracy ${metricCell(exact)}. CLIP-name accuracy ${typeof clip === "number" ? clip.toFixed(3) : clip || "—"}. n = ${duplicates.pairs}.`;
    experimentReport.append(heading, note, line);
  }
}

retrievalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  retrievalMessage("Searching. The first request loads the local model and can take a while.");
  const file = retrievalForm.elements.image.files?.[0];
  const imageBase64 = file ? await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  }) : "";
  const ranking = retrievalForm.querySelector('input[name="retrievalRanking"]:checked');
  const budget = retrievalForm.elements.maxBudget.value.trim();
  const payload = {
    text: retrievalForm.elements.text.value.trim(),
    exampleId: file ? "" : exampleSelect.value,
    imageBase64,
    category: retrievalForm.elements.category.value,
    ranking: ranking ? ranking.value : "relevance",
  };
  if (budget) payload.maxBudget = budget;
  try {
    const response = await fetch("/api/retrieve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    renderRetrieval(result);
  } catch (error) {
    retrievalMessage(error.message);
  }
});

fetch("/experiments/fashion-mnist/examples.json")
  .then((response) => (response.ok ? response.json() : null))
  .then((examples) => {
    if (!examples?.queries) return;
    for (const query of examples.queries) {
      const option = document.createElement("option");
      option.value = query.id;
      option.textContent = query.className;
      exampleSelect.append(option);
    }
  })
  .catch(() => {});

fetch("/experiments/retrieval-results.json")
  .then((response) => (response.ok ? response.json() : null))
  .then((report) => renderExperiment(report))
  .catch(() => renderExperiment(null));

document.querySelector("#edit-preferences").addEventListener("click", showPreferences);
document.querySelector("#back-to-results").addEventListener("click", () => {
  renderResults(lastResult);
  showResults();
});
compareButton.addEventListener("click", renderComparison);
document.querySelector("#run-evaluation").addEventListener("click", renderEvaluation);

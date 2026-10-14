import { products as builtinProducts } from "../catalogue.js";
import { parseCsvCatalogue, parseJsonCatalogue } from "../catalogueIO.js";
import { MAX_COMPARISON, toggleComparison } from "../compare.js";
import { formatInr } from "../format.js";
import { contentSimilarity } from "../similarity.js";
import {
  createFlowState,
  goBack,
  goNext,
  goToStep,
  patchConstraints,
  resetFlow,
  setAnswer,
  toggleConstraint,
} from "./flow.js";
import { recommendFromIntent } from "./recommendIntent.js";
import { renderQuestionnaire } from "./view.js";
import { categoryLabel } from "./profile.js";

const COMPONENT_NAMES = {
  context: "Setting",
  aesthetic: "Aesthetic",
  versatility: "Versatility",
  distinctiveness: "Distinctiveness",
  comfort: "Comfort",
  quality: "Review estimate",
  value: "Value",
  price: "Price room",
  wardrobeRole: "Wardrobe role",
  similarity: "Similarity",
  avoid: "Set aside",
};

export function mountShopper({ getProducts, setProducts }) {
  const root = document.querySelector("#questionnaire");
  const preferencesView = document.querySelector("#preferences-view");
  const resultsView = document.querySelector("#results-view");
  const comparisonView = document.querySelector("#comparison-view");
  const resultsEl = document.querySelector("#results");
  const summaryEl = document.querySelector("#results-summary");
  const noteEl = document.querySelector("#comparison-note");
  const comparisonEl = document.querySelector("#comparison");
  const compareButton = document.querySelector("#open-comparison");

  let flow = createFlowState();
  let errors = [];
  let lastResult = null;
  let selectedIds = [];
  let importMessage = "";
  let renderedStep = -1;

  function brands() {
    return [...new Set(getProducts().map((product) => product.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function showPreferences() {
    preferencesView.hidden = false;
    resultsView.hidden = true;
    comparisonView.hidden = true;
    render();
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

  function render() {
    renderQuestionnaire(root, { state: flow, errors, brands: brands() });
    const unanswered = Object.values(flow.answers).every((value) => (
      value == null || value === "" || (Array.isArray(value) && value.length === 0)
    ));
    document.documentElement.dataset.intro = flow.step === 0 && unanswered ? "yes" : "no";
    const note = root.querySelector("#import-note");
    if (note && importMessage) note.textContent = importMessage;
    if (errors.length > 0) {
      const box = root.querySelector("#form-errors");
      box.tabIndex = -1;
      box.focus();
      return;
    }
    if (flow.step !== renderedStep && preferencesView.hidden === false) {
      renderedStep = flow.step;
      const title = root.querySelector("#question-title");
      if (title) title.focus();
    }
  }

  function findItem(id) {
    if (!lastResult) return null;
    return [...(lastResult.products || []), ...(lastResult.alternatives || [])].find((item) => item.product.id === id) || null;
  }

  function updateCompareControls() {
    const count = selectedIds.length;
    compareButton.disabled = count < 2;
    compareButton.textContent = count === 0
      ? "Compare selected"
      : `Compare selected (${count} of ${MAX_COMPARISON})`;
  }

  function runSearch() {
    const live = document.querySelector("#rank-status");
    const primary = root.querySelector("button.primary");
    if (live) live.textContent = "Ranking the catalogue";
    if (primary) {
      primary.setAttribute("aria-busy", "true");
      primary.disabled = true;
    }
    let result;
    try {
      result = recommendFromIntent(getProducts(), {
        answers: flow.answers,
        constraints: flow.constraints,
      });
    } catch (error) {
      if (live) live.textContent = "";
      if (primary) {
        primary.removeAttribute("aria-busy");
        primary.disabled = false;
      }
      errors = [error?.message || "Could not rank the catalogue."];
      render();
      return;
    }
    if (primary) {
      primary.removeAttribute("aria-busy");
      primary.disabled = false;
    }
    if (live) live.textContent = "";
    if (!result.ok) {
      errors = result.errors;
      flow = goToStep(flow, 7);
      render();
      return;
    }
    errors = [];
    lastResult = result;
    selectedIds = [];
    renderResults(result);
    showResults();
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

  function renderBreakdown(components) {
    const wrap = document.createElement("div");
    wrap.className = "breakdown";
    for (const component of Object.values(components)) {
      if (!component.active) continue;
      const row = document.createElement("div");
      const name = COMPONENT_NAMES[component.key] || component.key;
      row.textContent = `${name}: ${Math.round(component.value * 100)}% · ${component.contribution.toFixed(1)} pts`;
      wrap.append(row);
    }
    return wrap;
  }

  function attributeLine(product) {
    const bits = [
      product.brand,
      product.shopCategory ? categoryLabel(product.shopCategory) : null,
      product.category,
      product.colour,
      product.material,
      Number.isFinite(Number(product.comfortRating)) ? `comfort ${product.comfortRating}/5` : null,
      Number.isFinite(Number(product.versatilityRating)) ? `versatility ${product.versatilityRating}/5` : null,
      Number.isFinite(Number(product.formalityRating)) ? `formality ${product.formalityRating}/5` : null,
    ].filter(Boolean);
    return bits.join(" · ");
  }

  function onToggle(productId, checkbox) {
    const outcome = toggleComparison(selectedIds, productId);
    selectedIds = outcome.selectedIds;
    if (!outcome.ok) {
      checkbox.checked = false;
      noteEl.textContent = outcome.error;
    } else {
      noteEl.textContent = selectedIds.length === MAX_COMPARISON ? "Comparison is limited to 3 products." : "";
    }
    updateCompareControls();
  }

  function renderCard(item, index) {
    const card = document.createElement("article");
    card.className = "card";
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
    for (const label of item.labels || []) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = label;
      labels.append(tag);
    }
    const bar = document.createElement("div");
    bar.className = "score-bar";
    bar.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(0, Math.min(100, item.score))}%`;
    bar.append(fill);
    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = `${attributeLine(item.product)} · ${formatInr(item.product.price)}`;
    const description = document.createElement("p");
    description.textContent = item.product.description || "";
    const actions = document.createElement("div");
    actions.className = "form-actions";
    const more = document.createElement("button");
    more.type = "button";
    more.textContent = "More like this";
    more.addEventListener("click", () => {
      flow = patchConstraints(flow, { referenceId: item.product.id });
      runSearch();
    });
    const less = document.createElement("button");
    less.type = "button";
    less.textContent = "Less like this";
    less.addEventListener("click", () => {
      const avoidIds = flow.constraints.avoidIds.includes(item.product.id)
        ? flow.constraints.avoidIds
        : [...flow.constraints.avoidIds, item.product.id];
      flow = patchConstraints(flow, { avoidIds });
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
    body.append(
      top,
      labels,
      bar,
      meta,
      description,
      renderBreakdown(item.components),
      renderLines(item.explanation),
      item.tradeoffs?.length ? renderLines(item.tradeoffs, "tradeoffs") : document.createElement("span"),
      actions,
    );
    card.append(body);
    const rank = document.createElement("p");
    rank.className = "rank-label";
    rank.textContent = `Rank ${index + 1}`;
    body.prepend(rank);
    return card;
  }

  function renderSimilar(body, productId) {
    const existing = body.querySelector(".similar");
    if (existing) existing.remove();
    const wrap = document.createElement("div");
    wrap.className = "similar";
    wrap.append(Object.assign(document.createElement("h4"), { textContent: "Similar items" }));
    const pool = [...(lastResult?.products || []), ...(lastResult?.alternatives || [])];
    const source = pool.find((item) => item.product.id === productId)?.product;
    const matches = pool
      .filter((item) => item.product.id !== productId)
      .map((item) => ({ product: item.product, similarity: contentSimilarity(item.product, source) }))
      .sort((a, b) => b.similarity.score - a.similarity.score || a.product.id.localeCompare(b.product.id))
      .slice(0, 5);
    if (!source || matches.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No other item in this shortlist is available to compare.";
      wrap.append(empty);
    } else {
      const list = document.createElement("ul");
      for (const match of matches) {
        const row = document.createElement("li");
        row.textContent = `${match.product.name} · attribute similarity ${match.similarity.score.toFixed(2)}`;
        list.append(row);
      }
      wrap.append(list);
      const caption = document.createElement("p");
      caption.className = "hint";
      caption.textContent = "Similarity compares catalogue attributes. It does not mean these are the same item, and it is not an image match.";
      wrap.append(caption);
    }
    body.append(wrap);
  }

  function renderResults(result) {
    resultsEl.replaceChildren();
    noteEl.textContent = "";
    const mission = result.profile?.missionLabel ? `${result.profile.missionLabel}. ` : "";
    const mode = result.ranking === "diverse" ? "Diversity-aware order." : "Relevance order.";
    const assumptions = result.assumptions?.length ? ` ${result.assumptions.join(" ")}` : "";
    if (!result.products.length) {
      summaryEl.textContent = "";
      updateCompareControls();
      const heading = document.createElement("h2");
      heading.textContent = "No products match these answers";
      const list = document.createElement("ul");
      list.className = "constraint-list";
      const constraints = flow.constraints;
      const lines = [];
      if (constraints.categories?.length) lines.push(`Categories: ${constraints.categories.join(", ")}`);
      if (constraints.maxBudget) {
        lines.push(constraints.budgetType === "total"
          ? `Total budget ${constraints.maxBudget}`
          : `Budget per item ${constraints.maxBudget}`);
      }
      if (constraints.size) lines.push(`Size ${constraints.size}`);
      if (constraints.requireInStock !== false) lines.push("In stock only");
      if (result.message) lines.push(result.message);
      for (const line of lines) {
        const item = document.createElement("li");
        item.textContent = line;
        list.append(item);
      }
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "text-button";
      edit.textContent = "Review your answers";
      edit.addEventListener("click", () => {
        flow = goToStep(flow, 8);
        showPreferences();
      });
      resultsEl.append(heading, list, edit);
      return;
    }
    const spent = result.spent == null ? "" : ` Together they come to ${formatInr(result.spent)}.`;
    summaryEl.textContent = `${mission}${result.products.length} product${result.products.length === 1 ? "" : "s"} in this shortlist. ${mode}${spent}${assumptions}`;
    const cards = document.createElement("div");
    cards.className = "cards";
    result.products.forEach((item, index) => cards.append(renderCard(item, index)));
    resultsEl.append(cards);
    if (result.alternatives?.length) {
      const heading = document.createElement("h3");
      heading.textContent = "Eligible, but outside the remaining total";
      const alt = document.createElement("div");
      alt.className = "cards";
      result.alternatives.forEach((item, index) => alt.append(renderCard(item, result.products.length + index)));
      resultsEl.append(heading, alt);
    }
    updateCompareControls();
  }

  function addCell(row, tag, text) {
    const cell = document.createElement(tag);
    cell.textContent = text;
    row.append(cell);
    return cell;
  }

  function renderComparison() {
    const items = selectedIds.map((id) => findItem(id)).filter(Boolean);
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
      const cell = document.createElement("th");
      const name = document.createElement("span");
      name.className = "compare-name";
      name.textContent = item.product.name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        const outcome = toggleComparison(selectedIds, item.product.id);
        selectedIds = outcome.selectedIds;
        renderResults(lastResult);
        renderComparison();
      });
      cell.append(name, remove);
      head.append(cell);
    }
    const rows = [
      ["Match score", (item) => `${item.score} / 100`],
      ["Price", (item) => formatInr(item.product.price)],
      ["Category", (item) => item.product.category || "—"],
      ["Colour", (item) => item.product.colour || "—"],
      ["Material", (item) => item.product.material || "—"],
      ["Setting", (item) => item.components.context?.active ? `${Math.round(item.components.context.value * 100)}%` : "—"],
      ["Aesthetic", (item) => item.components.aesthetic?.active ? `${Math.round(item.components.aesthetic.value * 100)}%` : "—"],
      ["Versatility", (item) => Number.isFinite(item.components.versatility?.value) ? `${Math.round(item.components.versatility.value * 100)}%` : "—"],
      ["Value", (item) => item.components.value?.active ? `${Math.round(item.components.value.value * 100)}%` : "—"],
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

  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || !root.contains(button)) return;
    const kind = button.dataset.kind;
    if (kind === "answer") {
      flow = setAnswer(flow, button.dataset.question, button.dataset.value);
      errors = [];
      render();
      return;
    }
    if (kind === "categories" || kind === "colours" || kind === "materials" || kind === "avoid" || kind === "seasons" || kind === "brands") {
      flow = toggleConstraint(flow, kind, button.dataset.value);
      errors = [];
      render();
      return;
    }
    if (kind === "budgetType") {
      flow = patchConstraints(flow, { budgetType: button.dataset.value });
      render();
      return;
    }
    if (kind === "preset") {
      flow = patchConstraints(flow, { maxBudget: button.dataset.value });
      render();
      return;
    }
    if (kind === "edit") {
      flow = goToStep(flow, Number(button.dataset.step));
      errors = [];
      render();
      return;
    }
    if (kind === "back") {
      flow = goBack(flow);
      errors = [];
      render();
      return;
    }
    if (kind === "reset") {
      flow = resetFlow();
      errors = [];
      importMessage = "";
      lastResult = null;
      selectedIds = [];
      setProducts(builtinProducts);
      resultsEl.replaceChildren();
      summaryEl.textContent = "";
      showPreferences();
      return;
    }
    if (kind === "next") {
      if (flow.step >= 8) {
        runSearch();
        return;
      }
      const outcome = goNext(flow);
      if (!outcome.ok) {
        errors = outcome.errors;
        render();
        return;
      }
      flow = outcome.state;
      errors = [];
      render();
    }
  });

  root.addEventListener("change", (event) => {
    const target = event.target;
    if (target.id === "size-input") flow = patchConstraints(flow, { size: target.value });
    if (target.id === "fit-input") flow = patchConstraints(flow, { fit: target.value });
    if (target.id === "dress-input") flow = patchConstraints(flow, { dressCode: target.value });
    if (target.id === "stock-input") flow = patchConstraints(flow, { requireInStock: target.checked });
    if (target.id === "catalogue-file") {
      const file = target.files?.[0];
      if (!file) return;
      file.text().then((text) => {
        const parsed = file.name.toLowerCase().endsWith(".csv") ? parseCsvCatalogue(text) : parseJsonCatalogue(text);
        if (parsed.products.length === 0) {
          importMessage = parsed.errors.join(" ") || "Import failed. The built-in catalogue is still in use.";
        } else {
          setProducts(parsed.products);
          const problems = [...parsed.errors, ...parsed.warnings];
          importMessage = `Imported ${parsed.products.length} rows for this session only.${problems.length ? ` ${problems.join(" ")}` : ""}`;
        }
        render();
      });
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target.id === "budget-input") {
      flow = patchConstraints(flow, { maxBudget: event.target.value });
    }
  });

  root.addEventListener("toggle", (event) => {
    if (event.target.id === "more-constraints") {
      flow = patchConstraints(flow, { detailsOpen: event.target.open });
    }
  }, true);

  document.querySelector("#edit-preferences").addEventListener("click", () => {
    flow = goToStep(flow, 8);
    showPreferences();
  });
  document.querySelector("#back-to-results").addEventListener("click", () => {
    if (lastResult) renderResults(lastResult);
    showResults();
  });
  compareButton.addEventListener("click", renderComparison);

  render();
  return { showPreferences };
}

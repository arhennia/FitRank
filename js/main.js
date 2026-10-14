import { products as builtinProducts } from "./catalogue.js";
import { evaluateSuite } from "./evaluate.js";
import { CLASS_NAMES } from "./retrievalProtocol.js";
import { mountShopper } from "./shopping/page.js";

let currentProducts = builtinProducts;

mountShopper({
  getProducts: () => currentProducts,
  setProducts: (products) => {
    currentProducts = products;
  },
});

const evaluationEl = document.querySelector("#evaluation");
const retrievalForm = document.querySelector("#retrieval-form");
const retrievalStatus = document.querySelector("#retrieval-status");
const retrievalResults = document.querySelector("#retrieval-results");
const experimentReport = document.querySelector("#experiment-report");
const exampleSelect = document.querySelector("#retrieval-example");
const categorySelect = document.querySelector("#retrieval-category");

function addCell(row, tag, text) {
  const cell = document.createElement(tag);
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function formatMetric(value) {
  return typeof value === "number" ? value.toFixed(3) : "—";
}

function formatRuntime(value) {
  return typeof value === "number" ? value.toFixed(1) : "—";
}

function renderLines(lines) {
  const list = document.createElement("ul");
  for (const line of lines) {
    const item = document.createElement("li");
    item.textContent = line;
    list.append(item);
  }
  return list;
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
  const removedText = removed ? ` Category removed ${removed.wrongCategory}.` : "";
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

document.querySelector("#run-evaluation").addEventListener("click", renderEvaluation);

function applyRoute() {
  const route = location.hash === "#lab" ? "lab" : "shop";
  document.documentElement.dataset.route = route;
  for (const link of document.querySelectorAll("[data-nav]")) {
    if (link.dataset.nav === route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

window.addEventListener("hashchange", applyRoute);
applyRoute();

import { generateCandidates, emptyResultMessage } from "../candidates.js";
import {
  AVOIDS,
  DRESS_CODES,
  FITS,
  MATERIAL_SEASON,
  SILHOUETTE_FIT,
  shopCategoryById,
} from "./vocabulary.js";

function tokens(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function productColours(product) {
  if (Array.isArray(product.colours) && product.colours.length > 0) return tokens(product.colours);
  if (typeof product.colour === "string" && product.colour.trim()) return [product.colour.trim().toLowerCase()];
  return [];
}

export function matchesShopCategory(product, selected) {
  if (!selected || selected.length === 0) return true;
  const fine = typeof product.shopCategory === "string" ? product.shopCategory.trim() : "";
  if (fine) return selected.includes(fine);
  return selected.some((id) => {
    const spec = shopCategoryById(id);
    return Boolean(spec?.acceptCoarse && spec.catalogueCategories.includes(product.category));
  });
}

export function resolveFit(product) {
  const named = typeof product.fit === "string" ? product.fit.trim().toLowerCase() : "";
  if (FITS.some((fit) => fit.id === named)) return { id: named, source: "fit" };
  const silhouette = typeof product.silhouette === "string" ? product.silhouette.trim().toLowerCase() : "";
  const mapped = SILHOUETTE_FIT[silhouette];
  if (mapped) return { id: mapped, source: "silhouette" };
  return null;
}

export function resolveSeasons(product) {
  if (Array.isArray(product.seasons) && product.seasons.length > 0) {
    return { ids: tokens(product.seasons), source: "season" };
  }
  if (typeof product.season === "string" && product.season.trim()) {
    return { ids: [product.season.trim().toLowerCase()], source: "season" };
  }
  const material = typeof product.material === "string" ? product.material.trim().toLowerCase() : "";
  const hint = MATERIAL_SEASON[material];
  if (hint) return { ids: [hint], source: "material" };
  return { ids: [], source: null };
}

function missesColour(product, colours) {
  if (colours.length === 0) return false;
  const owned = productColours(product);
  if (owned.length === 0) return true;
  return !owned.some((colour) => colours.includes(colour));
}

function missesMaterial(product, materials) {
  if (materials.length === 0) return false;
  const material = typeof product.material === "string" ? product.material.trim().toLowerCase() : "";
  if (!material) return true;
  return !materials.includes(material);
}

function missesFit(product, fit) {
  if (!fit) return false;
  const resolved = resolveFit(product);
  if (!resolved) return true;
  return resolved.id !== fit;
}

function missesBrand(product, brands) {
  if (brands.length === 0) return false;
  const brand = typeof product.brand === "string" ? product.brand.trim().toLowerCase() : "";
  if (!brand) return true;
  return !brands.some((wanted) => wanted.trim().toLowerCase() === brand);
}

function missesSeason(product, seasons) {
  if (seasons.length === 0) return false;
  const resolved = resolveSeasons(product);
  if (resolved.ids.length === 0) return true;
  return !resolved.ids.some((season) => seasons.includes(season));
}

function missesDressCode(product, dressCode) {
  if (!dressCode) return false;
  const spec = DRESS_CODES.find((item) => item.id === dressCode);
  if (!spec) return true;
  const formality = Number(product.formalityRating);
  if (!Number.isFinite(formality)) return true;
  return formality < spec.min || formality > spec.max;
}

function hitsAvoid(product, avoidId) {
  if (avoidId === "synthetic") {
    const material = typeof product.material === "string" ? product.material.trim().toLowerCase() : "";
    if (!material) return true;
    return material === "synthetic";
  }
  if (avoidId === "bold-styling") {
    const styles = tokens(product.styles);
    if (styles.length === 0) return true;
    return styles.includes("bold") || styles.includes("artistic");
  }
  if (avoidId === "evening-only") {
    const occasions = tokens(product.occasions);
    if (occasions.length === 0) return true;
    return occasions.every((occasion) => occasion === "evening" || occasion === "special");
  }
  return true;
}

const EXTRA_GATES = [
  { id: "category", label: "category", active: (constraints) => constraints.categories.length > 0, fail: (product, constraints) => !matchesShopCategory(product, constraints.categories) },
  { id: "colour", label: "colour", active: (constraints) => constraints.colours.length > 0, fail: (product, constraints) => missesColour(product, constraints.colours) },
  { id: "material", label: "material", active: (constraints) => constraints.materials.length > 0, fail: (product, constraints) => missesMaterial(product, constraints.materials) },
  { id: "fit", label: "fit", active: (constraints) => Boolean(constraints.fit), fail: (product, constraints) => missesFit(product, constraints.fit) },
  { id: "brand", label: "brand", active: (constraints) => constraints.brands.length > 0, fail: (product, constraints) => missesBrand(product, constraints.brands) },
  { id: "season", label: "season", active: (constraints) => constraints.seasons.length > 0, fail: (product, constraints) => missesSeason(product, constraints.seasons) },
  { id: "dressCode", label: "dress code", active: (constraints) => Boolean(constraints.dressCode), fail: (product, constraints) => missesDressCode(product, constraints.dressCode) },
  { id: "avoid", label: "a feature you asked to avoid", active: (constraints) => constraints.avoid.length > 0, fail: (product, constraints) => constraints.avoid.some((id) => hitsAvoid(product, id)) },
];

export function constraintNotes(product, constraints) {
  const notes = [];
  if (constraints.fit) {
    const fit = resolveFit(product);
    if (fit?.source === "silhouette") {
      notes.push(`Fit matches the silhouette label “${product.silhouette}”. The catalogue has no separate fit measurement.`);
    } else if (fit?.source === "fit") {
      notes.push(`Recorded fit is ${fit.id}.`);
    }
  }
  if (constraints.seasons.length > 0) {
    const season = resolveSeasons(product);
    if (season.source === "material") {
      notes.push(`Season uses a material hint (${product.material} stands in for ${season.ids[0]} weather). It is not a weather test.`);
    }
  }
  if (constraints.avoid.length > 0) {
    const names = constraints.avoid
      .map((id) => AVOIDS.find((item) => item.id === id)?.label || id);
    notes.push(`Checked against: ${names.join(", ")}. Missing fields were not treated as a pass.`);
  }
  return notes;
}

/**
 * Hard gates that the questionnaire adds on top of budget, stock, and size.
 * A missing attribute fails the gate. It is not treated as a match.
 */
export function applyShoppingGates(products, constraints) {
  let pool = [...products];
  const removed = {};
  let limiting = null;
  for (const gate of EXTRA_GATES) {
    removed[gate.id] = 0;
    if (!gate.active(constraints)) continue;
    const next = [];
    for (const product of pool) {
      if (gate.fail(product, constraints)) removed[gate.id] += 1;
      else next.push(product);
    }
    if (!limiting && removed[gate.id] > 0 && next.length === 0) limiting = gate.id;
    pool = next;
  }
  return { candidates: pool, removed, limiting };
}

export function shoppingGateLabel(id) {
  return EXTRA_GATES.find((gate) => gate.id === id)?.label || id;
}

export function emptyShoppingMessage(candidateReport, extra) {
  if (candidateReport.eligible === 0) return emptyResultMessage(candidateReport);
  const parts = EXTRA_GATES
    .filter((gate) => extra.removed[gate.id] > 0)
    .map((gate) => `${extra.removed[gate.id]} removed by ${gate.label}`);
  const limiting = extra.limiting ? ` The limiting constraint is ${shoppingGateLabel(extra.limiting)}.` : "";
  const detail = parts.length ? ` ${parts.join("; ")}.` : "";
  return `No products match these constraints.${limiting}${detail}`;
}

export function baseCandidatePrefs(constraints) {
  return {
    maxBudget: constraints.maxBudget,
    categories: [],
    requireInStock: constraints.requireInStock,
    size: constraints.size || null,
  };
}

export function scanBaseCandidates(products, constraints) {
  return generateCandidates(products, baseCandidatePrefs(constraints));
}

/**
 * Query-time search over the cached Fashion-MNIST index.
 * Loaded only when /api/retrieve is called. Missing cache or model files return an error.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { adaptFashionImage } from "../js/adapter.js";
import { SCORE_DEFINITION, RETRIEVAL_K } from "../js/retrievalProtocol.js";
import { retrieveCatalogue } from "../js/retrieve.js";
import { embedImageFile, embedTexts } from "../prototypes/moodboard/clipRuntime.mjs";
import { imageEmbeddingPath, manifestPath } from "./paths.mjs";

let indexPromise = null;

function loadIndex() {
  indexPromise ??= (async () => {
    if (!existsSync(manifestPath) || !existsSync(imageEmbeddingPath)) {
      throw new Error(
        `Retrieval embeddings are not cached. Expected ${imageEmbeddingPath}. Run npm run prepare-mnist and npm run embed-retrieval.`,
      );
    }
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const embeddings = JSON.parse(await readFile(imageEmbeddingPath, "utf8"));
    const vectors = new Map();
    embeddings.ids.forEach((id, index) => vectors.set(id, embeddings.vectors[index]));
    const byId = new Map();
    const products = [];
    for (const record of manifest.images) {
      const product = adaptFashionImage(record);
      byId.set(product.id, product);
      if (product.split === "index") products.push(product);
    }
    return { products, vectors, byId };
  })();
  return indexPromise;
}

function numericOrAbsent(value) {
  if (value == null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export async function searchCatalogue(body = {}) {
  let index;
  try {
    index = await loadIndex();
  } catch (error) {
    return { ok: false, unavailable: true, errors: [error.message], products: [] };
  }

  const request = { ranking: body.ranking === "diverse" ? "diverse" : "relevance" };
  if (typeof body.category === "string" && body.category.trim()) request.categories = [body.category.trim()];
  const budget = numericOrAbsent(body.maxBudget);
  if (budget != null) request.maxBudget = budget;
  if (body.requireInStock === true) request.requireInStock = true;
  if (typeof body.size === "string" && body.size.trim()) request.size = body.size;

  try {
    if (typeof body.exampleId === "string" && body.exampleId.trim()) {
      const example = index.byId.get(body.exampleId.trim());
      if (!example) return { ok: false, errors: ["That example image is not in the Fashion-MNIST split."], products: [] };
      if (example.split === "index") {
        return { ok: false, errors: ["Index images are candidates, not queries."], products: [] };
      }
      const vector = index.vectors.get(example.id);
      if (!vector) {
        return {
          ok: false,
          unavailable: true,
          errors: [`No cached embedding for ${example.id}.`],
          products: [],
        };
      }
      request.imageVector = vector;
    } else if (typeof body.imageBase64 === "string" && body.imageBase64.trim()) {
      const payload = body.imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
      const bytes = Buffer.from(payload, "base64");
      if (bytes.length === 0) return { ok: false, errors: ["The inspiration image was empty."], products: [] };
      const directory = await mkdtemp(join(tmpdir(), "fitrank-"));
      const file = join(directory, "query.png");
      try {
        await writeFile(file, bytes);
        request.imageVector = await embedImageFile(file);
      } catch (error) {
        return {
          ok: false,
          unavailable: true,
          errors: [`Image embedding failed: ${error.message}`],
          products: [],
        };
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }

    if (typeof body.text === "string" && body.text.trim()) {
      try {
        request.textVector = (await embedTexts([body.text.trim()]))[0];
      } catch (error) {
        return {
          ok: false,
          unavailable: true,
          errors: [`Text embedding failed: ${error.message}`],
          products: [],
        };
      }
    }
  } catch (error) {
    return { ok: false, unavailable: true, errors: [error.message], products: [] };
  }

  const result = retrieveCatalogue(index.products, request, index.vectors);
  if (!result.ok) return { ok: false, errors: result.errors, products: [], constraintReport: result.constraintReport };
  return {
    ok: true,
    errors: [],
    disclaimer: "Fashion-MNIST class search. These images are not shop listings, and class match is not a real-world recommendation.",
    scoreDefinition: SCORE_DEFINITION,
    activeSignals: result.activeSignals,
    ranking: result.ranking,
    constraintReport: result.constraintReport,
    products: result.products.slice(0, RETRIEVAL_K).map((row) => ({
      id: row.id,
      name: row.product.name,
      category: row.product.category,
      score: row.score,
      image: `/${row.product.image}`,
      signals: row.signals,
      reasons: row.reasons,
    })),
  };
}

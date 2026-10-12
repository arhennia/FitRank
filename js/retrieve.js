import { applyHardConstraints } from "./constraints.js";
import { explainRetrieval, orderCandidates, scoreCandidates } from "./hybridRank.js";
import { RETRIEVAL_K } from "./retrievalProtocol.js";

/**
 * Constraints, then hybrid score, then optional embedding diversity.
 * Returns the full ranked list. Callers slice to K for display.
 */
export function retrieveCatalogue(products, request, imageVectors) {
  const gated = applyHardConstraints(products, request || {});
  if (!gated.ok) {
    return {
      ok: false,
      errors: gated.errors,
      products: [],
      constraintReport: gated.report,
    };
  }
  const scored = scoreCandidates(gated.candidates, request || {}, imageVectors);
  if (!scored.ok) {
    return {
      ok: false,
      errors: [scored.error],
      products: [],
      constraintReport: gated.report,
      omitted: scored.omitted ?? 0,
    };
  }
  const ordered = orderCandidates(scored.rows, imageVectors, request?.ranking);
  const productsOut = ordered.rows.map((row) => ({
    ...row,
    reasons: explainRetrieval(row, gated.report),
  }));
  return {
    ok: true,
    errors: [],
    products: productsOut,
    constraintReport: {
      ...gated.report,
      omittedMissingEmbedding: scored.omitted,
      diversityPoolExcluded: ordered.diversityPoolExcluded,
    },
    activeSignals: scored.activeSignals,
    ranking: request?.ranking === "diverse" ? "diverse" : "relevance",
    k: RETRIEVAL_K,
  };
}

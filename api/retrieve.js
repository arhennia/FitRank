/**
 * Hosted image search. The CLIP weights are not part of this deployment.
 * A missing model returns JSON instead of crashing the function.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(400).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, errors: ["POST /api/retrieve only"] }));
    return;
  }
  try {
    const specifier = "../experiments/search.mjs";
    const { searchCatalogue } = await import(specifier);
    const result = await searchCatalogue(req.body && typeof req.body === "object" ? req.body : {});
    const status = result.unavailable ? 503 : 200;
    res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(result));
  } catch (error) {
    res.status(503).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      ok: false,
      unavailable: true,
      errors: ["Image search on this host needs the local CLIP cache. The shopper questionnaire does not."],
      detail: error.message,
      products: [],
    }));
  }
}

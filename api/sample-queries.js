import { handleSearch } from "../js/api/searchRoute.js";

export default async function handler(req, res) {
  try {
    const result = await handleSearch("GET", "/api/sample-queries", null);
    res.status(result.status).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(result.body));
  } catch (error) {
    res.status(400).setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, errors: [error.message] }));
  }
}

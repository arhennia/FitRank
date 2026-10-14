import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { handleSearch, parseSearchBody } from "./js/api/searchRoute.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT) || 5173;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function fileForRequest(urlPath) {
  const requested = decodeURIComponent(urlPath.split("?")[0]);
  const relativePath = requested === "/" ? "index.html" : requested.replace(/^[/\\]+/, "");
  const filePath = path.resolve(root, relativePath);
  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return filePath;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_500_000) {
        reject(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createApp() {
  return http.createServer(async (req, res) => {
  const urlPath = (req.url || "/").split("?")[0];
  if (urlPath === "/api/search" || urlPath === "/api/sample-queries") {
    try {
      let body = null;
      if (req.method === "POST") {
        const parsed = parseSearchBody(await readBody(req));
        if (parsed.error) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: false, errors: [parsed.error] }));
          return;
        }
        body = parsed.body;
      }
      const result = await handleSearch(req.method || "GET", urlPath, body);
      res.writeHead(result.status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result.body));
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, errors: [error.message] }));
    }
    return;
  }
  if (req.method === "POST" && urlPath === "/api/retrieve") {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const { searchCatalogue } = await import("./experiments/search.mjs");
      const result = await searchCatalogue(body);
      const status = result.unavailable ? 503 : 200;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, errors: [error.message] }));
    }
    return;
  }

  const filePath = fileForRequest(req.url || "/");
  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const type = types[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApp().listen(port, "127.0.0.1", () => {
    console.log(`FitRank running at http://127.0.0.1:${port}`);
  });
}

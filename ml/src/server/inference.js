/**
 * CLIP sidecar. Listens on 127.0.0.1:8787.
 * The model loads on the first embed call, not on /health.
 * The root server must not import this file.
 */
import http from "node:http";
import { pathToFileURL } from "node:url";

import { applyVariant } from "../embed/preprocess.mjs";

const PORT = 8787;
const HOST = "127.0.0.1";
let modelLoaded = false;

function json(status, body) {
  return { status, body };
}

function decodeGray(dataB64) {
  if (typeof dataB64 !== "string" || !dataB64.trim()) return { error: "image dataB64 is required" };
  const payload = dataB64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  let bytes;
  try {
    bytes = Buffer.from(payload, "base64");
  } catch (error) {
    return { error: error.message };
  }
  if (bytes.length !== 784) return { error: "gray28 image must be 784 bytes" };
  return { bytes };
}

export async function handleInference(method, urlPath, body) {
  if (method === "GET" && urlPath === "/health") {
    return json(200, { ok: true, modelLoaded, host: HOST, port: PORT });
  }
  if (method !== "POST") return json(400, { ok: false, errors: ["Only GET /health and POST /embed are accepted"] });
  if (urlPath !== "/embed/text" && urlPath !== "/embed/image") {
    return json(400, { ok: false, errors: ["Unknown embed route"] });
  }
  const payload = body && typeof body === "object" ? body : null;
  if (!payload) return json(400, { ok: false, errors: ["JSON object body is required"] });

  try {
    if (urlPath === "/embed/text") {
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      if (!text) return json(400, { ok: false, errors: ["text is required"] });
      const { embedTextBatch } = await import("../embed/clipRuntime.mjs");
      modelLoaded = true;
      const vector = (await embedTextBatch([text]))[0];
      return json(200, { ok: true, dim: vector.length, vector });
    }
    const decoded = decodeGray(payload.dataB64);
    if (decoded.error) return json(400, { ok: false, errors: [decoded.error] });
    const variant = { polarity: "inverted", pad: 0, padValue: 0 };
    const image = applyVariant(decoded.bytes, 28, 28, variant);
    const { embedRgbImages } = await import("../embed/clipRuntime.mjs");
    modelLoaded = true;
    const vector = (await embedRgbImages([image]))[0];
    return json(200, { ok: true, dim: vector.length, vector, preprocess: "inverted" });
  } catch (error) {
    return json(503, { ok: false, errors: [error.message] });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
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

export function createSidecar() {
  return http.createServer(async (req, res) => {
    const urlPath = (req.url || "/").split("?")[0];
    let body = null;
    if (req.method === "POST") {
      try {
        const raw = await readBody(req);
        body = raw ? JSON.parse(raw) : {};
      } catch (error) {
        const message = error instanceof SyntaxError ? "Request body is not JSON" : error.message;
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, errors: [message] }));
        return;
      }
    }
    const result = await handleInference(req.method || "GET", urlPath, body);
    res.writeHead(result.status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(result.body));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createSidecar().listen(PORT, HOST, () => {
    console.log(`FitRank sidecar at http://${HOST}:${PORT}`);
  });
}

import { createHash } from "node:crypto";

/** Fields that define the cache directory. createdAt and gitCommit are omitted. */
export function keyMaterial(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    modelId: manifest.modelId,
    modelFiles: manifest.modelFiles,
    transformersVersion: manifest.transformersVersion,
    dtype: manifest.dtype,
    preprocessConfigHash: manifest.preprocessConfigHash,
    datasetHash: manifest.datasetHash,
    splitHash: manifest.splitHash,
    idsHash: manifest.idsHash,
    dim: manifest.dim,
    count: manifest.count,
    normChecked: manifest.normChecked,
  };
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function sha256Json(value) {
  return sha256Text(JSON.stringify(value));
}

export function cacheKey(manifest) {
  return sha256Json(keyMaterial(manifest));
}

export function idsHash(ids) {
  return sha256Text(ids.join("\n"));
}

export function normalizeText(text) {
  return String(text ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Cache id for one text string. The template id is part of the hash. */
export function textCacheId(text, templateId) {
  return sha256Text(`${normalizeText(text)}\n${templateId}`);
}

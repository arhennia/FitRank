/**
 * Float32 embedding cache. emb.f32 is row-major, and row i matches ids.json[i].
 * Writes go to a temporary directory and are renamed into place.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { cacheKey } from "./manifest.mjs";

const NORM_TOLERANCE = 1e-4;

export function writeCache(dir, { manifest, ids, vectors }) {
  if (ids.length !== vectors.length) throw new Error("Id count does not match vector count");
  if (manifest.count !== ids.length) throw new Error("Manifest count does not match id count");
  const dim = manifest.dim;
  const floats = new Float32Array(ids.length * dim);
  for (let row = 0; row < vectors.length; row += 1) {
    const vector = vectors[row];
    if (!vector || vector.length !== dim) throw new Error(`Vector ${row} does not have dimension ${dim}`);
    floats.set(vector, row * dim);
  }
  const parent = dirname(dir);
  mkdirSync(parent, { recursive: true });
  const tmp = `${dir}.tmp`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp);
  const body = { ...manifest, cacheKey: cacheKey(manifest) };
  writeFileSync(join(tmp, "manifest.json"), `${JSON.stringify(body, null, 2)}\n`);
  writeFileSync(join(tmp, "ids.json"), `${JSON.stringify(ids)}\n`);
  writeFileSync(join(tmp, "emb.f32"), Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength));
  rmSync(dir, { recursive: true, force: true });
  renameSync(tmp, dir);
  return dir;
}

export function readVectors(dir, count, dim) {
  const bytes = readFileSync(join(dir, "emb.f32"));
  const expected = count * dim * 4;
  if (bytes.length !== expected) {
    throw new Error(`emb.f32 length ${bytes.length} does not match ${expected}`);
  }
  const copy = Uint8Array.from(bytes);
  return new Float32Array(copy.buffer);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function vectorNorm(floats, offset, dim) {
  let square = 0;
  for (let index = 0; index < dim; index += 1) {
    const value = floats[offset + index];
    if (!Number.isFinite(value)) return null;
    square += value * value;
  }
  return Math.sqrt(square);
}

export function validateCache(dir, expected) {
  const reasons = [];
  if (!existsSync(dir)) return { valid: false, reasons: ["missing cache directory"] };
  let manifest;
  let ids;
  try {
    manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
    ids = JSON.parse(readFileSync(join(dir, "ids.json"), "utf8"));
  } catch (error) {
    return { valid: false, reasons: [`unreadable cache: ${error.message}`] };
  }
  const fields = [
    "schemaVersion",
    "modelId",
    "transformersVersion",
    "dtype",
    "preprocessConfigHash",
    "datasetHash",
    "splitHash",
    "idsHash",
    "dim",
    "count",
    "normChecked",
  ];
  for (const field of fields) {
    if (!sameJson(manifest[field], expected[field])) reasons.push(`${field} does not match`);
  }
  if (!sameJson(manifest.modelFiles, expected.modelFiles)) reasons.push("model files do not match");
  if (manifest.cacheKey !== cacheKey(expected)) reasons.push("cache key does not match");
  if (!Array.isArray(ids) || !sameJson(ids, expected.ids)) reasons.push("id order does not match");
  const count = expected.count;
  const dim = expected.dim;
  const embPath = join(dir, "emb.f32");
  if (!existsSync(embPath)) {
    reasons.push("emb.f32 is missing");
    return { valid: false, reasons };
  }
  const bytes = readFileSync(embPath);
  const expectedBytes = count * dim * 4;
  if (bytes.length !== expectedBytes) {
    reasons.push(`emb.f32 length ${bytes.length} does not match ${expectedBytes}`);
    return { valid: false, reasons };
  }
  const copy = Uint8Array.from(bytes);
  const floats = new Float32Array(copy.buffer);
  for (let row = 0; row < count; row += 1) {
    const norm = vectorNorm(floats, row * dim, dim);
    if (norm === null || Math.abs(norm - 1) > NORM_TOLERANCE) {
      reasons.push(`row ${row} norm ${norm} is outside 1 ± ${NORM_TOLERANCE}`);
      break;
    }
  }
  return { valid: reasons.length === 0, reasons };
}

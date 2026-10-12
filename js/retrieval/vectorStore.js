/**
 * Load a T2 embedding cache and check it before any score is computed.
 * emb.f32 is row-major Float32. Row i is ids[i].
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const NORM_TOLERANCE = 1e-4;

function rowNorm(floats, offset, dim) {
  let square = 0;
  for (let index = 0; index < dim; index += 1) {
    const value = floats[offset + index];
    if (!Number.isFinite(value)) return null;
    square += value * value;
  }
  return Math.sqrt(square);
}

function fail(reasons) {
  const error = new Error(reasons.join("; "));
  error.reasons = reasons;
  throw error;
}

/**
 * Validate ids and a Float32 matrix already in memory.
 * Returns a store whose row(i) view aliases the buffer. Callers must not write into it.
 */
export function openVectorStore({ manifest, ids, floats }) {
  const reasons = [];
  const dim = manifest?.dim;
  const count = manifest?.count;
  if (!Number.isInteger(dim) || dim <= 0) reasons.push("dim must be a positive integer");
  if (!Number.isInteger(count) || count < 0) reasons.push("count must be a non-negative integer");
  if (!Array.isArray(ids)) reasons.push("ids must be an array");
  if (!(floats instanceof Float32Array)) reasons.push("floats must be a Float32Array");
  if (reasons.length > 0) fail(reasons);
  if (ids.length !== count) reasons.push(`id count ${ids.length} does not match manifest count ${count}`);
  if (floats.length !== count * dim) {
    reasons.push(`float length ${floats.length} does not match ${count * dim}`);
  }
  const seen = new Set();
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (typeof id !== "string" || id === "") reasons.push(`id ${index} is empty`);
    else if (seen.has(id)) reasons.push(`duplicate id ${id}`);
    else seen.add(id);
  }
  if (reasons.length > 0) fail(reasons);
  if (manifest.normChecked === true) {
    for (let row = 0; row < count; row += 1) {
      const norm = rowNorm(floats, row * dim, dim);
      if (norm === null || Math.abs(norm - 1) > NORM_TOLERANCE) {
        reasons.push(`row ${row} norm ${norm} is outside 1 ± ${NORM_TOLERANCE}`);
        break;
      }
    }
  } else {
    for (let index = 0; index < floats.length; index += 1) {
      if (!Number.isFinite(floats[index])) {
        reasons.push(`float ${index} is not finite`);
        break;
      }
    }
  }
  if (reasons.length > 0) fail(reasons);

  const byId = new Map();
  for (let index = 0; index < ids.length; index += 1) byId.set(ids[index], index);

  return {
    manifest,
    ids,
    dim,
    count,
    floats,
    indexOf(id) {
      return byId.has(id) ? byId.get(id) : -1;
    },
    row(index) {
      if (!Number.isInteger(index) || index < 0 || index >= count) return null;
      return floats.subarray(index * dim, (index + 1) * dim);
    },
    vector(id) {
      const index = byId.get(id);
      if (index == null) return null;
      return floats.subarray(index * dim, (index + 1) * dim);
    },
  };
}

function cachePath(dir, name) {
  const root = dir instanceof URL ? fileURLToPath(dir) : dir;
  return join(root, name);
}

/** Read manifest.json, ids.json, and emb.f32. Throws when the cache is unusable. */
export function loadVectorStore(dir) {
  let manifest;
  let ids;
  try {
    manifest = JSON.parse(readFileSync(cachePath(dir, "manifest.json"), "utf8"));
    ids = JSON.parse(readFileSync(cachePath(dir, "ids.json"), "utf8"));
  } catch (error) {
    fail([`unreadable cache: ${error.message}`]);
  }
  const dim = manifest?.dim;
  const count = manifest?.count;
  if (!Number.isInteger(dim) || dim <= 0 || !Number.isInteger(count) || count < 0) {
    fail(["manifest dim and count are required before the buffer is read"]);
  }
  const bytes = readFileSync(cachePath(dir, "emb.f32"));
  const expected = count * dim * 4;
  if (bytes.length !== expected) {
    fail([`emb.f32 length ${bytes.length} does not match ${expected}`]);
  }
  const copy = Uint8Array.from(bytes);
  const floats = new Float32Array(copy.buffer);
  return openVectorStore({ manifest, ids, floats });
}

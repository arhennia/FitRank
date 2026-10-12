/**
 * Fashion-MNIST IDX reader. Gzip is decoded with Node's zlib. No extra libraries.
 */
import { gunzipSync } from "node:zlib";

const IMAGE_MAGIC = 2051;
const LABEL_MAGIC = 2049;

export function gunzipOrThrow(bytes) {
  if (!bytes || bytes.length < 2) throw new Error("Truncated gzip: file is too short to be a gzip stream");
  try {
    return gunzipSync(bytes);
  } catch (error) {
    throw new Error(`Gzip decode failed: ${error.message}`);
  }
}

export function readIdxImages(buffer) {
  if (!buffer || buffer.length < 16) throw new Error("Truncated IDX image file: header is incomplete");
  const magic = buffer.readInt32BE(0);
  if (magic !== IMAGE_MAGIC) throw new Error(`Unexpected image magic ${magic}`);
  const count = buffer.readInt32BE(4);
  const rows = buffer.readInt32BE(8);
  const cols = buffer.readInt32BE(12);
  if (count < 0 || rows <= 0 || cols <= 0) throw new Error("IDX image header has a non-positive dimension");
  const expected = count * rows * cols;
  const pixels = buffer.subarray(16);
  if (pixels.length < expected) {
    throw new Error(`Truncated IDX image file: expected ${expected} pixels, received ${pixels.length}`);
  }
  if (pixels.length !== expected) {
    throw new Error(`IDX image payload length ${pixels.length} does not match the header ${expected}`);
  }
  return { count, rows, cols, pixels };
}

export function readIdxLabels(buffer) {
  if (!buffer || buffer.length < 8) throw new Error("Truncated IDX label file: header is incomplete");
  const magic = buffer.readInt32BE(0);
  if (magic !== LABEL_MAGIC) throw new Error(`Unexpected label magic ${magic}`);
  const count = buffer.readInt32BE(4);
  if (count < 0) throw new Error("IDX label header has a negative count");
  if (buffer.length < 8 + count) {
    throw new Error(`Truncated IDX label file: expected ${count} labels, received ${buffer.length - 8}`);
  }
  if (buffer.length !== 8 + count) {
    throw new Error(`IDX label payload length ${buffer.length - 8} does not match the header ${count}`);
  }
  return buffer.subarray(8, 8 + count);
}

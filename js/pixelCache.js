import { PIXEL_DIM } from "./retrievalProtocol.js";
import { l2Normalize } from "./vector.js";

const MAGIC = "FRPX";
const HEADER_BYTES = 12;

export function encodePixelCache(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Pixel cache needs at least one image");
  const header = Buffer.alloc(HEADER_BYTES);
  header.write(MAGIC, 0, "ascii");
  header.writeUInt32LE(rows.length, 4);
  header.writeUInt32LE(PIXEL_DIM, 8);
  const body = Buffer.alloc(rows.length * PIXEL_DIM);
  rows.forEach((pixels, rowIndex) => {
    if (!pixels || pixels.length !== PIXEL_DIM) throw new Error(`Image ${rowIndex} does not have ${PIXEL_DIM} pixels`);
    Buffer.from(pixels).copy(body, rowIndex * PIXEL_DIM);
  });
  return Buffer.concat([header, body]);
}

export function decodePixelCache(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (bytes.length < HEADER_BYTES) throw new Error("Pixel cache is too short");
  const magic = bytes.toString("ascii", 0, 4);
  if (magic !== MAGIC) throw new Error(`Unexpected pixel cache magic ${magic}`);
  const count = bytes.readUInt32LE(4);
  const dimension = bytes.readUInt32LE(8);
  if (dimension !== PIXEL_DIM) throw new Error(`Unexpected pixel dimension ${dimension}`);
  const expected = HEADER_BYTES + count * PIXEL_DIM;
  if (bytes.length !== expected) throw new Error("Pixel cache length does not match the header");
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const start = HEADER_BYTES + index * PIXEL_DIM;
    rows.push(Uint8Array.from(bytes.subarray(start, start + PIXEL_DIM)));
  }
  return rows;
}

export function normalizePixels(pixels) {
  if (!pixels || pixels.length !== PIXEL_DIM) return null;
  return l2Normalize(Array.from(pixels, (value) => value));
}

/**
 * Turn a Fashion-MNIST grayscale image into RGB before the CLIP processor.
 * The processor still does its own resize, rescale, and normalization.
 */
export function applyVariant(gray, rows, cols, variant) {
  if (!gray || gray.length !== rows * cols) {
    throw new Error(`Expected ${rows * cols} grayscale pixels, received ${gray ? gray.length : 0}`);
  }
  if (variant.polarity !== "as-is" && variant.polarity !== "inverted") {
    throw new Error(`Unknown polarity ${variant.polarity}`);
  }
  const pad = variant.pad ?? 0;
  if (!Number.isInteger(pad) || pad < 0) throw new Error(`Pad must be a non-negative integer, received ${pad}`);
  const padValue = variant.padValue ?? 0;
  const width = cols + pad * 2;
  const height = rows + pad * 2;
  const rgb = new Uint8Array(width * height * 3);
  if (padValue !== 0) rgb.fill(padValue);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const source = gray[y * cols + x];
      const value = variant.polarity === "inverted" ? 255 - source : source;
      const offset = ((y + pad) * width + (x + pad)) * 3;
      rgb[offset] = value;
      rgb[offset + 1] = value;
      rgb[offset + 2] = value;
    }
  }
  return { data: rgb, width, height, channels: 3 };
}

export function activeVariant(config) {
  const variant = config.variants?.[config.active];
  if (!variant) throw new Error(`Preprocess config has no active variant ${config.active}`);
  return variant;
}

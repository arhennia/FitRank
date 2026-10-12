import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const manifestPath = join(repoRoot, "experiments", "fashion-mnist", "manifest.json");
export const examplesPath = join(repoRoot, "experiments", "fashion-mnist", "examples.json");
export const imageDir = join(repoRoot, "experiments", "fashion-mnist", "images");
export const downloadDir = join(repoRoot, "experiments", "fashion-mnist", "data");
export const cacheDir = join(repoRoot, "experiments", "cache");
export const pixelPath = join(cacheDir, "pixels.bin");
export const imageEmbeddingPath = join(cacheDir, "image-embeddings.json");
export const textEmbeddingPath = join(cacheDir, "text-embeddings.json");
export const embedMetaPath = join(cacheDir, "embed-meta.json");
export const resultsPath = join(repoRoot, "experiments", "retrieval-results.json");

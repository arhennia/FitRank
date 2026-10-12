/**
 * Offline CLIP loader. Weights are read from the existing moodboard cache.
 * Remote model download is disabled. A missing file is an error.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AutoTokenizer, CLIPTextModelWithProjection, RawImage, env, pipeline } from "@huggingface/transformers";

import { l2Normalize } from "../../../js/vector.js";
import { sha256Bytes } from "./manifest.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

export const MODEL_ID = "Xenova/clip-vit-base-patch32";
export const DTYPE = "q8";
export const EMBEDDING_DIM = 512;
export const MODEL_FILES = [
  "config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/vision_model_quantized.onnx",
  "onnx/text_model_quantized.onnx",
  "onnx/model_quantized.onnx",
];

env.cacheDir = join(repoRoot, "prototypes", "moodboard", ".cache");
env.allowLocalModels = true;
env.allowRemoteModels = false;

let visionPromise = null;
let textPromise = null;

export function transformersVersion() {
  const packagePath = join(repoRoot, "ml", "node_modules", "@huggingface", "transformers", "package.json");
  return JSON.parse(readFileSync(packagePath, "utf8")).version;
}

export function modelDirectory() {
  return join(env.cacheDir, "Xenova", "clip-vit-base-patch32");
}

export function modelFilesPresent() {
  return MODEL_FILES.every((file) => existsSync(join(modelDirectory(), file)));
}

export function describeModelFiles() {
  return MODEL_FILES.map((file) => {
    const path = join(modelDirectory(), file);
    if (!existsSync(path)) {
      throw new Error(`CLIP cache is missing ${file}. Remote download is disabled.`);
    }
    const bytes = readFileSync(path);
    return { path: file, bytes: bytes.length, sha256: sha256Bytes(bytes) };
  });
}

export function assertProcessorMatches(config) {
  const raw = JSON.parse(readFileSync(join(modelDirectory(), "preprocessor_config.json"), "utf8"));
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  if (!same(raw.image_mean, config.processor.imageMean) || !same(raw.image_std, config.processor.imageStd)) {
    throw new Error("Cached CLIP mean or std does not match ml/config/preprocess.v1.json");
  }
  if (raw.size?.shortest_edge !== config.processor.resizeShortestEdge || raw.resample !== 3) {
    throw new Error("Cached CLIP resize settings do not match ml/config/preprocess.v1.json");
  }
}

function rowsFrom(tensor, expectedCount) {
  const width = tensor.dims[tensor.dims.length - 1];
  const count = tensor.dims.length === 1 ? 1 : tensor.dims[0];
  if (count !== expectedCount || width !== EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding shape ${tensor.dims.join("x")}`);
  }
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const vector = l2Normalize(Array.from(tensor.data.subarray(index * width, (index + 1) * width)));
    if (!vector) throw new Error(`Embedding row ${index} has no magnitude`);
    rows.push(vector);
  }
  return rows;
}

async function loadVision() {
  visionPromise ??= (async () => {
    env.allowRemoteModels = false;
    const loaded = await pipeline("image-feature-extraction", MODEL_ID, {
      dtype: DTYPE,
      device: "cpu",
      local_files_only: true,
    });
    return loaded;
  })();
  return visionPromise;
}

async function loadText() {
  textPromise ??= (async () => {
    env.allowRemoteModels = false;
    const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { local_files_only: true });
    const model = await CLIPTextModelWithProjection.from_pretrained(MODEL_ID, {
      dtype: DTYPE,
      device: "cpu",
      local_files_only: true,
    });
    return { tokenizer, model };
  })();
  return textPromise;
}

export async function embedRgbImages(images) {
  const loaded = await loadVision();
  const raw = images.map((image) => new RawImage(image.data, image.width, image.height, image.channels));
  const output = raw.length === 1 ? await loaded(raw[0]) : await loaded(raw);
  return rowsFrom(output, images.length);
}

export async function embedTextBatch(texts) {
  const { tokenizer, model } = await loadText();
  const inputs = tokenizer(texts, { padding: true, truncation: true });
  const output = await model(inputs);
  const embeds = output.text_embeds;
  if (!embeds?.dims || !embeds.data) throw new Error("CLIP text tower did not return text_embeds");
  return rowsFrom(embeds, texts.length);
}

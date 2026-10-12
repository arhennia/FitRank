/**
 * Local CLIP loader. Uses the cached Xenova weights. The FitRank page does not import this file.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AutoTokenizer, CLIPTextModelWithProjection, env, pipeline } from "@huggingface/transformers";

import { l2Normalize } from "../../js/vector.js";
import { EMBEDDING_DIM, MODEL_ID } from "../../js/retrievalProtocol.js";

const root = dirname(fileURLToPath(import.meta.url));
env.cacheDir = join(root, ".cache");
env.allowLocalModels = true;

let visionPromise = null;
let textPromise = null;

function asVector(tensor) {
  const dims = tensor.dims;
  const data = tensor.data;
  if (!dims || !data) throw new Error("Embedding output has no tensor data");
  if (dims.length === 1) return Array.from(data);
  const width = dims[dims.length - 1];
  if (dims.length === 2) return Array.from(data.subarray(0, width));
  if (dims.length === 3) return Array.from(data.subarray(0, width));
  throw new Error(`Unexpected embedding shape ${dims.join("x")}`);
}

function vectorFrom(tensor) {
  const vector = l2Normalize(asVector(tensor));
  if (!vector || vector.length !== EMBEDDING_DIM) {
    throw new Error(`Expected a ${EMBEDDING_DIM}-d embedding, received ${vector ? vector.length : 0}`);
  }
  return vector;
}

export async function loadVision() {
  visionPromise ??= (async () => {
    env.allowRemoteModels = false;
    const started = performance.now();
    const loaded = await pipeline("image-feature-extraction", MODEL_ID, {
      dtype: "q8",
      device: "cpu",
      local_files_only: true,
    });
    return { loaded, dtype: "q8", loadMs: performance.now() - started, downloaded: false };
  })();
  return visionPromise;
}

async function loadTextOnce(allowRemote) {
  env.allowRemoteModels = allowRemote;
  const started = performance.now();
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, { local_files_only: !allowRemote });
  const model = await CLIPTextModelWithProjection.from_pretrained(MODEL_ID, {
    dtype: "q8",
    device: "cpu",
    local_files_only: !allowRemote,
  });
  return { tokenizer, model, dtype: "q8", loadMs: performance.now() - started, downloaded: allowRemote };
}

export async function loadText() {
  if (!textPromise) {
    textPromise = loadTextOnce(false).catch(async (error) => {
      textPromise = null;
      try {
        return await loadTextOnce(true);
      } catch (downloadError) {
        throw new Error(
          `Text tower is not in the local CLIP cache (${error.message}). Download failed: ${downloadError.message}`,
        );
      }
    });
  }
  return textPromise;
}

export async function embedImageFile(file) {
  const { loaded } = await loadVision();
  const output = await loaded(file);
  return vectorFrom(output);
}

export async function embedTexts(texts) {
  const { tokenizer, model } = await loadText();
  const inputs = tokenizer(texts, { padding: true, truncation: true });
  const output = await model(inputs);
  const embeds = output.text_embeds;
  if (!embeds?.dims || !embeds.data) throw new Error("CLIP text tower did not return text_embeds");
  const width = embeds.dims[embeds.dims.length - 1];
  if (embeds.dims[0] !== texts.length || width !== EMBEDDING_DIM) {
    throw new Error(`Unexpected text embedding shape ${embeds.dims.join("x")}`);
  }
  return texts.map((_, index) => {
    const vector = l2Normalize(Array.from(embeds.data.subarray(index * width, (index + 1) * width)));
    if (!vector) throw new Error(`Text embedding ${index} has no magnitude`);
    return vector;
  });
}

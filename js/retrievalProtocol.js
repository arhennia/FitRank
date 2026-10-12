/**
 * Frozen Fashion-MNIST retrieval protocol.
 * These values are the source of truth. They were chosen before the test split
 * was scored and are not searched against that split.
 *
 * Fashion-MNIST class labels are not shopper relevance. Nothing here validates
 * real-world fashion recommendations.
 */

export const CLASS_NAMES = [
  "T-shirt/top",
  "Trouser",
  "Pullover",
  "Dress",
  "Coat",
  "Sandal",
  "Shirt",
  "Sneaker",
  "Bag",
  "Ankle boot",
];

export const INDEX_PER_CLASS = 100;
export const VALIDATION_PER_CLASS = 10;
export const TEST_PER_CLASS = 10;
export const RETRIEVAL_K = 10;

/** Equal weights. A missing query signal is dropped, not treated as zero. */
export const HYBRID_SIGNAL_WEIGHT = Object.freeze({ image: 1, text: 1 });

/** Same lambda as the shopper MMR. Relevance is the unscaled retrieval score. */
export const DIVERSITY_LAMBDA = 0.7;

/**
 * Diversity reranks only this many candidates, already ordered by retrieval
 * score. Full-index MMR over 1,000 vectors is a separate cost, and a shorter
 * pool would make the ablation incomparable with itself.
 */
export const DIVERSITY_POOL = 50;

/**
 * Cosine threshold for the CLIP name detector. Fixed before any listing name
 * was embedded. It is not adjusted after the 13-pair run.
 */
export const NAME_COSINE_THRESHOLD = 0.9;

export const RANDOM_SEED = 20261012;
export const PIXEL_DIM = 28 * 28;
export const EMBEDDING_DIM = 512;
export const MODEL_ID = "Xenova/clip-vit-base-patch32";

export const LITERAL_TEMPLATE = "a photo of a {}";

export const DECLARED_LISTING_FIELDS = [
  "category",
  "colour",
  "material",
  "silhouette",
  "price",
  "currency",
];

export const SCORE_DEFINITION = [
  "retrievalScore = sum(weight_s * cosine_s) / sum(weight_s) over query signals that are present.",
  "The signals are image and text. Each weight is 1.",
  "A missing query signal is omitted from the numerator and the denominator. It is not scored as zero.",
  "Cosine is the dot product of L2-normalized embeddings and lies in [-1, 1].",
  "A candidate with no image embedding is omitted, not given a zero.",
  "If the query has neither an image nor a text embedding, retrieval fails and returns no list.",
  "Hard constraints run first and are not added into the score.",
  "If a requested constraint needs a field this catalogue does not contain, retrieval fails and does not invent that field.",
  "Diversity, when requested, keeps the top 50 candidates by retrieval score and reranks them with MMR(d) = 0.7 * retrievalScore(d) - 0.3 * max image-embedding cosine to an item already chosen.",
  "The redundancy term is 0 when nothing has been chosen yet.",
  "Lambda 1 keeps retrieval-score order, with id as the tie-break.",
  "The shopper attribute score is not applied here. Fashion-MNIST rows do not have price, stock, size, reviews, or comfort, and those values are not invented.",
].join(" ");

export function classSlug(className) {
  return String(className).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function literalQuery(className) {
  return LITERAL_TEMPLATE.replace("{}", className);
}

export function splitBounds() {
  const indexEnd = INDEX_PER_CLASS;
  const validationEnd = indexEnd + VALIDATION_PER_CLASS;
  const testEnd = validationEnd + TEST_PER_CLASS;
  return {
    index: [0, indexEnd],
    validation: [indexEnd, validationEnd],
    test: [validationEnd, testEnd],
  };
}

/**
 * Assign already-ordered source indexes for one class.
 * Order is index, then validation, then test. The slices do not overlap.
 */
export function assignClassMembers(sourceIndexes) {
  const bounds = splitBounds();
  const need = bounds.test[1];
  if (!Array.isArray(sourceIndexes) || sourceIndexes.length < need) {
    throw new Error(`Need ${need} source images for this class`);
  }
  const assigned = [];
  for (const split of ["index", "validation", "test"]) {
    const [start, end] = bounds[split];
    sourceIndexes.slice(start, end).forEach((sourceIndex, offset) => {
      assigned.push({ split, sourceIndex, offset });
    });
  }
  return assigned;
}

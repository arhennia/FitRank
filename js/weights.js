/**
 * Scoring configuration. Change weights here and nowhere else.
 * Base hybrid weights sum to 100. Optional weights are added only when
 * that signal applies, then the active set is renormalised.
 */

export const WEIGHTS = {
  occasion: 24,
  style: 16,
  colour: 8,
  comfort: 14,
  versatility: 14,
  quality: 12,
  budgetFit: 12,
};

/** Added before renormalisation. They are not part of the base 100. */
export const OPTIONAL_WEIGHTS = {
  similarity: 16,
  material: 10,
  statement: 10,
};

/** Frozen FitRank 1 weights. The baseline scorer is the only consumer. */
export const WEIGHTS_V1 = {
  occasion: 30,
  style: 25,
  category: 20,
  colour: 10,
  priority: 10,
  comfortVersatility: 5,
};

/** Sum to 1. Category is the largest term so colour alone cannot dominate. */
export const SIMILARITY_WEIGHTS = {
  category: 0.35,
  style: 0.2,
  colour: 0.1,
  material: 0.1,
  silhouette: 0.1,
  occasion: 0.1,
  comfort: 0.05,
};

export const MMR_LAMBDA = 0.7;
export const BAYES_M = 10;
export const PRIOR_FALLBACK = 3.5;
export const VERSATILITY_FULL_AT = 4;
export const TRADEOFF_BELOW = 0.35;
export const FORMALITY_MENTION_AT = 0.75;
export const EVAL_K = 5;

export const OCCASIONS = ["everyday", "work", "evening", "travel", "special"];

export const STYLES = ["minimalist", "structured", "classic", "bold", "artistic"];

export const CATEGORIES = [
  "Handbags",
  "Jackets and coats",
  "Dresses and skirts",
  "Heels",
  "Flats and loafers",
  "Accessories",
  "Tops",
  "Trousers",
  "Sneakers",
];

export const COLOURS = [
  "black",
  "brown",
  "navy",
  "beige",
  "white",
  "burgundy",
  "green",
  "red",
  "tan",
  "grey",
];

export const PRIORITIES = ["comfort", "versatility", "craftsmanship", "statement"];

export const EMPHASIS = ["balanced", "comfort", "versatility", "appearance", "quality", "budgetFit"];

export const RANKING_MODES = ["relevance", "diverse"];

export const SITUATIONS = ["college", "office", "evening", "travel", "wedding", "custom"];

export const AVAILABILITY = ["in_stock", "out_of_stock"];

export const FORMALITY_TARGETS = {
  everyday: 2,
  work: 4,
  evening: 5,
  travel: 2,
  special: 5,
};

/**
 * Illustrative material signal for the legacy craftsmanship priority.
 * Unknown materials score 0 so a missing lookup is not treated as a match.
 */
export const MATERIAL_CRAFTSMANSHIP = {
  leather: 1,
  suede: 0.9,
  wool: 0.85,
  silk: 0.85,
  cotton: 0.6,
  linen: 0.6,
  canvas: 0.55,
  metal: 0.7,
  synthetic: 0.35,
};

export const COMPONENT_LABELS = {
  occasion: "Occasion",
  style: "Style",
  colour: "Colour",
  comfort: "Comfort",
  versatility: "Versatility",
  quality: "Review estimate",
  budgetFit: "Budget fit",
  similarity: "Similarity",
  material: "Material",
  statement: "Statement",
};

export const OCCASION_LABELS = {
  everyday: "everyday",
  work: "work",
  evening: "evening",
  travel: "travel",
  special: "special occasion",
};

export const STYLE_LABELS = {
  minimalist: "minimalist",
  structured: "structured",
  classic: "classic",
  bold: "bold",
  artistic: "artistic",
};

export const PRIORITY_LABELS = {
  comfort: "comfort",
  versatility: "versatility",
  craftsmanship: "craftsmanship",
  statement: "statement design",
};

export const EMPHASIS_LABELS = {
  balanced: "balanced",
  comfort: "comfort",
  versatility: "versatility",
  appearance: "appearance",
  quality: "review quality",
  budgetFit: "budget fit",
};

/**
 * Scoring configuration. Change weights here and nowhere else.
 * The five recommendation weights plus comfort/versatility sum to 100.
 */
export const WEIGHTS = {
  occasion: 30,
  style: 25,
  category: 20,
  colour: 10,
  priority: 10,
  comfortVersatility: 5,
};

export const OCCASIONS = ["everyday", "work", "evening", "travel", "special"];

export const STYLES = ["minimalist", "structured", "classic", "bold", "artistic"];

export const CATEGORIES = [
  "Handbags",
  "Jackets and coats",
  "Dresses and skirts",
  "Heels",
  "Flats and loafers",
  "Accessories",
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

/**
 * Illustrative craftsmanship signal for the priority component.
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

/** Four occasions is a full versatility score. The catalogue has five occasion values. */
export const VERSATILITY_FULL_AT = 4;

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

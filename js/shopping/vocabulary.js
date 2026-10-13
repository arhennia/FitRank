/**
 * Shopping-questionnaire vocabulary.
 * Option effects are data. The interpreter sums them; it does not special-case
 * each combination. Aesthetic definitions live here so tags can be extended
 * without editing the ranker.
 */

export const SIGNAL_CAP = 2;

/** Weights before renormalisation. Price stays smaller than context and value. */
export const INTENT_WEIGHTS = {
  context: 26,
  aesthetic: 18,
  versatility: 14,
  distinctiveness: 14,
  comfort: 12,
  quality: 12,
  value: 16,
  price: 6,
  wardrobeRole: 12,
  similarity: 16,
  avoid: 14,
};

export const MISSION_ORDER = [
  "occasion",
  "gap-fill",
  "replace",
  "deal-check",
  "statement",
  "versatile",
  "explore",
  "temptation",
];

export const MISSION_LABELS = {
  occasion: "An occasion-led purchase",
  "gap-fill": "Fill a wardrobe gap",
  replace: "Replace something worn out",
  "deal-check": "Check whether the price is worth it",
  statement: "A distinctive or aesthetic purchase",
  versatile: "A versatile wardrobe addition",
  explore: "Exploratory discovery",
  temptation: "Decide whether a tempting piece is worth buying",
  unspecified: "A search from the answers given",
};

export const DIVERSE_DISCOVERY = new Set([
  "style-discovery",
  "aesthetic-explore",
  "compare",
  "open-surprise",
]);

export const QUESTIONS = [
  {
    id: "trigger",
    prompt: "What brought you here today?",
    hint: "This is about today's purchase, not a permanent shopping type.",
    selection: "single",
    options: [
      { id: "occasion", label: "I need something for a specific occasion.", effects: { purchaseTrigger: "occasion", mission: { occasion: 3 } } },
      { id: "gap", label: "Something in my wardrobe is missing.", effects: { purchaseTrigger: "gap", mission: { "gap-fill": 3 }, wardrobeUncertainty: 1 } },
      { id: "replace", label: "I need to replace something worn out.", effects: { purchaseTrigger: "replace", mission: { replace: 3 }, quality: 1, versatility: 1 } },
      { id: "spotted", label: "I spotted something I like.", effects: { purchaseTrigger: "spotted", mission: { temptation: 3 } } },
      { id: "explore", label: "I'm exploring and looking for inspiration.", effects: { purchaseTrigger: "explore", mission: { explore: 3 }, discovery: 2 } },
      { id: "deal", label: "I found a good deal and want to see if it's worth it.", effects: { purchaseTrigger: "deal", mission: { "deal-check": 3 }, value: 1, price: 1 } },
    ],
  },
  {
    id: "outcome",
    prompt: "What would make this purchase feel worth it?",
    hint: "What should be true after you buy it?",
    selection: "single",
    options: [
      { id: "repeat-wear", label: "I'll wear it again and again.", effects: { desiredOutcome: "repeat-wear", mission: { versatile: 2 }, versatility: 2 } },
      { id: "completes", label: "It completes outfits I already own.", effects: { desiredOutcome: "completes-outfits", mission: { "gap-fill": 2 }, wardrobeUncertainty: 1, versatility: 1 } },
      { id: "new-look", label: "It gives me a new look or aesthetic.", effects: { desiredOutcome: "new-aesthetic", mission: { statement: 2 }, distinctiveness: 2, novelty: 1 } },
      { id: "occasion-special", label: "It makes a particular occasion feel special.", effects: { desiredOutcome: "occasion-special", mission: { occasion: 2 }, occasionFit: 2 } },
      { id: "unique", label: "It's something unique I wouldn't normally find.", effects: { desiredOutcome: "unique", mission: { statement: 1, explore: 1 }, distinctiveness: 2, novelty: 2 } },
      { id: "deal-quality", label: "It's a great deal for the quality.", effects: { desiredOutcome: "deal-quality", mission: { "deal-check": 2 }, value: 2, quality: 1 } },
    ],
  },
  {
    id: "role",
    prompt: "How do you want this piece to fit into your wardrobe?",
    hint: "How this piece should sit with the rest of your clothes.",
    selection: "single",
    options: [
      { id: "versatile", label: "A versatile piece that works with many outfits.", effects: { wardrobeRole: "versatile", mission: { versatile: 3 }, versatility: 2 } },
      { id: "basic", label: "A missing basic I should already have.", effects: { wardrobeRole: "basic", mission: { "gap-fill": 2, versatile: 1 }, versatility: 1, basics: 2 } },
      { id: "connector", label: "A piece that connects several existing items.", effects: { wardrobeRole: "connector", mission: { "gap-fill": 3 }, wardrobeUncertainty: 1, versatility: 1 } },
      { id: "statement", label: "A statement piece that stands out.", effects: { wardrobeRole: "statement", mission: { statement: 3 }, distinctiveness: 2 } },
      { id: "different", label: "Something different from what I usually wear.", effects: { wardrobeRole: "different", mission: { explore: 2, statement: 1 }, novelty: 2, distinctiveness: 1 } },
      { id: "complete-look", label: "A complete look built around this purchase.", effects: { wardrobeRole: "complete-look", mission: { occasion: 2, statement: 1 }, occasionFit: 1, distinctiveness: 1 } },
    ],
  },
  {
    id: "discovery",
    prompt: "Which sounds most like how you want to shop today?",
    hint: "How focused should the shortlist be?",
    selection: "single",
    options: [
      { id: "focused", label: "I know what I need; help me find the best option.", effects: { discoveryMode: "focused", focus: 2 } },
      { id: "style-new", label: "I know my style but want to discover something new.", effects: { discoveryMode: "style-discovery", discovery: 2, novelty: 1, mission: { explore: 1 } } },
      { id: "aesthetic-explore", label: "I want to explore a particular aesthetic.", effects: { discoveryMode: "aesthetic-explore", discovery: 2, mission: { explore: 1 } } },
      { id: "compare", label: "I want to compare options before committing.", effects: { discoveryMode: "compare", discovery: 1 } },
      { id: "surprise", label: "I'm open to surprises if the recommendation makes sense.", effects: { discoveryMode: "open-surprise", discovery: 2, mission: { explore: 2 } } },
      { id: "temptation", label: "I'm tempted by something, but want to know if I should buy it.", effects: { discoveryMode: "temptation-check", value: 1, mission: { temptation: 2, "deal-check": 1 } } },
    ],
  },
  {
    id: "contexts",
    prompt: "Where and how will you actually wear it?",
    hint: "Choose every setting you actually have in mind.",
    selection: "multi",
    options: [
      { id: "university", label: "University or everyday life.", formality: 2, occasions: { everyday: 1 } },
      { id: "work", label: "Work, internship or interviews.", formality: 4, occasions: { work: 1 } },
      { id: "cafes", label: "Cafés, outings or dates.", formality: 3, occasions: { everyday: 0.55, evening: 0.55 } },
      { id: "parties", label: "Parties, concerts or festivals.", formality: 4, occasions: { evening: 1 } },
      { id: "weddings", label: "Weddings, festivals or family occasions.", formality: 5, occasions: { special: 1, evening: 0.35 } },
      { id: "travel", label: "Travel or holidays.", formality: 2, occasions: { travel: 1 } },
      { id: "home", label: "At home or for comfort.", formality: 1, occasions: { everyday: 0.35 }, effects: { comfort: 1 } },
      { id: "several", label: "Several different settings.", formality: 3, occasions: { everyday: 0.7, work: 0.35, travel: 0.35, evening: 0.25 } },
    ],
  },
  {
    id: "aesthetics",
    prompt: "Which styles feel most like what you want right now?",
    hint: "Choose any that apply. A product does not need to match every one.",
    selection: "multi",
    options: [
      { id: "goth", label: "Goth, romantic goth or dark alternative.", distinctiveness: 0.9 },
      { id: "grunge", label: "Grunge, punk or emo.", distinctiveness: 0.85 },
      { id: "dark-academia", label: "Dark academia or vintage academia.", distinctiveness: 0.55 },
      { id: "coquette", label: "Coquette, romantic or ballet-inspired.", distinctiveness: 0.7 },
      { id: "fairycore", label: "Fairycore, whimsigoth or fantasy-inspired.", distinctiveness: 0.8 },
      { id: "y2k", label: "Y2K, McBling or 2000s nostalgia.", distinctiveness: 0.75 },
      { id: "streetwear", label: "Streetwear, sporty or casual urban.", distinctiveness: 0.45 },
      { id: "vintage", label: "Vintage, retro or thrift-inspired.", distinctiveness: 0.5 },
      { id: "preppy", label: "Preppy, polished or classic.", distinctiveness: 0.25 },
      { id: "minimal", label: "Minimal, understated or versatile.", distinctiveness: 0.15 },
      { id: "artistic", label: "Artistic, eclectic or experimental.", distinctiveness: 0.85 },
      { id: "open", label: "I'm exploring and don't have a fixed aesthetic.", distinctiveness: 0 },
    ],
  },
  {
    id: "priorities",
    prompt: "What matters most when choosing between good options?",
    hint: "Balance is an even mix of these trade-offs. It is not an extra boost.",
    selection: "multi",
    options: [
      { id: "versatility", label: "Maximum versatility.", effects: { versatility: 2 } },
      { id: "comfort", label: "Comfort and practicality.", effects: { comfort: 2 } },
      { id: "distinctive", label: "Distinctive design or aesthetic.", effects: { distinctiveness: 2 } },
      { id: "quality", label: "Quality and expected lifespan.", effects: { quality: 2 } },
      { id: "value", label: "Value for money.", effects: { value: 2 } },
      { id: "fit", label: "A flattering fit and silhouette.", effects: { fit: 2 } },
      { id: "not-owned", label: "Something I don't already own.", effects: { novelty: 2, distinctiveness: 1 } },
      { id: "price", label: "The lowest price or a genuinely good deal.", effects: { price: 2, value: 1 } },
      { id: "balance", label: "A balance of several of these.", effects: { balance: 1 } },
    ],
  },
];

export const AESTHETICS = QUESTIONS.find((question) => question.id === "aesthetics").options;

export const CONTEXTS = QUESTIONS.find((question) => question.id === "contexts").options;

export const SHOP_CATEGORIES = [
  { id: "tops", label: "Tops and T-shirts", catalogueCategories: ["Tops"], acceptCoarse: false },
  { id: "shirts", label: "Shirts and blouses", catalogueCategories: ["Tops"], acceptCoarse: false },
  { id: "knitwear", label: "Knitwear", catalogueCategories: ["Tops"], acceptCoarse: false },
  { id: "hoodies", label: "Hoodies and sweatshirts", catalogueCategories: ["Tops"], acceptCoarse: false },
  { id: "trousers", label: "Trousers", catalogueCategories: ["Trousers"], acceptCoarse: false },
  { id: "jeans", label: "Jeans", catalogueCategories: ["Trousers"], acceptCoarse: false },
  { id: "skirts", label: "Skirts", catalogueCategories: ["Dresses and skirts"], acceptCoarse: false },
  { id: "dresses", label: "Dresses", catalogueCategories: ["Dresses and skirts"], acceptCoarse: false },
  { id: "shorts", label: "Shorts", catalogueCategories: ["Trousers"], acceptCoarse: false },
  { id: "jackets", label: "Jackets", catalogueCategories: ["Jackets and coats"], acceptCoarse: false },
  { id: "coats", label: "Coats", catalogueCategories: ["Jackets and coats"], acceptCoarse: false },
  { id: "blazers", label: "Blazers", catalogueCategories: ["Jackets and coats"], acceptCoarse: false },
  { id: "handbags", label: "Handbags", catalogueCategories: ["Handbags"], acceptCoarse: true },
  { id: "backpacks", label: "Backpacks", catalogueCategories: ["Handbags"], acceptCoarse: false },
  { id: "sneakers", label: "Sneakers", catalogueCategories: ["Sneakers"], acceptCoarse: true },
  { id: "boots", label: "Boots", catalogueCategories: [], acceptCoarse: false },
  { id: "heels", label: "Heels", catalogueCategories: ["Heels"], acceptCoarse: true },
  { id: "flats", label: "Flats", catalogueCategories: ["Flats and loafers"], acceptCoarse: false },
  { id: "loafers", label: "Loafers", catalogueCategories: ["Flats and loafers"], acceptCoarse: false },
  { id: "jewellery", label: "Jewellery", catalogueCategories: ["Accessories"], acceptCoarse: false },
  { id: "belts", label: "Belts and other accessories", catalogueCategories: ["Accessories"], acceptCoarse: false },
];

export const FITS = [
  { id: "relaxed", label: "Relaxed" },
  { id: "oversized", label: "Oversized" },
  { id: "regular", label: "Regular" },
  { id: "fitted", label: "Fitted" },
  { id: "wide-leg", label: "Wide-leg" },
];

export const SEASONS = [
  { id: "warm", label: "Warm weather" },
  { id: "cool", label: "Cool weather" },
  { id: "rain", label: "Rain" },
];

export const DRESS_CODES = [
  { id: "casual", label: "Casual", min: 1, max: 2 },
  { id: "smart", label: "Smart casual", min: 2, max: 4 },
  { id: "formal", label: "Formal", min: 4, max: 5 },
];

export const AVOIDS = [
  { id: "synthetic", label: "Synthetic materials" },
  { id: "bold-styling", label: "Bold or artistic styling" },
  { id: "evening-only", label: "Pieces tagged only for evening or special occasions" },
];

export const BUDGET_PRESETS = [
  { amount: 3000, label: "₹3,000" },
  { amount: 8000, label: "₹8,000" },
  { amount: 15000, label: "₹15,000" },
  { amount: 25000, label: "₹25,000" },
];

/** Explicit sizes used by the published catalogue. Not a universal size chart. */
export const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "UK6", "UK7", "UK8", "UK9", "one-size"];

/**
 * Used only when a product has no season field. Wool and linen are the only
 * materials with a recorded hint. Other materials do not match a season.
 */
export const MATERIAL_SEASON = {
  wool: "cool",
  linen: "warm",
};

/** Silhouettes that already use a fit word. Straight is not mapped to regular. */
export const SILHOUETTE_FIT = {
  relaxed: "relaxed",
  oversized: "oversized",
  fitted: "fitted",
  "wide-leg": "wide-leg",
};

export const MATERIALS = ["leather", "suede", "wool", "silk", "cotton", "linen", "canvas", "metal", "synthetic"];

export function questionById(id) {
  return QUESTIONS.find((question) => question.id === id) || null;
}

export function optionById(questionId, optionId) {
  const question = questionById(questionId);
  if (!question) return null;
  return question.options.find((option) => option.id === optionId) || null;
}

export function shopCategoryById(id) {
  return SHOP_CATEGORIES.find((category) => category.id === id) || null;
}

export function aestheticById(id) {
  return AESTHETICS.find((aesthetic) => aesthetic.id === id) || null;
}

/**
 * Hand-written shopper scenarios.
 * Relevance labels were chosen from product attributes by the scenario author.
 * This file must not import the scorer or recommend().
 *
 * "Conflicting soft preferences" means the shopper asked for tastes that pull
 * apart. It does not mean two listings disagree about one item.
 */

export const SHOPPER_SCENARIOS = [
  {
    id: "strict-budget",
    name: "Strict budget and category",
    preferences: {
      occasions: ["everyday"],
      styles: ["minimalist"],
      categories: ["Handbags"],
      maxBudget: 5000,
      emphasis: "balanced",
      requireInStock: true,
      ranking: "relevance",
    },
    // Everyday minimalist handbags at or under ₹5,000: p04, p19, p20.
    // p21 is in budget and category but is an evening bag, so it is not relevant.
    relevantIds: ["p04", "p19", "p20"],
    grades: { p04: 2, p19: 2, p20: 2 },
  },
  {
    id: "comfort",
    name: "Comfort and versatility",
    preferences: {
      occasions: ["everyday"],
      styles: [],
      categories: [],
      maxBudget: 20000,
      emphasis: "comfort",
      requireInStock: true,
    },
    // A hand-picked set of strong everyday comfort pieces, not every high-comfort row.
    relevantIds: ["p02", "p04", "p07", "p08", "p12", "p13", "p20", "p22", "p38", "p52"],
    grades: {
      p02: 2,
      p04: 2,
      p07: 2,
      p08: 2,
      p12: 3,
      p13: 2,
      p20: 2,
      p22: 2,
      p38: 2,
      p52: 2,
    },
  },
  {
    id: "similar-loafer",
    name: "Similar to a reference loafer",
    preferences: {
      occasions: ["everyday"],
      styles: ["minimalist"],
      categories: ["Flats and loafers"],
      maxBudget: 15000,
      emphasis: "balanced",
      likedProductId: "p12",
      requireInStock: true,
    },
    // Other flats a shopper who likes the brown leather loafer might accept.
    // The reference itself is not a relevant alternative.
    relevantIds: ["p13", "p52", "p53", "p54"],
    grades: { p52: 3, p53: 2, p54: 2, p13: 1 },
  },
  {
    id: "conflicting-tastes",
    name: "Conflicting soft preferences",
    preferences: {
      occasions: ["work"],
      styles: ["minimalist", "bold"],
      categories: [],
      maxBudget: 20000,
      emphasis: "balanced",
      requireInStock: true,
    },
    // Author-picked work pieces that match either minimalist or bold, not an exhaustive list.
    relevantIds: ["p08", "p14", "p22", "p37"],
    grades: { p08: 1, p14: 1, p22: 1, p37: 1 },
  },
  {
    id: "few-eligible",
    name: "Few eligible products",
    preferences: {
      occasions: ["everyday"],
      styles: [],
      categories: ["Sneakers"],
      maxBudget: 2500,
      emphasis: "balanced",
      requireInStock: true,
    },
    relevantIds: ["p38"],
    grades: { p38: 1 },
  },
  {
    id: "none-eligible",
    name: "No eligible products",
    preferences: {
      occasions: ["everyday"],
      styles: [],
      categories: [],
      maxBudget: 1,
      emphasis: "balanced",
      requireInStock: true,
    },
    relevantIds: [],
    grades: {},
  },
];

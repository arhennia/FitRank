import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { products } from "../js/catalogue.js";
import { parseJsonCatalogue } from "../js/catalogueIO.js";
import { recommend } from "../js/recommend.js";
import { SYNTHETIC_ANNOTATIONS } from "../js/shopping/annotations.js";
import { createFlowState, goBack, goNext, resetFlow, setAnswer } from "../js/shopping/flow.js";
import { interpretShoppingProfile, validateConstraints, validateQuestionnaire } from "../js/shopping/profile.js";
import { recommendFromIntent } from "../js/shopping/recommendIntent.js";
import { intentWeights, scoreIntentProduct } from "../js/shopping/scoreIntent.js";
import { AESTHETICS, QUESTIONS, SHOP_CATEGORIES } from "../js/shopping/vocabulary.js";

function piece(overrides = {}) {
  return {
    id: "x",
    name: "Piece",
    category: "Tops",
    brand: "Test",
    colour: "black",
    colours: ["black"],
    styles: ["minimalist"],
    occasions: ["everyday"],
    material: "cotton",
    silhouette: "straight",
    comfortRating: 4,
    versatilityRating: 4,
    formalityRating: 2,
    price: 3000,
    availability: "in_stock",
    sizes: ["M"],
    averageRating: 4.2,
    reviewCount: 40,
    description: "A synthetic test row.",
    ...overrides,
  };
}

function answers(overrides = {}) {
  return {
    trigger: "spotted",
    outcome: "repeat-wear",
    role: "versatile",
    discovery: "focused",
    contexts: ["university"],
    aesthetics: ["open"],
    priorities: ["versatility"],
    ...overrides,
  };
}

function constraints(overrides = {}) {
  return {
    maxBudget: 20000,
    budgetType: "item",
    requireInStock: true,
    categories: [],
    ...overrides,
  };
}

function run(catalogue, answerOverrides = {}, constraintOverrides = {}) {
  return recommendFromIntent(catalogue, {
    answers: answers(answerOverrides),
    constraints: constraints(constraintOverrides),
  });
}

function textOf(result) {
  return result.products
    .flatMap((item) => [...item.explanation, ...item.tradeoffs])
    .join(" ");
}

const EXPECTED_PROMPTS = [
  "What brought you here today?",
  "What would make this purchase feel worth it?",
  "How do you want this piece to fit into your wardrobe?",
  "Which sounds most like how you want to shop today?",
  "Where and how will you actually wear it?",
  "Which styles feel most like what you want right now?",
  "What matters most when choosing between good options?",
];

const EXPECTED_OPTIONS = [
  [
    "I need something for a specific occasion.",
    "Something in my wardrobe is missing.",
    "I need to replace something worn out.",
    "I spotted something I like.",
    "I'm exploring and looking for inspiration.",
    "I found a good deal and want to see if it's worth it.",
  ],
  [
    "I'll wear it again and again.",
    "It completes outfits I already own.",
    "It gives me a new look or aesthetic.",
    "It makes a particular occasion feel special.",
    "It's something unique I wouldn't normally find.",
    "It's a great deal for the quality.",
  ],
  [
    "A versatile piece that works with many outfits.",
    "A missing basic I should already have.",
    "A piece that connects several existing items.",
    "A statement piece that stands out.",
    "Something different from what I usually wear.",
    "A complete look built around this purchase.",
  ],
  [
    "I know what I need; help me find the best option.",
    "I know my style but want to discover something new.",
    "I want to explore a particular aesthetic.",
    "I want to compare options before committing.",
    "I'm open to surprises if the recommendation makes sense.",
    "I'm tempted by something, but want to know if I should buy it.",
  ],
  [
    "University or everyday life.",
    "Work, internship or interviews.",
    "Cafés, outings or dates.",
    "Parties, concerts or festivals.",
    "Weddings, festivals or family occasions.",
    "Travel or holidays.",
    "At home or for comfort.",
    "Several different settings.",
  ],
  [
    "Goth, romantic goth or dark alternative.",
    "Grunge, punk or emo.",
    "Dark academia or vintage academia.",
    "Coquette, romantic or ballet-inspired.",
    "Fairycore, whimsigoth or fantasy-inspired.",
    "Y2K, McBling or 2000s nostalgia.",
    "Streetwear, sporty or casual urban.",
    "Vintage, retro or thrift-inspired.",
    "Preppy, polished or classic.",
    "Minimal, understated or versatile.",
    "Artistic, eclectic or experimental.",
    "I'm exploring and don't have a fixed aesthetic.",
  ],
  [
    "Maximum versatility.",
    "Comfort and practicality.",
    "Distinctive design or aesthetic.",
    "Quality and expected lifespan.",
    "Value for money.",
    "A flattering fit and silhouette.",
    "Something I don't already own.",
    "The lowest price or a genuinely good deal.",
    "A balance of several of these.",
  ],
];

describe("questionnaire wording and validation", () => {
  it("uses the seven specified questions and options", () => {
    assert.equal(QUESTIONS.length, 7);
    QUESTIONS.forEach((question, index) => {
      assert.equal(question.prompt, EXPECTED_PROMPTS[index]);
      assert.deepEqual(question.options.map((option) => option.label), EXPECTED_OPTIONS[index]);
    });
    assert.equal(QUESTIONS.filter((question) => question.selection === "single").length, 4);
    assert.equal(QUESTIONS.filter((question) => question.selection === "multi").length, 3);
  });

  it("rejects missing, unknown, and multi-valued single answers", () => {
    const missing = validateQuestionnaire({});
    assert.equal(missing.ok, false);
    assert.ok(missing.errors.length >= 7);

    const unknown = validateQuestionnaire(answers({ trigger: "nope" }));
    assert.equal(unknown.ok, false);
    assert.match(unknown.errors.join(" "), /nope/);

    const multi = validateQuestionnaire(answers({ trigger: ["occasion", "gap"] }));
    assert.equal(multi.ok, false);
    assert.match(multi.errors.join(" "), /one answer/);

    const emptyMulti = validateQuestionnaire(answers({ contexts: [] }));
    assert.equal(emptyMulti.ok, false);
  });

  it("accepts a complete questionnaire and orders multi-selects", () => {
    const result = validateQuestionnaire(answers({
      contexts: ["several", "university", "university"],
      aesthetics: ["goth", "artistic"],
      priorities: ["quality", "versatility"],
    }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.contexts, ["university", "several"]);
    assert.deepEqual(result.value.aesthetics, ["goth", "artistic"]);
    assert.deepEqual(result.value.priorities, ["versatility", "quality"]);
  });

  it("rejects an empty or unknown budget and an unknown category", () => {
    assert.equal(validateConstraints({ maxBudget: 0, budgetType: "item" }).ok, false);
    assert.equal(validateConstraints({ maxBudget: "abc", budgetType: "item" }).ok, false);
    assert.equal(validateConstraints({ maxBudget: "₹8,000", budgetType: "total" }).ok, true);
    const category = validateConstraints({ maxBudget: 1000, budgetType: "item", categories: ["not-a-category"] });
    assert.equal(category.ok, false);
  });
});

describe("questionnaire navigation", () => {
  it("keeps answers when moving back and clears them on reset", () => {
    let state = setAnswer(createFlowState(), "trigger", "occasion");
    const forward = goNext(state);
    assert.equal(forward.ok, true);
    assert.equal(forward.state.step, 1);
    assert.equal(forward.state.answers.trigger, "occasion");
    const back = goBack(forward.state);
    assert.equal(back.step, 0);
    assert.equal(back.answers.trigger, "occasion");

    const blocked = goNext(createFlowState());
    assert.equal(blocked.ok, false);
    assert.equal(blocked.state.step, 0);
    assert.match(blocked.errors[0], /Choose an answer/);

    const cleared = resetFlow();
    assert.equal(cleared.step, 0);
    assert.equal(cleared.answers.trigger, null);
    assert.deepEqual(cleared.answers.contexts, []);
  });

  it("toggles multi-select and treats balance as an even mix, not an extra tick", () => {
    let state = createFlowState();
    state = setAnswer(state, "aesthetics", "goth");
    state = setAnswer(state, "aesthetics", "artistic");
    state = setAnswer(state, "aesthetics", "goth");
    assert.deepEqual(state.answers.aesthetics, ["artistic"]);

    state = setAnswer(state, "priorities", "versatility");
    state = setAnswer(state, "priorities", "balance");
    assert.deepEqual(state.answers.priorities, ["balance"]);
    state = setAnswer(state, "priorities", "comfort");
    assert.deepEqual(state.answers.priorities, ["comfort"]);
  });
});

describe("shopping profile", () => {
  it("reads a versatile everyday mission without stacking the same signal", () => {
    const once = interpretShoppingProfile(answers({
      outcome: "repeat-wear",
      role: "versatile",
      contexts: ["university", "several"],
      priorities: ["quality"],
    }));
    const thrice = interpretShoppingProfile(answers({
      outcome: "repeat-wear",
      role: "versatile",
      contexts: ["university", "several"],
      priorities: ["versatility", "quality"],
    }));
    assert.equal(once.shoppingMission, "versatile");
    assert.equal(thrice.shoppingMission, "versatile");
    assert.ok(thrice.evidence.versatility > once.evidence.versatility);
    assert.equal(thrice.versatilityPreference, once.versatilityPreference);
    assert.equal(thrice.versatilityPreference, 1);
    assert.equal(intentWeights(thrice).versatility, undefined);
    assert.equal(intentWeights(once).wardrobeRole, intentWeights(thrice).wardrobeRole);

    const high = piece({ id: "high", versatilityRating: 5 });
    const low = piece({ id: "low", versatilityRating: 1 });
    const budget = constraints();
    assert.equal(
      scoreIntentProduct(high, once, budget).score,
      scoreIntentProduct(high, thrice, budget).score,
    );
    assert.ok(scoreIntentProduct(high, once, budget).score > scoreIntentProduct(low, once, budget).score);
  });

  it("reads a wardrobe gap without claiming to know owned clothes", () => {
    const profile = interpretShoppingProfile(answers({
      trigger: "gap",
      outcome: "completes",
      role: "connector",
      priorities: ["versatility"],
    }));
    assert.equal(profile.shoppingMission, "gap-fill");
    assert.equal(profile.wardrobeRole, "connector");
    assert.equal(profile.compatibilityCertainty, "unknown");
    assert.equal(profile.wardrobeKnown, false);
  });

  it("reads an artistic statement mission", () => {
    const profile = interpretShoppingProfile(answers({
      outcome: "new-look",
      role: "statement",
      aesthetics: ["artistic", "goth"],
      priorities: ["distinctive"],
      contexts: ["parties"],
    }));
    assert.equal(profile.shoppingMission, "statement");
    assert.deepEqual(profile.aestheticPreferences, ["goth", "artistic"]);
    assert.equal(profile.preferences.distinctiveness, 1);
  });

  it("reads an occasion mission and does not invent a dress code", () => {
    const profile = interpretShoppingProfile(answers({
      trigger: "occasion",
      outcome: "occasion-special",
      role: "complete-look",
      contexts: ["weddings"],
    }));
    assert.equal(profile.shoppingMission, "occasion");
    assert.equal(profile.desiredOutcome, "occasion-special");
    assert.equal(profile.evidence.dressCode, undefined);
  });

  it("reads a deal check as price plus quality, not price alone", () => {
    const profile = interpretShoppingProfile(answers({
      trigger: "deal",
      outcome: "deal-quality",
      priorities: ["value", "price"],
      discovery: "temptation",
    }));
    assert.equal(profile.shoppingMission, "deal-check");
    assert.equal(profile.preferences.value, 1);
    assert.equal(profile.preferences.quality > 0, true);
    assert.equal(intentWeights(profile).price, undefined);
  });

  it("reads open exploration as broader discovery inside any named aesthetic", () => {
    const open = interpretShoppingProfile(answers({
      trigger: "explore",
      discovery: "surprise",
      aesthetics: ["open"],
      role: "different",
    }));
    assert.equal(open.shoppingMission, "explore");
    assert.equal(open.ranking, "diverse");
    assert.deepEqual(open.aestheticPreferences, []);
    assert.equal(open.exploringAesthetic, true);

    const inside = interpretShoppingProfile(answers({
      trigger: "explore",
      discovery: "aesthetic-explore",
      aesthetics: ["open", "goth"],
    }));
    assert.deepEqual(inside.aestheticPreferences, ["goth"]);
    assert.equal(inside.ranking, "diverse");
    assert.equal(inside.exploringAesthetic, true);
  });

  it("supports a combination that is not one of the named examples", () => {
    const profile = interpretShoppingProfile(answers({
      trigger: "replace",
      outcome: "deal-quality",
      role: "basic",
      contexts: ["work", "university"],
      priorities: ["quality", "comfort"],
      discovery: "compare",
    }));
    assert.equal(profile.shoppingMission, "replace");
    assert.equal(profile.ranking, "diverse");
    assert.ok(profile.preferences.quality > 0);
    assert.ok(profile.preferences.comfort > 0);
    assert.deepEqual(profile.occasionContexts, ["university", "work"]);
  });

  it("does not let balance stack on top of a named trade-off", () => {
    const named = interpretShoppingProfile(answers({
      outcome: "repeat-wear",
      role: "versatile",
      priorities: ["versatility"],
    }));
    const balanced = interpretShoppingProfile(answers({
      outcome: "repeat-wear",
      role: "versatile",
      priorities: ["balance", "versatility"],
    }));
    assert.equal(balanced.balancedTradeoff, true);
    assert.equal(balanced.versatilityPreference, named.versatilityPreference);
    assert.equal(intentWeights(named).wardrobeRole, intentWeights(balanced).wardrobeRole);
    assert.ok(intentWeights(balanced).comfort > 0);
    assert.equal(intentWeights(named).comfort, undefined);
  });
});

describe("intent recommendations", () => {
  const daily = piece({
    id: "daily",
    name: "Daily Tee",
    shopCategory: "tops",
    occasions: ["everyday", "travel"],
    styles: ["minimalist"],
    versatilityRating: 5,
    comfortRating: 5,
    formalityRating: 1,
    aesthetics: [{ id: "minimal", relevance: 0.9 }],
    price: 1800,
  });
  const party = piece({
    id: "party",
    name: "Painted Jacket",
    category: "Jackets and coats",
    shopCategory: "jackets",
    occasions: ["evening", "special"],
    styles: ["artistic", "bold"],
    versatilityRating: 1,
    comfortRating: 2,
    formalityRating: 4,
    aesthetics: [{ id: "artistic", relevance: 0.95 }, { id: "goth", relevance: 0.7 }],
    material: "wool",
    price: 8000,
    averageRating: 4,
    reviewCount: 12,
  });

  it("ranks a versatile everyday piece above a party piece for that mission", () => {
    const result = run([party, daily], {
      outcome: "repeat-wear",
      role: "versatile",
      contexts: ["university", "several"],
      priorities: ["versatility", "quality"],
    });
    assert.equal(result.products[0].product.id, "daily");
    assert.ok(result.products[0].score > result.products[1].score);
  });

  it("ranks a distinctive piece above a basic for a statement and party search", () => {
    const result = run([daily, party], {
      outcome: "new-look",
      role: "statement",
      discovery: "aesthetic-explore",
      contexts: ["parties"],
      aesthetics: ["artistic", "goth"],
      priorities: ["distinctive"],
    });
    assert.equal(result.profile.shoppingMission, "statement");
    assert.equal(result.products[0].product.id, "party");
    assert.match(textOf(result), /aesthetic/i);
  });

  it("ranks a wedding-suited piece above everyday wear and does not invent a dress code", () => {
    const result = run([daily, party], {
      trigger: "occasion",
      outcome: "occasion-special",
      role: "complete-look",
      contexts: ["weddings"],
      priorities: ["quality"],
    });
    assert.equal(result.products[0].product.id, "party");
    assert.match(result.assumptions.join(" "), /dress code/i);
    assert.doesNotMatch(textOf(result), /black tie|cocktail code/i);
  });

  it("does not let a low price outrank a better-supported deal", () => {
    const cheap = piece({
      id: "cheap",
      price: 400,
      averageRating: undefined,
      reviewCount: undefined,
      versatilityRating: 3,
    });
    const solid = piece({
      id: "solid",
      price: 4500,
      averageRating: 4.6,
      reviewCount: 80,
      versatilityRating: 3,
    });
    const result = run([cheap, solid], {
      trigger: "deal",
      outcome: "deal-quality",
      role: "basic",
      discovery: "temptation",
      priorities: ["value", "price"],
    });
    assert.equal(result.products[0].product.id, "solid");
    assert.match(textOf(result), /not treated as proof of a good deal|No discount or price history/i);
  });

  it("keeps an unsuitable cheap product below a suitable one, and never past the budget", () => {
    const cheap = piece({
      id: "cheap",
      occasions: ["travel"],
      price: 100,
      versatilityRating: 5,
    });
    const right = piece({
      id: "right",
      occasions: ["everyday"],
      price: 1500,
      versatilityRating: 4,
    });
    const dream = piece({
      id: "dream",
      occasions: ["everyday"],
      price: 9000,
      versatilityRating: 5,
      aesthetics: [{ id: "minimal", relevance: 1 }],
    });
    const result = run([dream, cheap, right], {
      priorities: ["price", "versatility"],
    }, { maxBudget: 5000 });
    assert.deepEqual(result.products.map((item) => item.product.id).includes("dream"), false);
    assert.equal(result.products[0].product.id, "right");
    for (const item of result.products) assert.ok(item.product.price <= 5000);
  });

  it("gives partial aesthetic credit and keeps relevance unequal", () => {
    const shared = {
      occasions: ["evening"],
      styles: ["artistic"],
      versatilityRating: 2,
      formalityRating: 4,
      price: 4000,
    };
    const strong = piece({ id: "strong", aesthetics: [{ id: "goth", relevance: 0.95 }], ...shared });
    const weak = piece({ id: "weak", aesthetics: [{ id: "goth", relevance: 0.35 }], ...shared });
    const both = piece({
      id: "both",
      aesthetics: [{ id: "goth", relevance: 0.5 }, { id: "artistic", relevance: 0.5 }],
      ...shared,
    });
    const plain = piece({ id: "plain", aesthetics: undefined, ...shared });
    const profile = interpretShoppingProfile(answers({
      aesthetics: ["goth", "artistic"],
      role: "statement",
      contexts: ["parties"],
    }));
    const budget = constraints();
    const strongScore = scoreIntentProduct(strong, profile, budget);
    const weakScore = scoreIntentProduct(weak, profile, budget);
    const bothScore = scoreIntentProduct(both, profile, budget);
    const plainScore = scoreIntentProduct(plain, profile, budget);
    assert.ok(strongScore.components.aesthetic.value > weakScore.components.aesthetic.value);
    assert.ok(bothScore.components.aesthetic.value > 0);
    assert.equal(plainScore.components.aesthetic.value, 0);
    assert.equal(plainScore.components.aesthetic.missing, true);
    assert.ok(strongScore.score > plainScore.score);

    const result = run([plain, both, strong], {
      aesthetics: ["goth", "artistic"],
      role: "statement",
      contexts: ["parties"],
      outcome: "new-look",
      priorities: ["distinctive"],
    });
    assert.notEqual(result.products.at(-1).product.id, "strong");
    assert.match(textOf(result), /no aesthetic tags/i);
  });

  it("treats several categories as eligibility, not a score bonus", () => {
    const bag = piece({ id: "bag", category: "Handbags", shopCategory: "handbags", price: 2000 });
    const shoe = piece({ id: "shoe", category: "Sneakers", shopCategory: "sneakers", price: 2000 });
    const heel = piece({ id: "heel", category: "Heels", shopCategory: "heels", price: 2000 });
    const result = run([heel, bag, shoe], {}, { categories: ["handbags", "sneakers"] });
    assert.deepEqual(result.products.map((item) => item.product.id).sort(), ["bag", "shoe"]);
  });

  it("distinguishes a per-item budget from a total purchase budget", () => {
    const strong = piece({
      id: "strong",
      price: 6000,
      versatilityRating: 5,
      averageRating: 4.8,
      reviewCount: 50,
    });
    const extra = piece({
      id: "extra",
      price: 3000,
      versatilityRating: 2,
      averageRating: 3.2,
      reviewCount: 10,
    });
    const total = run([extra, strong], {}, { budgetType: "total", maxBudget: 8000 });
    const perItem = run([extra, strong], {}, { budgetType: "item", maxBudget: 8000 });
    const tight = run([extra, strong], {}, { budgetType: "item", maxBudget: 5000 });
    assert.deepEqual(total.products.map((item) => item.product.id), ["strong"]);
    assert.ok(total.spent <= 8000);
    assert.deepEqual(perItem.products.map((item) => item.product.id).sort(), ["extra", "strong"]);
    assert.deepEqual(tight.products.map((item) => item.product.id), ["extra"]);
    assert.match(total.alternatives[0].tradeoffs.join(" "), /remaining total budget/);
  });

  it("does not treat missing attributes as a match and does not relax hard gates", () => {
    const blank = piece({
      id: "blank",
      occasions: undefined,
      aesthetics: undefined,
      styles: undefined,
      material: undefined,
      colour: undefined,
      colours: undefined,
      comfortRating: undefined,
      averageRating: undefined,
      reviewCount: undefined,
    });
    const known = piece({ id: "known", colour: "black", colours: ["black"], material: "wool" });
    const colour = run([blank, known], {}, { colours: ["black"] });
    assert.deepEqual(colour.products.map((item) => item.product.id), ["known"]);

    const material = run([blank, known], {}, { materials: ["wool"] });
    assert.deepEqual(material.products.map((item) => item.product.id), ["known"]);

    const missingScore = scoreIntentProduct(
      blank,
      interpretShoppingProfile(answers({ aesthetics: ["goth"], contexts: ["university"] })),
      constraints(),
    );
    assert.equal(missingScore.components.context.value, 0);
    assert.equal(missingScore.components.context.missing, true);
    assert.equal(missingScore.components.aesthetic.value, 0);

    const boots = run([known], {}, { categories: ["boots"], maxBudget: 50000 });
    assert.deepEqual(boots.products, []);
    assert.match(boots.message, /No products match/);
    assert.match(boots.message, /category/);
    assert.equal(boots.products.some((item) => item.product.category === "Sneakers"), false);

    const one = run([known, piece({ id: "pricey", price: 9000 })], {}, { maxBudget: 4000 });
    assert.equal(one.products.length, 1);
    assert.match(one.assumptions.join(" "), /not relaxed/);
  });

  it("changes order when the shopping answers change and explains from recorded fields", () => {
    const versatile = run([daily, party], {
      outcome: "repeat-wear",
      role: "versatile",
      contexts: ["university"],
      priorities: ["versatility"],
    });
    const statement = run([daily, party], {
      outcome: "new-look",
      role: "statement",
      contexts: ["parties"],
      aesthetics: ["goth", "artistic"],
      priorities: ["distinctive"],
    });
    assert.notEqual(versatile.products[0].product.id, statement.products[0].product.id);
    const copy = textOf(statement) + statement.assumptions.join(" ");
    assert.doesNotMatch(copy, /sustainab|on sale|% off|customers love|you already own this|image similar|fair price/i);
    assert.match(copy, /synthetic/i);
  });

  it("uses the existing diversity rerank when discovery is open", () => {
    const shared = {
      styles: ["minimalist"],
      occasions: ["everyday"],
      material: "cotton",
      silhouette: "straight",
      comfortRating: 4,
      versatilityRating: 4,
      formalityRating: 2,
      price: 1000,
      averageRating: 4,
      reviewCount: 20,
    };
    const catalogue = [
      piece({ id: "a", category: "Handbags", colour: "black", colours: ["black"], ...shared }),
      piece({ id: "b", category: "Handbags", colour: "black", colours: ["black"], ...shared }),
      piece({ id: "c", category: "Sneakers", colour: "red", colours: ["red"], ...shared }),
    ];
    const result = run(catalogue, {
      trigger: "explore",
      outcome: "unique",
      role: "different",
      discovery: "surprise",
      contexts: ["several"],
      aesthetics: ["open"],
      priorities: ["balance"],
    });
    assert.equal(result.ranking, "diverse");
    assert.deepEqual(result.products.map((item) => item.product.id), ["a", "c", "b"]);
  });

  it("explains a gap-fill result without a wardrobe claim", () => {
    const connector = piece({
      id: "link",
      occasions: ["everyday", "work", "travel"],
      versatilityRating: 4,
    });
    const result = run([connector], {
      trigger: "gap",
      outcome: "completes",
      role: "connector",
    });
    assert.match(textOf(result), /wardrobe was not provided/i);
    assert.doesNotMatch(textOf(result), /completes your wardrobe|you already own/i);
  });

  it("keeps the published catalogue import and the old preference ranker working", () => {
    for (const [id, note] of Object.entries(SYNTHETIC_ANNOTATIONS)) {
      assert.ok(products.some((product) => product.id === id), id);
      if (note.shopCategory) assert.ok(SHOP_CATEGORIES.some((category) => category.id === note.shopCategory));
      for (const tag of note.aesthetics || []) {
        assert.ok(AESTHETICS.some((aesthetic) => aesthetic.id === tag.id));
        assert.ok(tag.relevance > 0 && tag.relevance <= 1);
      }
    }

    const sample = parseJsonCatalogue(readFileSync(new URL("../data/sample-import.json", import.meta.url), "utf8"));
    assert.equal(sample.errors.length, 0);
    const imported = run(sample.products, {}, { maxBudget: 5000 });
    assert.equal(imported.ok, true);
    assert.equal(imported.products[0].product.id, "sample-tee");
    const narrowed = run(sample.products, {}, { categories: ["handbags"], maxBudget: 5000 });
    assert.equal(narrowed.products.length, 0);
    assert.match(narrowed.message, /No products match/);

    const legacy = recommend(products, {
      occasions: ["work"],
      categories: ["Handbags"],
      maxBudget: 15000,
      styles: ["minimalist"],
    });
    assert.equal(legacy.ok, true);
    assert.ok(legacy.products.every((item) => item.product.category === "Handbags"));
    assert.ok(legacy.products.every((item) => item.product.price <= 15000));
  });

  it("filters the published catalogue without breaking stock, jeans, or budget gates", () => {
    const result = run(products, {
      contexts: ["university"],
      aesthetics: ["minimal"],
      priorities: ["versatility"],
    }, { categories: ["jeans", "sneakers"], maxBudget: 8000 });
    assert.equal(result.ok, true);
    assert.ok(result.products.length > 0);
    for (const item of result.products) {
      assert.ok(item.product.price <= 8000);
      assert.equal(item.product.availability, "in_stock");
      assert.ok(["jeans", "sneakers"].includes(item.product.shopCategory));
    }
    const coats = run(products, {}, { categories: ["coats"], maxBudget: 20000 });
    assert.equal(coats.products.some((item) => item.product.id === "p24"), false);
  });
});

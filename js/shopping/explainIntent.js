import { formatInr, formatList } from "../format.js";
import { contentSimilarity } from "../similarity.js";
import { aestheticLabel, contextLabel } from "./profile.js";

function componentValue(item, key) {
  const value = item?.components?.[key]?.value;
  return Number.isFinite(value) ? value : 0;
}

/**
 * Sentences use recorded components and catalogue fields.
 * Missing data is named. Discounts, lifespan tests, and owned clothes are not invented.
 */
export function buildIntentExplanation(item, context) {
  const { profile, constraints, ranked } = context;
  const product = item.product;
  const reasons = [];
  const tradeoffs = [];
  const aesthetic = item.components.aesthetic;
  const occasion = item.components.context;
  const top = ranked[0];

  const aestheticStrong = aesthetic?.active && aesthetic.matched?.length > 0 && aesthetic.value >= 0.45;
  const severalSettings = occasion?.active && occasion.matched?.length >= 2 && occasion.value >= 0.45;
  if (aestheticStrong && severalSettings) {
    reasons.push("Ranked highly because it fits your selected aesthetic and works for several of your intended settings.");
  } else {
    if (aesthetic?.active && aesthetic.matched?.length > 0) {
      const names = aesthetic.matched.map((match) => aestheticLabel(match.id).replace(/\.$/, ""));
      reasons.push(`Aesthetic tags include ${formatList(names)}.`);
      if (aesthetic.matched.length < profile.aestheticPreferences.length) {
        reasons.push("It matches some of the aesthetics you selected, not all of them.");
      }
    }
    if (occasion?.active && occasion.matched?.length > 0) {
      const names = occasion.matched.map((id) => contextLabel(id).replace(/\.$/, ""));
      reasons.push(`Catalogue occasions cover ${formatList(names)}.`);
    }
  }

  if (aesthetic?.active && aesthetic.missing) {
    tradeoffs.push("This product has no aesthetic tags, so it was not treated as a match.");
  }
  if (occasion?.active && occasion.missing) {
    tradeoffs.push("Occasions are not recorded, so setting fit scored 0.");
  } else if (occasion?.active && occasion.matched?.length === 0) {
    tradeoffs.push("None of the recorded occasions cover the settings you selected.");
  }
  if (occasion?.formalityMissing && occasion.matched?.length > 0) {
    tradeoffs.push("Formality is not recorded, so it was not used to confirm the setting.");
  }

  if (profile.wardrobeRole === "connector") {
    const count = Array.isArray(product.occasions) ? product.occasions.length : 0;
    if (count >= 2) {
      reasons.push("More than one catalogue occasion is listed. That is only a stand-in for a connecting piece.");
    }
    tradeoffs.push("Your existing wardrobe was not provided, so outfit compatibility is uncertain.");
  }
  if (profile.wardrobeRole === "different" || profile.purchaseTrigger === "gap" || profile.purchaseTrigger === "replace") {
    if (!tradeoffs.some((line) => line.includes("wardrobe was not provided"))) {
      tradeoffs.push("Your existing wardrobe was not provided, so this does not claim to know what you already own.");
    }
  }
  if (profile.wardrobeRole === "complete-look" && occasion?.matched?.length > 0) {
    reasons.push("Judged as a complete look for the settings you named.");
  }
  if ((profile.shoppingMission === "occasion" || profile.wardrobeRole === "complete-look") && !constraints.dressCode) {
    tradeoffs.push("No dress code was given, so none was inferred.");
  }

  if (item.components.versatility?.active && item.components.versatility.missing) {
    tradeoffs.push("Versatility is not recorded, so that part of the score is 0.");
  }
  if (item.components.comfort?.active && item.components.comfort.missing) {
    tradeoffs.push("Comfort is not recorded, so that part of the score is 0.");
  }

  const quality = item.components.quality;
  const materialMissing = typeof product.material !== "string" || product.material.trim() === "";
  if (quality?.active && quality.missing && materialMissing && occasion?.matched?.length > 0) {
    tradeoffs.push("This fits your budget and occasion, but the catalogue does not contain enough information to verify material quality.");
  } else if (quality?.active && quality.missing) {
    tradeoffs.push("No usable synthetic rating is recorded, so quality could not be checked.");
  } else if (quality?.active && quality.smoothed != null && quality.reviewCount != null) {
    reasons.push(
      `Synthetic review estimate ${quality.smoothed.toFixed(2)} from ${quality.reviewCount} reviews. Not verified customer sentiment, and not a lifespan test.`,
    );
  }

  if (item.components.value?.active) {
    if (item.components.value.missingQuality) {
      tradeoffs.push("Value is limited because no usable synthetic rating is recorded. A lower price was not treated as proof of a good deal.");
    } else {
      reasons.push("Value combines the synthetic review estimate with room under your budget. No discount or price history is recorded.");
    }
  }

  if (profile.priorityTradeoffs.includes("fit")) {
    tradeoffs.push("A flattering fit was one of your priorities. This catalogue cannot score that.");
  }

  if (profile.versatilityPreference >= 0.5 && componentValue(item, "versatility") >= 0.6) {
    const lessDistinctive = ranked.some((other) => (
      other.product.id !== product.id
      && componentValue(other, "distinctiveness") > componentValue(item, "distinctiveness") + 0.15
    ));
    if (lessDistinctive && componentValue(item, "distinctiveness") < 0.45) {
      tradeoffs.push("A stronger choice for your versatility priority, although it is less distinctive than your other options.");
    }
  }

  if (top && top.product.id !== product.id) {
    const similarity = contentSimilarity(product, top.product).score;
    const moreDistinctive = componentValue(item, "distinctiveness") > componentValue(top, "distinctiveness");
    const lessVersatile = componentValue(item, "versatility") < componentValue(top, "versatility")
      || componentValue(item, "wardrobeRole") < componentValue(top, "wardrobeRole");
    if (similarity < 0.8 && moreDistinctive && lessVersatile && componentValue(item, "distinctiveness") > 0) {
      reasons.push("This is a more distinctive alternative, but it is less versatile than your top-ranked item.");
    }
  }

  if (Array.isArray(item.constraintNotes)) {
    for (const note of item.constraintNotes) reasons.push(note);
  }

  if (!context.held) {
    const budgetKind = constraints.budgetType === "total" ? "total budget" : "per-item budget";
    reasons.push(`Priced at ${formatInr(product.price)}, within the ${formatInr(constraints.maxBudget)} ${budgetKind}.`);
  }

  if (product.annotationSource === "synthetic" && (aesthetic?.matched?.length > 0 || constraints.categories.length > 0)) {
    reasons.push("Category and aesthetic tags on this row are synthetic labels for the demo, not a retailer feed.");
  }

  return { reasons, tradeoffs };
}

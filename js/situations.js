import { SITUATIONS } from "./weights.js";

const DEFAULTS = {
  college: {
    occasions: ["everyday"],
    emphasis: "comfort",
    note: "Suggested for college: everyday wear, with comfort emphasised. Comfort and versatility matter for daily wear. You can change these.",
  },
  office: {
    occasions: ["work"],
    emphasis: null,
    note: "Suggested for the office: the work occasion. You can change this.",
  },
  evening: {
    occasions: ["evening"],
    emphasis: null,
    note: "Suggested for evening: the evening occasion. You can change this.",
  },
  travel: {
    occasions: ["travel", "everyday"],
    emphasis: "comfort",
    note: "Suggested for travel: travel and everyday, with comfort emphasised. You can change these.",
  },
  wedding: {
    occasions: ["special", "evening"],
    emphasis: null,
    note: "Suggested for a wedding: special occasion and evening. You can change these.",
  },
};

/** Suggested, editable defaults. Custom and unknown situations fill nothing. */
export function situationDefaults(situation) {
  const key = typeof situation === "string" ? situation.trim().toLowerCase() : "";
  if (!SITUATIONS.includes(key) || key === "custom") return null;
  const found = DEFAULTS[key];
  if (!found) return null;
  return {
    situation: key,
    occasions: [...found.occasions],
    emphasis: found.emphasis,
    note: found.note,
  };
}

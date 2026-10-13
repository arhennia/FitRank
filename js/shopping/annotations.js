/**
 * Synthetic shopping labels for the published catalogue.
 *
 * These are not retailer tags. shopCategory is a reading of the fictional
 * product name. aesthetics are assigned only where the existing style,
 * material, and description already point that way, and relevance is not
 * uniform. Products omitted here stay untagged.
 */

export const SYNTHETIC_ANNOTATIONS = {
  p01: { shopCategory: "handbags" },
  p02: { shopCategory: "handbags", aesthetics: [{ id: "minimal", relevance: 0.72 }] },
  p03: { shopCategory: "handbags", aesthetics: [{ id: "artistic", relevance: 0.48 }] },
  p04: { shopCategory: "handbags", aesthetics: [{ id: "minimal", relevance: 0.8 }] },
  p05: { shopCategory: "coats", aesthetics: [{ id: "dark-academia", relevance: 0.62 }, { id: "preppy", relevance: 0.5 }] },
  p06: { shopCategory: "coats", aesthetics: [{ id: "artistic", relevance: 0.4 }] },
  p07: { shopCategory: "jackets", aesthetics: [{ id: "minimal", relevance: 0.66 }] },
  p08: { shopCategory: "dresses", aesthetics: [{ id: "preppy", relevance: 0.66 }, { id: "minimal", relevance: 0.4 }] },
  p09: { shopCategory: "dresses", aesthetics: [{ id: "coquette", relevance: 0.86 }, { id: "artistic", relevance: 0.62 }] },
  p10: { shopCategory: "skirts", aesthetics: [{ id: "preppy", relevance: 0.58 }] },
  p11: { shopCategory: "heels", aesthetics: [{ id: "preppy", relevance: 0.6 }] },
  p12: { shopCategory: "loafers", aesthetics: [{ id: "minimal", relevance: 0.7 }, { id: "preppy", relevance: 0.55 }] },
  p13: { shopCategory: "flats", aesthetics: [{ id: "minimal", relevance: 0.64 }] },
  p15: { shopCategory: "handbags", aesthetics: [{ id: "minimal", relevance: 0.5 }] },
  p16: { shopCategory: "handbags" },
  p17: { shopCategory: "handbags" },
  p18: { shopCategory: "handbags" },
  p19: { shopCategory: "handbags", aesthetics: [{ id: "streetwear", relevance: 0.42 }, { id: "minimal", relevance: 0.5 }] },
  p20: { shopCategory: "handbags", aesthetics: [{ id: "minimal", relevance: 0.7 }] },
  p21: { shopCategory: "handbags", aesthetics: [{ id: "artistic", relevance: 0.36 }] },
  p22: { shopCategory: "shirts", aesthetics: [{ id: "preppy", relevance: 0.78 }, { id: "dark-academia", relevance: 0.42 }] },
  p23: { shopCategory: "jewellery", aesthetics: [{ id: "artistic", relevance: 0.55 }] },
  p24: { shopCategory: "coats", aesthetics: [{ id: "dark-academia", relevance: 0.58 }, { id: "vintage", relevance: 0.34 }] },
  p25: { shopCategory: "tops", aesthetics: [{ id: "minimal", relevance: 0.84 }] },
  p26: { shopCategory: "shirts", aesthetics: [{ id: "preppy", relevance: 0.74 }] },
  p27: { shopCategory: "knitwear", aesthetics: [{ id: "preppy", relevance: 0.46 }, { id: "minimal", relevance: 0.4 }] },
  p28: { shopCategory: "tops", aesthetics: [{ id: "minimal", relevance: 0.76 }] },
  p29: { shopCategory: "shirts", aesthetics: [{ id: "artistic", relevance: 0.8 }, { id: "coquette", relevance: 0.7 }] },
  p30: { shopCategory: "jackets", aesthetics: [{ id: "minimal", relevance: 0.52 }, { id: "vintage", relevance: 0.28 }] },
  p31: { shopCategory: "jackets", aesthetics: [{ id: "minimal", relevance: 0.6 }] },
  p32: { shopCategory: "dresses", aesthetics: [{ id: "preppy", relevance: 0.52 }] },
  p33: { shopCategory: "dresses", aesthetics: [{ id: "minimal", relevance: 0.68 }] },
  p34: { shopCategory: "skirts", aesthetics: [{ id: "artistic", relevance: 0.88 }] },
  p35: { shopCategory: "knitwear", aesthetics: [{ id: "minimal", relevance: 0.58 }] },
  p36: { shopCategory: "tops", aesthetics: [{ id: "artistic", relevance: 0.8 }] },
  p37: { shopCategory: "trousers", aesthetics: [{ id: "minimal", relevance: 0.62 }, { id: "preppy", relevance: 0.48 }] },
  p38: { shopCategory: "sneakers", aesthetics: [{ id: "minimal", relevance: 0.74 }, { id: "streetwear", relevance: 0.48 }] },
  p39: { shopCategory: "sneakers", aesthetics: [{ id: "minimal", relevance: 0.7 }, { id: "preppy", relevance: 0.4 }] },
  p40: { shopCategory: "trousers", aesthetics: [{ id: "dark-academia", relevance: 0.7 }, { id: "preppy", relevance: 0.48 }] },
  p41: { shopCategory: "trousers", aesthetics: [{ id: "minimal", relevance: 0.66 }] },
  p42: { shopCategory: "jeans", aesthetics: [{ id: "minimal", relevance: 0.4 }] },
  p43: { shopCategory: "trousers", aesthetics: [{ id: "preppy", relevance: 0.64 }] },
  p44: { shopCategory: "trousers", aesthetics: [{ id: "minimal", relevance: 0.58 }] },
  p45: { shopCategory: "trousers", aesthetics: [{ id: "artistic", relevance: 0.34 }] },
  p46: { shopCategory: "belts", aesthetics: [{ id: "minimal", relevance: 0.5 }, { id: "preppy", relevance: 0.4 }] },
  p47: { shopCategory: "jewellery", aesthetics: [{ id: "artistic", relevance: 0.72 }] },
  p49: { shopCategory: "jewellery", aesthetics: [{ id: "artistic", relevance: 0.46 }] },
  p50: { shopCategory: "sneakers", aesthetics: [{ id: "streetwear", relevance: 0.4 }] },
  p51: { shopCategory: "sneakers", aesthetics: [{ id: "minimal", relevance: 0.62 }] },
  p52: { shopCategory: "loafers", aesthetics: [{ id: "preppy", relevance: 0.6 }, { id: "minimal", relevance: 0.55 }] },
  p53: { shopCategory: "loafers", aesthetics: [{ id: "preppy", relevance: 0.66 }, { id: "minimal", relevance: 0.6 }] },
  p54: { shopCategory: "loafers", aesthetics: [{ id: "minimal", relevance: 0.52 }] },
  p55: { shopCategory: "flats", aesthetics: [{ id: "artistic", relevance: 0.84 }] },
  p56: { shopCategory: "heels", aesthetics: [{ id: "preppy", relevance: 0.5 }] },
  p57: { shopCategory: "heels", aesthetics: [{ id: "minimal", relevance: 0.48 }] },
  p58: { shopCategory: "heels", aesthetics: [{ id: "coquette", relevance: 0.78 }, { id: "goth", relevance: 0.58 }] },
  p59: { shopCategory: "heels", aesthetics: [{ id: "preppy", relevance: 0.7 }] },
  p60: { shopCategory: "sneakers", aesthetics: [{ id: "streetwear", relevance: 0.82 }] },
};

/**
 * Copy a product and fill only missing shopping fields.
 * A fixture that already sets aesthetics or shopCategory keeps those values.
 */
export function withShoppingAnnotations(product) {
  if (!product || typeof product !== "object") return product;
  const extra = SYNTHETIC_ANNOTATIONS[product.id];
  if (!extra) return product;
  const merged = { ...product, annotationSource: "synthetic" };
  for (const [key, value] of Object.entries(extra)) {
    if (merged[key] == null) merged[key] = value;
  }
  return merged;
}

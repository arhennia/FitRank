/** Arm list implied by the pre-registered tuning spec. This file does not score anything. */

export function buildArms(spec) {
  const arms = [];
  for (const preprocess of spec.preprocessOrder) {
    arms.push({
      id: `image__${preprocess}`,
      task: "image",
      selectable: false,
      preprocess,
      promptTemplate: null,
      fusion: "zscore",
      alpha: null,
      lambda: 1,
      pixelVariant: null,
      signals: ["img"],
      weights: { img: 1 },
      k: spec.k,
      mmrPool: spec.mmrPool,
    });
  }
  for (const preprocess of spec.preprocessOrder) {
    for (const promptTemplate of spec.templateOrder) {
      arms.push({
        id: `text__${preprocess}__${promptTemplate}`,
        task: "text",
        selectable: false,
        preprocess,
        promptTemplate,
        fusion: "zscore",
        alpha: null,
        lambda: 1,
        pixelVariant: null,
        signals: ["txt"],
        weights: { txt: 1 },
        k: spec.k,
        mmrPool: spec.mmrPool,
      });
    }
  }
  for (const pixelVariant of ["raw", "mean-centered"]) {
    arms.push({
      id: `pixel__${pixelVariant}`,
      task: "pixel",
      selectable: false,
      preprocess: null,
      promptTemplate: null,
      fusion: "zscore",
      alpha: null,
      lambda: 1,
      pixelVariant,
      signals: ["pixel"],
      weights: { pixel: 1 },
      k: spec.k,
      mmrPool: spec.mmrPool,
    });
  }
  for (const promptTemplate of spec.templateOrder) {
    arms.push({
      id: `lexical__${promptTemplate}`,
      task: "lexical",
      selectable: false,
      preprocess: null,
      promptTemplate,
      fusion: "zscore",
      alpha: null,
      lambda: 1,
      pixelVariant: null,
      signals: ["lexical"],
      weights: { lexical: 1 },
      k: spec.k,
      mmrPool: spec.mmrPool,
    });
  }
  for (const preprocess of spec.preprocessOrder) {
    for (const promptTemplate of spec.templateOrder) {
      for (const fusion of spec.fusions) {
        for (const alpha of spec.alphas) {
          arms.push({
            id: `hybrid__${preprocess}__${promptTemplate}__${fusion}__a${alpha}`,
            task: "hybrid",
            selectable: true,
            preprocess,
            promptTemplate,
            fusion,
            alpha,
            lambda: 1,
            pixelVariant: null,
            signals: ["img", "txt"],
            weights: { img: alpha, txt: 1 - alpha },
            k: spec.k,
            mmrPool: spec.mmrPool,
          });
        }
      }
    }
  }
  return arms;
}

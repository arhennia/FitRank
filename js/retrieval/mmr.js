/**
 * MMR(d) = lambda * rel_minmax - (1 - lambda) * max cosine to an already selected item.
 * An item with no usable embedding gets diversity term 0 and is flagged.
 * lambda 1 follows score, then id.
 */
import { cosine } from "../vector.js";

function usableVector(vectors, id) {
  if (!vectors || typeof vectors.get !== "function") return null;
  const vector = vectors.get(id);
  if (!vector || typeof vector.length !== "number" || vector.length === 0) return null;
  for (let index = 0; index < vector.length; index += 1) {
    if (!Number.isFinite(vector[index])) return null;
  }
  return vector;
}

export function minMaxRelevance(scores) {
  const finite = scores.filter((score) => typeof score === "number" && Number.isFinite(score));
  if (finite.length === 0) return scores.map(() => null);
  let min = finite[0];
  let max = finite[0];
  for (const score of finite) {
    if (score < min) min = score;
    if (score > max) max = score;
  }
  return scores.map((score) => {
    if (typeof score !== "number" || !Number.isFinite(score)) return null;
    if (max === min) return 1;
    return (score - min) / (max - min);
  });
}

export function plainRank(items) {
  return [...(items || [])].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return String(left.id).localeCompare(String(right.id));
  });
}

function better(left, right) {
  if (left.mmr !== right.mmr) return left.mmr > right.mmr;
  if (left.rel !== right.rel) return left.rel > right.rel;
  return String(left.id).localeCompare(String(right.id)) < 0;
}

export function mmrSelect(items, vectors, lambda) {
  if (typeof lambda !== "number" || !Number.isFinite(lambda) || lambda < 0 || lambda > 1) {
    throw new Error("lambda must be between 0 and 1");
  }
  const list = items || [];
  for (const item of list) {
    if (typeof item?.score !== "number" || !Number.isFinite(item.score)) {
      throw new Error(`Item ${item?.id} has no finite relevance score`);
    }
  }
  const relevance = minMaxRelevance(list.map((item) => item.score));
  const remaining = list.map((item, index) => ({
    id: item.id,
    score: item.score,
    rel: relevance[index],
    missingEmbedding: usableVector(vectors, item.id) == null,
  }));
  const selected = [];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let best = null;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      let diversity = 0;
      if (!candidate.missingEmbedding) {
        const vector = usableVector(vectors, candidate.id);
        for (const chosen of selected) {
          if (chosen.missingEmbedding) continue;
          const similarity = cosine(vector, usableVector(vectors, chosen.id));
          if (similarity != null && similarity > diversity) diversity = similarity;
        }
      }
      const mmr = lambda * candidate.rel - (1 - lambda) * diversity;
      const key = { mmr, rel: candidate.rel, id: candidate.id, diversity };
      if (best == null || better(key, best)) {
        best = key;
        bestIndex = index;
      }
    }
    const chosen = remaining.splice(bestIndex, 1)[0];
    selected.push({
      id: chosen.id,
      score: chosen.score,
      rel: chosen.rel,
      mmr: best.mmr,
      diversity: best.diversity,
      missingEmbedding: chosen.missingEmbedding,
    });
  }
  return selected;
}

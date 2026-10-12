# FitRank

FitRank 2.0 is an explainable fashion decision engine. You describe a shopping situation, hard constraints, and what you are willing to trade off. The app filters a local catalogue of 60 fictional products, scores what remains, and explains each result from attributes on the product.

It is a decision-support demo. It does not sell anything, store accounts, or call an external API. Brands, prices, ratings, and review counts are illustrative synthetic data, not shop listings.

`PLAN.md` is the source of truth for the formulas. This file matches the code that is actually running.

## Naming limits

- Similarity means related attributes. Two black work totes can be stylistically similar and still differ in material and construction. FitRank does not call them duplicates.
- Budget fit blends the smoothed review estimate with room under your budget. The label is "Best budget fit". It does not say whether a price is fair.
- Weighted similarity, Bayesian smoothing, and MMR are transparent formulas. They are not a trained model and not deep learning.

## Features

- Preference discovery from a shopping situation, with editable defaults
- Hard constraints for budget, category, availability, and size, reported when a search is empty
- A deterministic hybrid score from 0 to 100, with a per-component breakdown
- Content similarity to a reference item, and a short list of similar products
- Bayesian smoothing of synthetic review aggregates
- Relevance-only ranking and a diversity-aware MMR rerank
- Explanations, trade-offs, and unique decision labels
- Side-by-side comparison of up to three products
- Session-only "More like this" and "Less like this"
- Optional JSON or CSV catalogue import for the current session
- A synthetic evaluation runner with hand-written labels

## Architecture

The page is HTML, CSS, and vanilla JavaScript. Node serves the files and runs the tests. There is no database and no installed library. The engine does not import the page.

```text
index.html
css/styles.css
js/catalogue.js         60 synthetic products
js/catalogueIO.js       validation and JSON/CSV import
js/weights.js           weights, vocabularies, constants
js/validate.js          preference checks
js/filter.js            well-formed rows and gate order
js/candidates.js        generateCandidates
js/situations.js        editable situation defaults
js/quality.js           Bayesian smoothing
js/similarity.js        weighted content similarity
js/score.js             hybrid score
js/baseline.js          frozen v1 scorer, used only for evaluation
js/rank.js              relevance order and MMR
js/labels.js            unique decision labels
js/explain.js           reasons and trade-offs
js/recommend.js         the pipeline
js/compare.js           three-product limit
js/metrics.js           Precision@K, NDCG@K, coverage, diversity, violations
js/evaluate.js          baseline versus hybrid on shared candidates, including runtime
js/benchmark.js         exhaustive candidate-generation timings
js/format.js            display helpers
js/main.js              form and view events
server.js               static file server
test/                  engine tests and hand-labelled scenarios
data/sample-import.json
```

Open the app through the server. Loading `index.html` directly from disk blocks ES module imports in most browsers.

## Pipeline

```text
situation defaults (the page only; you can edit them)
  -> validatePreferences
  -> generateCandidates          hard gates, no points
  -> drop the reference item     it is not ranked against itself
  -> scoreProduct                shared active weights
  -> rankByRelevance or rerankMMR
  -> assignLabels
  -> buildExplanation
```

At this catalogue size, candidate generation is an exhaustive scan. It is not an index.

Hard gates, in order: a well-formed id, name, category, and finite price; price at or under the budget; a selected category, when any are selected; `in_stock` when that box is checked (the default); a selected size, when it is not "any". A missing availability or size fails the corresponding gate. An empty result names the gate that removed the most rows and starts with "No products match". Hard gates are never relaxed to fill the list.

## Scoring

Base weights in `js/weights.js` sum to 100:

| Component | Weight | How it is scored |
| --- | --- | --- |
| Occasion | 24 | 0.7 times occasion overlap, plus 0.3 times formality fit |
| Style | 16 | Overlap with selected styles. Any disliked style scores 0 |
| Colour | 8 | 0 if disliked or missing. 1 on a preferred match |
| Comfort | 14 | Comfort rating / 5, or 0 when missing |
| Versatility | 14 | Versatility rating / 5, otherwise occasions / 4, capped at 1 |
| Quality | 12 | (smoothed rating − 1) / 4, or 0 when the rating is unusable |
| Budget fit | 12 | Average of the quality component and budget headroom |

Optional weights, included only when they apply: similarity 16, material 10, statement 10. Emphasis can raise comfort, versatility, quality, budget fit, style, or colour. Flexible preferences halve style and colour and raise comfort and versatility. A legacy priority is still accepted. Inactive components leave both the numerator and the denominator.

```text
score = round(100 * sum(weight * value) / sum(active weights))
```

Missing attributes score 0. They do not score 1. Hard constraints are not scored. A category you select is a gate only. The frozen v1 formula, which gave category survivors a full category component, remains in `js/baseline.js` so the evaluation can compare the two scorers on the same candidate set.

Formality targets are everyday 2, travel 2, work 4, evening 5, and special 5. Fit is `1 - |rating - target| / 4`. The explanation mentions formality only when a rating exists and the fit is at least 0.75. A comfort rating is described as supporting a comfort emphasis only when that component is at least 0.6.

Equal scores are ordered by product id.

## Similarity, reviews, and diversity

Content similarity weights sum to 1: category 0.35, style 0.20, colour 0.10, material 0.10, silhouette 0.10, occasion 0.10, comfort 0.05. Multi-value features use Jaccard. A missing or empty feature scores 0 and its weight stays in the denominator. Similar products use the same hard gates and exclude the source item.

Review smoothing is `(n / (n + 10)) * rating + (10 / (n + 10)) * prior`. The prior is the review-count-weighted mean of valid catalogue ratings, or 3.5 when that mean cannot be computed. Quality cannot put a product back through a failed gate.

MMR uses λ = 0.7:

```text
λ * (score / 100) - (1 - λ) * max similarity to the selected set
```

λ = 1 is the relevance-only order. The penalty is style redundancy, not identity. Ties prefer the higher relevance score, then the id.

Labels are unique: Best overall match, Best budget fit, Most versatile, and Closest to the selected item when a reference resolved and similarity is above 0. A tie gets no exclusive label. The highest raw rating is not a label.

"More like this" and "Less like this" change the current search only. FitRank does not learn from past shoppers.

## Synthetic evaluation

K = 5. Labels in `test/fixtures/scenarios.js` were written from attributes. They do not import the ranker. Both strategies share `generateCandidates`. The baseline uses the frozen v1 score and relevance order. The hybrid uses the 2.0 score and MMR at 0.7.

An empty list leaves precision, NDCG, intra-list diversity, and the violation rate unset. An empty list is not a constraint violation. Coverage is the share of catalogue ids that appear anywhere in the full recommendation lists, not only in the top 5.

Recorded on 12 Oct 2026:

| Scenario | Baseline P@5 | Hybrid P@5 | Baseline NDCG | Hybrid NDCG | Baseline diversity | Hybrid diversity |
| --- | --- | --- | --- | --- | --- | --- |
| Strict budget and category | 0.600 | 0.600 | 1.000 | 1.000 | 0.435 | 0.435 |
| Comfort and versatility | 0.800 | 0.400 | 0.853 | 0.692 | 0.738 | 0.795 |
| Similar to a reference loafer | 0.800 | 0.800 | 0.758 | 0.963 | 0.447 | 0.447 |
| Conflicting soft preferences | 0.800 | 0.600 | 0.761 | 0.610 | 0.728 | 0.713 |
| Few eligible products | 0.200 | 0.200 | 1.000 | 1.000 | — | — |
| No eligible products | — | — | — | — | — | — |

Catalogue coverage is 0.983 for both. Broad scenarios return almost every in-stock row, and MMR only reorders that set, so coverage cannot show a diversity gain. Intra-list diversity of the top 5 is the comparison that can move. On the comfort scenario, diversity rises while precision and NDCG fall. On conflicting tastes, diversity falls slightly as well. Hard-constraint violations are 0 wherever a list is non-empty. These figures are not a user study and do not measure satisfaction.

One timing of the same run, in milliseconds. Hybrid time includes explanations and labels. Baseline time is the frozen v1 score plus the relevance sort. A later page load measured about 2.6 ms and 331 ms for the two totals. Runtime is not a quality score.

| Scenario | Baseline ms | Hybrid ms |
| --- | --- | --- |
| Strict budget and category | 1.11 | 32.08 |
| Comfort and versatility | 0.67 | 207.55 |
| Similar to a reference loafer | 0.16 | 1.55 |
| Conflicting soft preferences | 0.69 | 165.92 |
| Few eligible products | 0.07 | 0.34 |
| No eligible products | 0.03 | 0.39 |
| Total | 2.73 | 407.83 |

The slow hybrid rows are the broad searches. They score a large candidate set, rerank it with MMR, and explain every row.

### Candidate generation

`runCandidateBenchmark()` times the exhaustive scan. The shopper is fixed: budget ₹8,000, categories Handbags and Sneakers, in stock, size `one-size`. The 1,000-row and 10,000-row catalogues are deterministic synthetic fixtures. Returned rows that still fail a hard gate are violations. There were none.

| Catalogue | Rows | Runtime | Candidates | Violations |
| --- | --- | --- | --- | --- |
| Published | 60 | 0.61 ms | 7 | 0 |
| Synthetic | 1,000 | 1.85 ms | 28 | 0 |
| Synthetic | 10,000 | 13.06 ms | 280 | 0 |

The exhaustive scan stays the baseline. A later retriever would be compared with these counts, not substituted for them.

## Preparation outside the page

`data/listings/` is a fictional multi-seller catalogue with hand labels: similar style, probable duplicate, attribute conflict, and an unrelated control. Nothing in the ranker reads it.

`prototypes/moodboard/` is the original 40-image CLIP trial. It is not imported by the shopper form. On 12 Oct 2026, image-to-image Precision@3 was 0.500 against a chance level of 0.100. Setup is in `prototypes/moodboard/README.md`.

The retrieval experiment is separate. It embeds 1,200 Fashion-MNIST test images with the same cached CLIP model: 1,000 in the index, 100 validation queries, and 100 test queries, with no shared source image. The protocol is `experiments/PROTOCOL.md`. Official numbers are the test split in `experiments/retrieval-results.json`. Validation was stored and was not used to change weights or queries. Class match is the label. It does not measure a shopper.

On the test images, Precision@10 was 0.094 for a seeded random order, 0.684 for pixel cosine, and 0.721 for CLIP. The hybrid score with no text query matched CLIP. Recall@10 was 0.072 for CLIP, and it cannot exceed 0.100 because each class has 100 index images. Shirts were weak (CLIP 0.340). On coats, pixel cosine (0.580) beat CLIP (0.510). A text query that contains the class name favoured lexical overlap (0.900) over CLIP (0.630). Frozen paraphrases tied on precision at 0.800; CLIP's NDCG@10 was 0.815 and lexical overlap's was 0.800. Combining an image with its paraphrase scored 0.766, below text alone at 0.800. Diversity reranking of the top 50 lowered that precision from 0.766 to 0.730 and raised pixel diversity from 0.188 to 0.217. Ranking 1,000 cached vectors took about 5 ms. The first embedding pass took 49.3 ms per image. A later pass reused all 1,200 vectors and did not download weights.

Duplicate decisions on the 13 hand-labelled pairs do not read listing descriptions or `itemId`. Exact name match plus the declared fields scored 12 of 13. The miss is the loafer pair whose names differ. CLIP name cosine at the frozen cutoff of 0.90 scored 10 of 13, because similar-style names sat above that cutoff. Thirteen pairs are the whole set.

```bash
npm run prepare-mnist
npm run embed-retrieval
npm run evaluate-retrieval
```

The page can search the index through `POST /api/retrieve` after `npm start`. That route is absent until the server process is restarted onto this code. Budget, size, and stock requests fail because those fields are not in the image set.

## Setup and run

Requires Node.js 18 or newer. The page has no `npm install` step. The moodboard trial has its own folder and its own install.

```bash
npm start
```

Or, without npm:

```bash
node server.js
```

Then open [http://127.0.0.1:5173](http://127.0.0.1:5173). Set `PORT` to use another port.

## Testing

```bash
npm test
```

Or:

```bash
node --test
```

On 12 Oct 2026 the suite reported 48 passed, 0 failed. The tests cover the v1 behaviours that still hold, hard gates, renormalised scoring, budget-fit wording, catalogue validation, JSON and CSV import, similarity, Bayesian smoothing, MMR, labels, the evaluation metrics, the candidate-generation sizes, the hand-labelled listing pairs, and the moodboard label file. The CLIP weights are not downloaded by `npm test`.

## Limitations

- The catalogue is 60 hand-written products. It is not a retailer feed.
- Scores are transparent rules. They are not learned from shoppers.
- Import is session-only. A failed file, or a file with no valid rows, keeps the built-in catalogue. Missing availability is not filled in as in stock.
- There is no account, saved search, cart, or checkout.
- The shopper form does not call a model. Image and text search is a separate Fashion-MNIST index. Its class-match scores are in `experiments/retrieval-results.json` and are not real-world recommendation scores.
- Open aesthetic tags and a REST API are specified in `PLAN.md` and are not built.

`PROGRESS.md` records the latest test run and the browser check.

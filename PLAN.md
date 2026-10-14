# FitRank plan

This file is the source of truth for FitRank 2.0 and for the active 2.1 engineering plan. If a later change conflicts with this document, update this file first and record why in `PROGRESS.md`.

The 2.0 definition of done is unchanged. The section "FitRank 2.1" records what is already built. The active execution plan is "FitRank 2.1 revised plan (v2)". The section "Engineering plan v1" is the Fashion-MNIST-first sprint adopted on 12 Oct 2026. Where v1 and v2 disagree, v2 governs. Measured facts are in `docs/AUDIT.md`, and task status is in `docs/plan/TASKS.md`.

## Project goal

FitRank helps a shopper turn a situation into preferences, then compare a local catalogue on suitability, comfort, versatility, style, review quality, and budget fit. It explains every recommendation from the attributes and score components that produced it.

The intended user is someone who knows the occasion or the kind of item they like, but not which catalogue row is the best trade-off. The product is a decision-support demo for a technical interview. It is not a shop.

2.0 uses weighted content similarity, Bayesian smoothing, and maximal marginal relevance. Those are deterministic algorithms. They are not a trained model, and this document does not call them deep learning.

## Scope and explicit exclusions

In scope for 2.0:

- About 60 fictional products with one listing each
- Explicit candidate generation by hard constraints
- Deterministic hybrid scoring, relevance ranking, and MMR reranking
- Content similarity to a selected product
- Bayesian smoothing of synthetic rating aggregates
- Explanations, unique decision labels, and a three-product comparison
- Session-only feedback that edits the current preferences
- A synthetic evaluation harness, including strategy runtime
- An exhaustive candidate-generation benchmark at catalogue sizes 60, 1,000, and 10,000
- Local JSON or CSV import for the current session
- This plan, `PROGRESS.md`, and `README.md`

Out of scope for the 2.0 page, specified as 2.1:

- Image or text embeddings and moodboard search in the interface. A separate local trial can live in `prototypes/moodboard/` without being imported by the page.
- Cross-listing duplicate detection and attribute-conflict flags. Hand-labelled pairs can live in `data/listings/` without a detector.
- Open aesthetic tags beyond the closed style list
- A REST API
- A database, accounts, payments, or a retailer feed

Also excluded from every version until explicitly built: scraping, paid APIs, external models, authentication, and any claim that synthetic ratings are real customer research.

## Naming limits

- Similarity means related attributes. It does not mean the same item, and it does not mean two listings conflict. The two black structured totes differ in material. The interface calls them similar alternatives.
- `budgetFit` blends the review estimate with room under the user's budget. The label is "Best budget fit". It is not a fair-price or market-value judgement.
- Duplicate, same item, and conflicting listing are reserved for 2.1. Identifier checks in the importer only reject a repeated `id`.

## Architecture

The app is static HTML, CSS, and vanilla JavaScript. Node serves the files and runs tests. There are no installed libraries. The browser and the tests import the same ES modules.

```text
index.html
css/styles.css
js/catalogue.js       synthetic products
js/weights.js         weights, vocabularies, lambda, smoothing strength
js/format.js          INR display
js/situations.js      editable situation defaults
js/validate.js        preference checks
js/filter.js          gate predicates
js/candidates.js      generateCandidates
js/baseline.js        frozen v1 scorer
js/quality.js         Bayesian smoothing
js/similarity.js      weighted content similarity
js/score.js           hybrid components and the 0–100 total
js/rank.js            relevance sort and MMR
js/labels.js          unique decision labels
js/explain.js         reasons and trade-offs
js/recommend.js       the pipeline
js/compare.js         selection cap of three
js/catalogueIO.js     validation and JSON/CSV import
js/metrics.js         precision, NDCG, coverage, diversity, violations
js/evaluate.js        scenario runner, including runtime
js/benchmark.js       exhaustive candidate-generation timings
js/main.js            form, results, comparison, evaluation
server.js
test/engine.test.js
test/benchmark.test.js
test/listings.test.js
test/fixtures/scenarios.js
data/sample-import.json
data/listings/        hand-labelled multi-seller preparation set
prototypes/moodboard/ local image-text retrieval trial, not used by the page
```

`recommend(products, preferences)` stays a pure function. `server.js` only serves files, because browsers block ES module imports from `file://`.

Data flow:

1. A situation can fill suggested occasions and an emphasis. The shopper can edit them before submitting.
2. `validatePreferences()` normalises the form.
3. `generateCandidates()` applies hard gates and returns a report. It does not score.
4. `scoreProduct()` scores each candidate. The active weights depend on the shopper, not on missing product fields.
5. Relevance ranking sorts by score, then by id. Diversity mode reranks that same candidate set with MMR.
6. Explanations and labels are built from the recorded components.
7. The page renders that return value.

The liked product is removed from the candidate set when its id is present, so a reference is not recommended as the closest thing to itself. Similarity is still computed against it. The assumptions list says so.

## Data model

Prices, brands, ratings, and review counts are illustrative synthetic data. They are not retailer listings.

### Product

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Unique string. Also the tie-breaker. |
| `name` | yes | Fictional product name. |
| `category` | yes | One catalogue category. Matching is exact. |
| `brand` | yes for published rows | Fictional brand. |
| `price` | yes | Illustrative INR amount, finite and greater than 0. |
| `currency` | yes for published rows | `INR`. |
| `colour` | no | Primary colour. |
| `colours` | no | Colour list. Scoring uses this, or `[colour]` when the list is absent. |
| `styles` | no | Subset of the closed style vocabulary. |
| `silhouette` | no | Short shape label such as `straight` or `structured`. |
| `material` | no | Primary material. |
| `occasions` | no | Subset of the occasion vocabulary. |
| `comfortRating` | no | Number from 1 to 5. |
| `versatilityRating` | no | Number from 1 to 5. Used before the occasion-count fallback. |
| `formalityRating` | no | Number from 1 to 5. Used inside occasion suitability. |
| `fit` | no | Optional fit note. |
| `care` | no | Optional care note. |
| `averageRating` | no | Synthetic mean rating from 1 to 5. |
| `reviewCount` | no | Synthetic review count, integer `>= 0`. |
| `availability` | no | `in_stock` or `out_of_stock`. Missing fails the in-stock gate. |
| `sizes` | no | Size tokens. Missing fails the size gate when the shopper set a size. |
| `description` | no | One short sentence. |

Categories: Handbags, Jackets and coats, Dresses and skirts, Heels, Flats and loafers, Accessories, Tops, Trousers, Sneakers.

Styles: `minimalist`, `structured`, `classic`, `bold`, `artistic`.

Occasions: `everyday`, `work`, `evening`, `travel`, `special`.

A published catalogue row that fails `validateCatalogue()` is a test failure. The ranker still skips a malformed runtime row instead of throwing. There is one listing per product, so 2.0 cannot represent two sellers disagreeing about the same item.

### Preferences

| Field | Required | Meaning |
| --- | --- | --- |
| `occasions` | yes | One or more known occasions. |
| `situation` | no | `college`, `office`, `evening`, `travel`, `wedding`, `custom`, or empty. Stored for display. It does not silently override edited fields. |
| `styles` | no | Preferred style tags. |
| `dislikedStyles` | no | Any overlap forces the style component to 0. |
| `categories` | no | Hard gate when non-empty. Not a score component. |
| `colours` | no | Soft colour preference. |
| `dislikedColours` | no | A matching product colour forces the colour component to 0. |
| `materials` | no | Soft material preference, unless legacy craftsmanship priority is set. |
| `maxBudget` | yes | Number greater than 0. Commas and a leading ₹ are accepted. |
| `requireInStock` | no | Defaults to true. |
| `size` | no | Hard gate when set to something other than empty or `any`. |
| `emphasis` | no | `balanced`, `comfort`, `versatility`, `appearance`, `quality`, or `budgetFit`. |
| `priority` | no | Legacy `comfort`, `versatility`, `craftsmanship`, or `statement`. The form leaves this empty. |
| `likedProductId` | no | Reference product for similarity. Unknown ids do not invent a match. |
| `flexible` | no | Halves style and colour weights and multiplies comfort and versatility by 1.25. |
| `ranking` | no | `relevance` (default) or `diverse`. |

Unknown occasions, styles, emphasis values, and priorities are validation errors. Unknown colours and categories are allowed and simply fail to match.

## Preference discovery

The shopper page no longer opens on this form. It asks seven questions, interprets a profile in `js/shopping/profile.js`, and ranks with `recommendFromIntent()`. Category, budget, size, stock, and any optional limits the shopper sets are hard gates. The preference object below remains the input to `recommend()` and to the synthetic evaluation. `situationDefaults()` is still available for that path.

`situationDefaults()` suggests editable defaults. The form applies them when the situation changes and shows the note. Later edits are kept.

- College: occasion `everyday`, emphasis `comfort`. Comfort and versatility matter for daily wear.
- Office: occasion `work`.
- Evening: occasion `evening`.
- Travel: occasions `travel` and `everyday`, emphasis `comfort`.
- Wedding: occasions `special` and `evening`.
- Custom: no fill.

Optional questions can be skipped. Skipping a soft preference deactivates that component instead of giving every product the same credit.

## Candidate generation

`generateCandidates(products, prefs)` scans the catalogue. At this size that exhaustive scan is the generator. It is a separate function so a later retriever can replace it without rewriting ranking.

`runCandidateBenchmark()` times that same exhaustive scan on the published 60-row catalogue and on deterministic synthetic catalogues of 1,000 and 10,000 rows. The shopper is fixed: budget ₹8,000, categories Handbags and Sneakers, in stock, size `one-size`. The benchmark records runtime, candidate count, and how many returned rows still fail a hard gate. The synthetic rows are scale fixtures, not extra shop listings. A future retriever is compared with this scan; it does not replace the recorded counts.

Gates, in order, with no points awarded:

1. Well-formed row: non-empty string `id`, `name`, and `category`, and a finite numeric `price`.
2. `price <= maxBudget`. A price equal to the budget stays.
3. Category membership when the shopper selected at least one category.
4. `availability === "in_stock"` when `requireInStock` is true. A missing availability value fails.
5. Size membership when the shopper set a size. A missing `sizes` array fails. `any` and an empty size do not apply the gate.

The report counts how many remaining rows each gate removed. If the candidate list is empty, the message starts with "No products match" and names the gate that first reduced the set to zero, plus the other gates that removed rows. Hard gates are not relaxed to force a result.

When `likedProductId` matches a candidate, that row is removed after the gates. The assumptions say the reference is not ranked against itself.

## Hybrid score

Every active component is a number from 0 to 1. The active set depends on the shopper, so every candidate shares the denominator. A missing product attribute on an active component scores 0, never 1.

Base weights in `WEIGHTS`:

| Component | Weight |
| --- | --- |
| Occasion | 24 |
| Style | 16 |
| Colour | 8 |
| Comfort | 14 |
| Versatility | 14 |
| Quality | 12 |
| Budget fit | 12 |

They sum to 100. Optional pieces are added before renormalisation:

- Emphasis `comfort`, `versatility`, `quality`, or `budgetFit` doubles that weight. `appearance` multiplies style and colour by 1.6. `balanced` and an empty emphasis change nothing.
- `flexible` multiplies style and colour by 0.5 and comfort and versatility by 1.25.
- Legacy `comfort` or `versatility` priority doubles that weight. `craftsmanship` adds a material component of weight 10 from `MATERIAL_CRAFTSMANSHIP` (unknown or missing material scores 0). `statement` adds a component of weight 10 that is 1 only when the styles include `bold` or `artistic`.
- A resolved liked product adds similarity with weight 16.
- Preferred materials, when priority is not craftsmanship, add the material component of weight 10 as 1 when the product material is in the list and 0 otherwise.

Inactive components leave both the numerator and the denominator:

- Style, when no preferred style is selected
- Colour, when the shopper set neither likes nor dislikes
- Similarity, when the reference id is missing or not in the catalogue
- Material, when no materials are preferred and priority is not craftsmanship
- Statement, when priority is not statement

Occasion, comfort, versatility, quality, and budget fit stay active.

### Component formulas

- Occasion: `0.7 * (matched / selected) + 0.3 * formalityFit`. Formality targets are everyday 2, travel 2, work 4, evening 5, special 5. The target is the mean of the selected occasions. `formalityFit = 1 - |rating - target| / 4` when the rating is in 1..5, otherwise 0.
- Style: matched preferred styles divided by the number selected. Any overlap with a disliked style forces 0.
- Colour: 0 when the product colour is disliked or missing. Otherwise 1 when it is in the preferred list. If only dislikes were set, a present non-disliked colour scores 1.
- Comfort: `comfortRating / 5` when the rating is in 1..5, else 0.
- Versatility: `versatilityRating / 5` when that rating is in 1..5. Otherwise `min(1, occasionCount / 4)` when `occasions` is an array. Otherwise 0.
- Similarity: content similarity to the liked product, defined below. This means related to the reference, not the same listing.
- Quality: `(smoothedRating - 1) / 4` when the Bayesian estimate is valid, else 0.
- Budget fit: `(quality + (1 - clamp(price / maxBudget, 0, 1))) / 2`. This is high when the review estimate and the room under this budget are both favourable. It does not say whether the price is fair.

```text
score = round(100 * sum(weight * component) / sum(active weights))
```

Identical inputs produce identical scores. Ranking sorts by score descending, then by `id` with `localeCompare`.

v1 scoring is frozen in `js/baseline.js` as `WEIGHTS_V1` and `scoreProductBaseline`. v1 gave every category survivor the same category credit. 2.0 does not. Evaluation compares the two scorers on the same candidate set. That numeric change is intentional.

## Content similarity

Weights in `SIMILARITY_WEIGHTS`, summing to 1: category 0.35, style 0.20, colour 0.10, material 0.10, silhouette 0.10, occasion 0.10, comfort 0.05.

- Category is 1 when both categories are the same non-empty string, otherwise 0. A colour-only pair cannot look highly similar. If every other feature matches and the category does not, similarity is 0.65.
- Style, colour, material, and occasion use Jaccard. A missing value, or two empty sets, scores 0. The weight stays in the denominator.
- Silhouette is 1 on an exact case-insensitive match and 0 when either side is missing or different.
- Comfort is `1 - |a - b| / 4` on the 1..5 scale. A missing side scores 0.
- Colour uses `colours`, or `[colour]` when the list is absent. Material uses `[material]` when the string is present.

```text
similarity = sum(weight * featureSimilarity) / sum(weights)
```

Identical complete products score 1. That is an attribute match, not a duplicate group. Results sort by similarity descending, then by id. Explanations list the strongest `weight * featureSimilarity` contributions and omit zeros. They do not say duplicate.

`similarProducts()` drops the source id and keeps only rows that pass the same hard gates.

## Bayesian review estimate

```text
smoothed = (n / (n + m)) * rating + (m / (n + m)) * prior
```

`m` is 10 (`BAYES_M`). The default prior is the review-count-weighted mean of valid catalogue ratings. If the catalogue has none, the prior is 3.5. Tests may pass an explicit prior.

A valid rating is finite and in `[1, 5]`. A valid count is an integer greater than or equal to 0. A count of 0 yields the prior. Invalid inputs produce no quality score, so the quality component is 0.

A rating of 5 from 2 reviews must not beat a rating of 4.2 from 200 reviews when the prior is 3.5. The smoothed values are 3.75 and about 4.167. A high estimate cannot bring back a row that failed candidate generation, and it does not override a poor occasion or style match by itself.

Explanations call this a statistical estimate from synthetic aggregates, not verified sentiment. The engine does not invent review text.

## MMR

For each remaining candidate `d` and selected set `S`:

```text
MMR(d) = λ * (score(d) / 100) - (1 - λ) * max similarity(d, s)
```

The max similarity is 0 when `S` is empty. The similarity function is content similarity, so the penalty is redundant style, not identity. `λ = 1` is relevance-only and matches score-then-id order. `λ = 0.7` (`MMR_LAMBDA`) is diversity mode. The loop stops when the candidate pool is empty. Ties break by higher relevance, then by id. Ineligible products are never inserted.

Diversity is a list-construction choice. This plan does not claim it improves shopper satisfaction.

## Explanations and labels

Each result includes the score, the component values and contributions, the gates the row passed, match sentences backed by those components, and trade-off sentences for active components below 0.35. A comfort rating is described as supporting a comfort emphasis only when that component is at least 0.6. A lower present rating is stated without that claim. Unmatched colours, styles, and occasions are left out. They are never called matches.

A formality sentence appears only when a rating exists and `formalityFit` is at least 0.75.

Labels require a unique winner:

- Best overall match: highest hybrid score
- Best budget fit: highest budget-fit component, with the note that this is not a fair-price claim
- Most versatile: highest versatility component
- Closest to the selected item: highest similarity, only when a reference resolved

The highest raw rating is not labelled the best match. Ties get no exclusive label.

Comparison still stores at most three ids and does not mutate the caller's array. The table adds comfort, versatility, formality, the smoothed rating and count, budget fit, and similarity when a reference exists.

"More like this" sets `likedProductId` for this page load and reruns the engine. "Less like this" adds that item's styles and colour to the dislike lists and reruns. Nothing is stored as a user history, and the page says so.

## Evaluation

Ground truth lives in `test/fixtures/scenarios.js`. That file does not import the scorer or `recommend()`. Labels were chosen from product attributes by the scenario author.

Metrics, with K = 5:

- Precision@K = relevant hits in the top K divided by K. Null when the recommendation list is empty.
- NDCG@K uses gains `2^rel - 1` and discounts `log2(rank + 1)`, divided by the ideal DCG. Binary relevance uses 1 and 0. Null when the list is empty or the ideal DCG is 0.
- Catalogue coverage = distinct recommended ids across scenarios divided by the catalogue size.
- Intra-list diversity = mean pairwise `1 - similarity` in the top K. Null when fewer than two items are present.
- Hard-constraint violation rate = violating recommendations divided by the list length. Null when the list is empty. An empty list is not a violation.

Scenarios:

- Strict budget and category
- Comfort and versatility emphasis
- Similar to a reference item
- Conflicting soft preferences, meaning the shopper asked for tastes that pull apart
- Few eligible products
- No eligible products

Both strategies call `generateCandidates`. The baseline then uses `scoreProductBaseline` and relevance order. The new strategy uses the hybrid score and MMR at 0.7. Reported numbers are the values the harness returns, including a lower precision or NDCG. Each strategy also records `runtimeMs` for that call. Hybrid runtime includes explanations and labels. Baseline runtime is the frozen scorer plus the relevance sort. Runtime is machine-dependent and is not a quality score. Synthetic labels are not a user study.

The candidate-generation benchmark is separate. It keeps the exhaustive scan as the baseline at 60, 1,000, and 10,000 rows and records runtime, candidate count, and hard-constraint violations among the returned rows.

## Import

`validateCatalogue()` checks published and imported rows. Duplicate ids keep the first row and report the rest. Missing required fields and invalid ratings, counts, categories, styles, occasions, or availability are rejected. Unknown colours produce a warning and are kept. CSV parsing supports a header, quoted commas, and pipe-separated arrays. A failed import leaves the built-in catalogue in place. Import lasts for the current page load.

## Testing

`npm test` runs `node --test`. Tests cover catalogue integrity, gate diagnosis, budget equality, required categories, partial style credit, weight renormalisation, missing attributes, ranking stability, similarity, Bayesian smoothing, MMR against `λ = 1`, labels, explanation truthfulness, empty results, comparison, metric arithmetic, and the six scenarios.

## Definition of done for 2.0

- `npm start` serves the app and the page calls the real engine
- Preferences can be discovered and edited, and hard gates are enforced
- Similarity, hybrid scoring, review smoothing, and MMR run and are tested
- Explanations match the components, and budget fit is not described as market value
- The evaluation harness returns reproducible numbers
- Existing comparison behaviour still stops at three products
- Tests have been run and the results are in `PROGRESS.md`
- `PLAN.md`, `PROGRESS.md`, and `README.md` match the code

Moodboard search, embeddings, duplicate groups, conflict flags, open aesthetic tags, and a REST API are not required for this definition.

## FitRank 2.1

`recommend()` is unchanged. The shopper page still ranks the 60 fictional products with the attribute engine.

What is now built, beside that page:

- A Fashion-MNIST split in `experiments/fashion-mnist/manifest.json`: 100 index images, 10 validation images, and 10 test images per class, from the MIT-licensed test set, with no shared source index. The protocol in `experiments/PROTOCOL.md` and `js/retrievalProtocol.js` was fixed before the test split was scored.
- Cached CLIP ViT-B/32 embeddings and brute-force cosine retrieval. The hybrid score, missing-signal rule, and embedding MMR are defined in `js/hybridRank.js`. Hard constraints that the image catalogue cannot support fail the search. Price, stock, and size are not invented.
- Measured test-split comparisons in `experiments/retrieval-results.json`. Class match is not shopper relevance. The hybrid score did not beat the stronger single signal on the paired queries. Diversity lowered precision. The duplicate check on 13 pairs is reported with that sample size, and the exact-name rule beat the frozen CLIP cutoff.
- `POST /api/retrieve` on the local server. The root package still has no installed libraries. The model import stays in `prototypes/moodboard/`.

`data/listings/pairs.json` is still the hand-labelled set. The detector did not write those labels. `prototypes/moodboard/` remains the small trial and is not what the shopper form imports.

The shopper page now uses the seven-question flow in `js/shopping/`. `recommendFromIntent()` interprets those answers and ranks the fictional catalogue. That flow is the input to the v2 audit. It is not yet the `IntentProfile` contract in the revised plan, and it does not call the embedding retriever.

Still unbuilt:

- A retriever inside the shopper path for the 60-product catalogue. The shopper path is still the exhaustive attribute scan.
- Duplicate decisions shown on the shopper cards. The 13-pair result is an experiment, and the listings have no images.
- A mapping from the questionnaire vocabulary onto a real dataset. Synthetic aesthetic tags exist only on the intent path, in `js/shopping/annotations.js`.
- A general API over the shopper functions. Only `/api/retrieve` exists.

2.1 still must not scrape retailers. Duplicate-detection labels must be written by hand, not by the detector.

Other later work, also unbuilt: a database, authorised retailer feeds, persistent preferences, collaborative filtering, a ranker trained on real relevance data, verified review text, and online experiments.

## FitRank 2.1 revised plan (v2)

Adopted as the governing 2.1 execution plan. v1 built retrieval around Fashion-MNIST and left catalogue integration as one late task (T6). That split the repo into parallel experiments. v2 makes the shopping task the spine and keeps Fashion-MNIST as a labelled side track.

The `IntentProfile` schema below is provisional. The questionnaire already exists in `js/shopping/`, and the catalogue fields are in `js/catalogue.js`. Task K starts only after the T0 audit writes those facts to `docs/AUDIT.md` under "Intent flow".

### 1. Governing rule

Every component is either **Integrated** or a labelled **Experiment**.

- Integrated: called in the search path, with an evaluation arm that measures its contribution to the shopping task.
- Experiment: separate folder, separate UI label, separate result files, and no claims about the shopper.

`docs/COMPONENTS.md` is the ledger. Keep it current.

| Component | Status | Call site in search path | Eval arm | Evidence file |
| --- | --- | --- | --- | --- |
| Questionnaire → IntentProfile | Integrated | `js/intent/` | influence test | `results/intent/` |
| Hard gates | Integrated | `constraints.js` | violation rate = 0 | `results/shopper/` |
| Attribute scorer (existing) | Integrated | `search.js` | baseline arm | same |
| Text embeddings over catalogue | Integrated | `sources.js` | embed-only, hybrid | same |
| MMR diversity | Integrated | `mmr.js` | ±MMR ablation | same |
| Fashion-MNIST retrieval | Experiment (validates machinery) | none | its own eval | `results/fmnist/` |
| Duplicate/listing matching | Experiment | none | smoke only | `results/matching/` |
| Sidecar/API | Infrastructure | `server.js` | fallback tests | tests |

Acceptance check: an Integrated row without a call site or an eval arm is a bug. A claim in the README or the UI that cites an Experiment row as evidence about shopping quality is a bug.

### 2. One pipeline, one data contract

```text
Questionnaire answers (7 questions)
        │  deterministic mapping, no LLM
        ▼
IntentProfile {
  hard:  { budget, category[], sizes[], inStockOnly }          ← gates only
  soft:  { aesthetics[], occasions[], priorities{weight} }     ← relevance
  query: { text (template-built from soft fields), imageSeed? }
  provenance: which answers produced which fields
}
        │
        ├─► Candidate source A: existing attribute scorer, top-M
        ├─► Candidate source B: text-embedding similarity (intent.query.text vs catalogue text), top-M
        └─► (optional) Source C: image similarity when the user supplies a seed image and items have images
        ▼
merge by product id → HARD GATES (before scoring) → normalize signals → fuse
(missing signals dropped + weights renormalized) → MMR → final gate assertion
        ▼
Recommendations { rank, score, components, signalsUsed, explanation, trade-offs, alternatives }
        ▼
Evaluation harness (imports the same functions) → results/*.json
```

What changes from v1:

- The questionnaire produces a typed `IntentProfile`, and that profile is the only input to retrieval. Soft preferences drive both the attribute scorer and the text query, so answers change relevance rather than only filling a form.
- The embedding signal is one input to the existing ranker, not a parallel system. The ranker is extended, and its legacy output stays reproducible.
- Fashion-MNIST uses the same retrieval and metric modules, so it validates the same code, but it has its own entry point and no `IntentProfile`.

Intent text comes from fixed, versioned templates in `intent/templates.v1.json`. A soft profile of `aesthetics=[gothic], occasions=[evening]` yields a sentence such as "dark gothic evening top". Templates are written before looking at any retrieval results. The template set is a tuned hyperparameter on validation personas only.

### 3. Evaluation on the shopping task

Circularity risk: if relevance labels are derived from the same attributes the scorer uses, the attribute scorer wins by construction. If labels come from embedding similarity, the embeddings win by construction. Neither is acceptable.

Protocol, pooled and blind:

1. Write 24 personas covering the questionnaire space: varied aesthetics, occasions, budgets, and sizes. Each persona is a complete set of questionnaire answers plus a one-sentence plain-language description of what the person wants. Split 8 validation / 16 test. Freeze the file before running any arm.
2. For each persona, run all arms and take the union of each arm's top-10 after gates (pooling, as in TREC). Shuffle and hide which arm returned each item.
3. A person judges each pooled item on a 0/1/2 scale (not relevant / acceptable / great) against the persona's plain description, using `docs/JUDGING.md`, written first. Expect roughly 15–25 items per persona, about 400 judgments. The report states that the judge is a single person who is also the project author.
4. Report graded NDCG@5/10, P@5 (acceptable or better), constraint violations, diversity, and paired bootstrap confidence intervals over personas.

Limits to state in the report:

- With 60 items and gates active, a persona may have only 10–25 eligible candidates, so top-10 can cover most of the pool and the arms may barely differ. Use K=5 as the primary cutoff, and report eligible-pool size per persona.
- 16 test personas give wide intervals. Treat differences under about 0.05 NDCG as noise.
- The catalogue is fictional. Results show that the integration works and behaves sensibly. They are not evidence that FitRank gives good fashion advice. Real-shopping claims wait for the Level 2 dataset.
- A null or negative result (embeddings add nothing at N=60) is an acceptable outcome and goes in the report.

Intent-influence test, with no human labels: for each persona, perturb one answer at a time and measure top-5 overlap and Kendall tau against the original ranking. Changing an answer that should matter must change the ranking measurably. Changing a hard constraint must change eligibility. A field whose perturbation never alters results is flagged as dead.

### 4. Revised three-day sprint

v1 put Fashion-MNIST first and starved the integration. v2 builds the shared retrieval machinery once, validates it quickly on Fashion-MNIST, and spends the remaining time on the integrated path.

Critical path: T0 → T1 → T2 → T3 → K → L → M → T7 → T8 → T9. The Fashion-MNIST evaluation (T4/T5) runs in reduced form alongside.

| Task | Change from v1 | Est. active |
| --- | --- | --- |
| T0 Audit | Also audit the questionnaire, its option vocabularies, the catalogue fields, and which answers reach the scorer | 1.5h |
| T1 Fmnist adapter + splits | Reduced: index 1,000 / val 100 / test 200 max, regardless of throughput | 1.5h |
| T2 Embedding + cache | Unchanged, and catalogue text embedding is a core target | 3h |
| T3 Retrieval core | Unchanged | 3h |
| T4/T5 Fmnist eval (reduced) | Arms: pixel, lexical, CLIP i2i, CLIP t2i, hybrid. Ablations: each signal ± MMR only. The frozen-config guard stays | 3h total |
| K IntentProfile + templates | New | 3h |
| L Integrated search over catalogue | Replaces v1 T6 | 3h |
| M Personas, pooling, judging tooling, intent-influence test, shopper eval | New | 4h |
| T7 Sidecar/API/fallback | Unchanged | 2.5h |
| T8 Frontend | Surface intent → results in the existing shopper flow. Fashion-MNIST moves to a separate Lab tab | 3h |
| T9 Hardening/report | Adds the `COMPONENTS.md` check | 3h |

Total is about 30 hours of active work. If time runs short, cut in this order: Fashion-MNIST ablations beyond the core set, Lab tab polish, then the sidecar image endpoint. Never cut the gate tests, the frozen-config guard, the no-query legacy-equivalence test, or phase M's blind judging protocol. M is what turns the integration from a claim into evidence.

T0 has already been run for the v1 retrieval facts. The questionnaire audit in the T0 edit below is still required before K. If later tasks from v1 are already committed, record that in `docs/plan/TASKS.md` and do not repeat them.

### 5. Prompts

Prompts A–F stay as written for v1 tasks T0–T5, with two edits. Prompt G (old T6) is replaced by K and L. Prompt M is new. Prompts H, I, and J take the edits at the end of this section.

Append this to Prompt A:

```text
Also audit the shopper flow: list the seven questionnaire questions, each question's option vocabulary and how answers are currently stored and passed to the scorer; list catalogue fields and value vocabularies; identify exactly which answers feed which scorer weights today. Write this to docs/AUDIT.md under "Intent flow". Flag any answer that is collected but unused.
```

Prompt B caps the Fashion-MNIST sets at index 1,000, validation 100, and test 200.

Prompt K, IntentProfile:

```text
Task: connect the questionnaire to retrieval via a typed IntentProfile. New code in js/intent/. Do not change the existing scorer's behaviour.
1. From AUDIT.md "Intent flow", write js/intent/buildIntent.js: pure function answers -> IntentProfile { hard:{budget,category[],sizes[],inStockOnly}, soft:{aesthetics[],occasions[],priorities{name:weight}}, query:{text, imageSeed:null}, provenance:{field:[answerIds]} }. Missing answers stay null/absent, never defaulted silently; record them in provenance.missing.
2. Hard fields feed gates only. Soft fields feed the attribute scorer exactly as the existing code does today (adapter, not rewrite) AND the text query.
3. js/intent/templates.v1.json: deterministic templates that turn soft fields into query text. No LLM, no randomness. Include a test that identical answers give identical text.
4. Tests: every questionnaire option maps to something or is explicitly listed as 'unused' in a test fixture; null answers handled; legacy scorer called via the adapter produces results IDENTICAL to the current code on a fixed fixture of 10 answer sets (store the fixture and expected output from the CURRENT code before any change).
Return: the IntentProfile schema as built, the unused-answer list, test output. L depends on the schema.
```

Prompt L, integrated search:

```text
Task: js/retrieval/search.js integrated path over the fictional catalogue. Prerequisites: T2 catalogue text embeddings, T3 modules, K IntentProfile.
1. searchCatalogue(intentProfile, opts) -> SearchResponse. Sources: (A) existing attribute scorer top-M (M=30), (B) cosine between embedding of intent.query.text and catalogue text embeddings, top-M. Merge by product id keeping per-source scores; a missing source score is missing, not 0.
2. Gates run on the merged pool BEFORE scoring; assert again on final output. Null attribute fails an active constraint (existing semantics).
3. Fusion: per-query z-score over the gate-eligible pool (if pool<10 use rank-based normalization and flag it), weighted over available signals, weights from config marked weightsValidated:false until M tunes them on validation personas only. Then MMR with embedding cosine.
4. Explanations built from actual component values and provenance (which answers drove which signal). Include trade-off lines only when computed (e.g. 'EUR 12 over your preferred budget' is NOT allowed since budget is a hard gate; instead state the soft-priority trade-off).
5. No-query / empty-soft-profile: output must equal legacy FitRank exactly (fixture test).
6. Arms exposed via config for the harness: legacy_baseline (js/baseline.js), current_scorer, embed_only, hybrid, hybrid_mmr.
Tests: adversarial violator with similarity 1.0 never returned; property test over random intents for zero violations; no-query equivalence; missing-embedding item handled and counted; determinism.
Return: sample response for 3 intents, test output.
```

Prompt M, personas, pooling, judging, and the influence test:

```text
Task: shopper-task evaluation in ml/src/eval/shopper/.
1. Create ml/data/personas.v1.json: 24 personas, each = full questionnaire answers + one-sentence plain-language want. Cover varied aesthetics, occasions, budgets, sizes, and include 3 deliberately tight-constraint personas. Split 8 val / 16 test BEFORE running any arm. Commit the file hash.
2. Write docs/JUDGING.md rubric (0 not relevant / 1 acceptable / 2 great) BEFORE generating any pools.
3. Pooling tool: for each persona run all arms, take union of each arm's gated top-10, shuffle, strip arm labels, write ml/data/judging/pool.<split>.csv with columns persona_id, item_id, persona_text, item_title/description/attrs, judgment (empty). A second script ingests the filled CSV and validates it (all rows judged, values in {0,1,2}). Keep the arm->item mapping in a separate file the judge never sees.
4. Metrics: graded NDCG@5/10, P@5 (>=1), eligible-pool size per persona, violation rate, ILD, latency; paired bootstrap CI over personas (1000 resamples, seeded). K=5 primary.
5. Intent-influence test: for each persona perturb one answer at a time; report top-5 overlap and Kendall tau vs original; flag any questionnaire field whose perturbation never changes the ranking; hard-constraint perturbations must change eligibility.
6. Tune fusion weights and MMR lambda on VAL personas only with the selection rule written first (maximize NDCG@5; lambda chosen as the largest ILD gain with <=0.02 NDCG@5 loss). Freeze configs/frozen.shopper.v1.json; test script refuses to run on a hash mismatch and logs every invocation.
7. Do NOT fill in judgments yourself. Stop after generating the pool CSVs and tell the user to judge them. Resume only when the filled files are returned.
Return: persona stats, eligible-pool size distribution, pool sizes (number of rows to judge), influence-test table, and the exact commands to ingest and evaluate.
```

Step 7 is required. Fabricated judgments invalidate the evaluation.

Edits to the remaining prompts:

- H (sidecar/routes): `/api/search` accepts either `{intentProfile}` for the catalogue or the Fashion-MNIST request for the lab. The route and the response carry a `dataset` field. The response states `experiment: true` for Fashion-MNIST.
- I (frontend): the existing shopper results show why an item was recommended, including which answers drove which signals, and a backend badge. The Fashion-MNIST panel moves to a separate Lab tab with a permanent banner: "Controlled experiment on 28×28 Fashion-MNIST: validates retrieval machinery only. Not evidence about shopping quality."
- J (handoff): add a script that validates `COMPONENTS.md`. Every Integrated row must have a call site found by search and an evidence file that exists. Run that script in the clean-state check.

### 6. Level 2: the dataset serves the questionnaire

v1 chose the Level 2 dataset without asking whether it could express the questionnaire. L2-0 fixes that.

- Mapping layer. `data/real/vocab-map.json` maps questionnaire vocabularies (aesthetics, occasions, categories, colours) to the chosen dataset's attributes. A coverage report lists questionnaire options with no real counterpart. Those options are disabled for the real dataset or marked "text-only signal". They are not invented.
- The dataset rubric gains a tenth criterion: questionnaire coverage, the share of questionnaire options that map to real attributes or can be supported through text or image. A dataset that scores well on license and supports 20% of the questionnaire is a weak fit.
- The real dataset replaces the fictional catalogue as the primary evaluation target. The 60-item catalogue stays as a demo and a regression fixture. The persona and pooling protocol from phase M runs again on the real data, with at least 40 personas and, ideally, a second judge on a 20% overlap sample so agreement can be reported.
- Image signals become real. With real product images, source C and image–text fusion are measured on the shopping task. The sprint can show them only on Fashion-MNIST.
- Phase order is unchanged. Phase 3 (hybrid ranking) means tuned versus baseline on the shopping task with judged personas. A learned ranker is considered only once judged pairs reach about 1,000.

Duplicate detection stays an Experiment. Its one legitimate hook is a result-list dedupe step that collapses near-identical listings before display. That step can become Integrated only if matching reaches documented precision on real labelled data. Until then, no UI or README claim depends on it.

### 7. Checklists added by v2

Sprint:

- [ ] `COMPONENTS.md` exists, and its validator script passes
- [ ] Every questionnaire option maps to a signal or is on the documented unused list
- [ ] Legacy-equivalence fixtures (10 intents) pass byte-for-byte
- [ ] The persona set and the judging rubric were committed before any pool was generated
- [ ] Judgment CSVs were filled by a human, and the arm mapping was hidden during judging
- [ ] The intent-influence table is generated, with no dead fields, or each dead field is explained
- [ ] Shopper-task results report eligible-pool sizes and confidence intervals, and state that the catalogue is fictional

Level 2:

- [ ] `vocab-map.json` and a questionnaire coverage report exist for the real dataset
- [ ] The persona and judging protocol is re-run on real data, with at least 40 personas and inter-judge agreement reported on an overlap sample

Interview readiness:

- [ ] Explain how a questionnaire answer travels to a ranked product, naming the function at each step
- [ ] Explain why Fashion-MNIST results are separate from shopper results, and show the folder and UI label that enforce it
- [ ] Describe the circularity problem and how pooled blind judging avoids it

### 8. What to do next

1. Run the Prompt A audit edit. Write the seven questions, option vocabularies, catalogue fields, and the current answer-to-scorer path into `docs/AUDIT.md` under "Intent flow". Flag collected answers that do not affect ranking.
2. Run K only after that section exists. L depends on the schema K returns.
3. Once M writes the pool CSVs, stop. Judging is a human step of about two hours. Do not fill the judgment column in code.

## Engineering plan v1 (superseded)

Superseded by "FitRank 2.1 revised plan (v2)" for new work. This section remains the record of the 12 Oct sprint: the T0 measurements, the retrieval-module design, and the Fashion-MNIST protocol. Do not start the v1 critical path (T0 through T6 as originally ordered). v2 reduces T1 and T4/T5, replaces T6 with K and L, and adds M.

Adopted on 12 Oct 2026 as the execution plan for the work after the retrieval slice above. T0 has been run. Its measured outcome is in `docs/AUDIT.md` and `ml/results/env.json`.

**T0 outcome.** The module system is ESM. `npm test` passed 64 and failed 0. The moodboard rerun matched Precision@3 0.500, NDCG@3 0.517, and top-1 0.700. Batch-1 throughput was 45.834 ms/image, so the set-size rule selects index 2,000, validation 300, and test 500. The Fashion-MNIST train split is not on disk. License statements in Section 7 stay UNVERIFIED until a later task reads the original text.

### Section 1: Technical diagnosis

Reported strengths, checked in T0:

- The root app has no installed libraries. Hard gates and MMR already work, and `js/baseline.js` keeps the old scorer.
- A local CLIP prototype exists: `Xenova/clip-vit-base-patch32`, 512-d, q8, CPU. The 12 Oct rerun is in `docs/AUDIT.md`.

Weaknesses and risks:

1. The 40-image prototype is statistically thin: 10 queries and 3 candidates per class. Chance Precision@3 in that script is 0.100. A score of 0.500 is above that chance level, and the interval around 10 queries is wide.
2. Fashion-MNIST has no price, size, stock, or brand. Budget, size, and availability cannot be exercised on it. Under the current missing-attribute rule, an active budget or size constraint must not invent the field. The 60-item fictional catalogue is the catalogue where those gates have real values.
3. The images are 28×28 grayscale. Shirt, T-shirt, pullover, and coat are partly ambiguous at that resolution. Poor scores there can be a dataset limit.
4. Recall@K is bounded by K/R. With 200 relevant images per class, Recall@10 cannot exceed 0.05. Reports need Recall@50, Recall@100, Recall@R, and R-precision beside Recall@10.
5. Prompt templates, fusion, and MMR lambda are tuning choices. Validation is the only split used for that tuning. The test config is frozen before the test run.
6. `transformers.js` stays out of the root package. The current `/api/retrieve` path can still load it inside the root process. The sprint moves new inference to a sidecar.

Highest-value opportunities:

- A reproducible retrieval evaluation with ablations and negative findings.
- A cache and manifest that can be reused without another weight download.
- Text-embedding search over the fictional catalogue, which is where the hard gates can be tested.

Assumptions checked in T0: ESM, test-split IDX files only, the catalogue fields and category list, transformers 4.3.1, Node v22.20.0, 183 GB free on C:, and the cache at `prototypes/moodboard/.cache`.

### Section 2: Final architecture

```text
                    OFFLINE (ml/, own package.json, transformers.js lives ONLY here)
 Fashion-MNIST IDX ─► data adapter ─► splits (seeded) ─┐
 Fictional catalogue ─► text builder ──────────────────┤
                                                       ▼
                         CLIP runtime (vision+text, quantized CPU)
                         preprocess → embed → L2 norm → cache writer
                                                       ▼
        ml/artifacts/<cacheKey>/{manifest.json, ids.json, emb.f32}   (git-ignored; small result JSONs committed)

                    RUNTIME (root, dependency-free, js/retrieval/)
 SearchRequest ─► candidate generation (per-source top-M, exhaustive dot product)
              ─► merge + dedupe ─► HARD GATES (filter before scoring)
              ─► signal normalization (z-score per query) ─► weighted fusion (missing signals renormalized)
              ─► MMR diversity (embedding cosine) ─► final gate assertion ─► explanations ─► SearchResponse

  Inference sidecar (ml/src/server, 127.0.0.1:8787): embeds NEW text / uploaded 28×28 images only.
  root server.js ─proxy w/ health check + timeout─► sidecar; on failure → fallback (pixel cosine / lexical / cached query embeddings)

                    EVALUATION (ml/src/eval/, imports the SAME js/retrieval/ functions)
 configs/exp/*.json ─► runEval(split) ─► metrics + bootstrap ─► ml/results/{val,test}/*.json + .md
```

Design rules:

- Production retrieval code lives in `js/retrieval/` as pure functions with no model imports. The evaluation harness imports those functions.
- Gates run before scoring, and a second assertion checks the final output.
- Index embeddings are computed offline. New queries are embedded by the sidecar. The browser does not download weights.
- Precomputed embeddings for held-out sample queries and text presets keep those demos usable with no runtime model.

`SearchRequest`:

- `text` optional string
- `image` optional `{ kind:"sample", id }` or `{ kind:"gray28", dataB64 }` for 784 bytes
- `mode`: `text`, `image`, or `hybrid`
- `dataset`: `fmnist` or `catalogue`
- `constraints` optional: `categories`, `maxPrice`, `sizes`, `inStockOnly`
- `prefs` optional, catalogue only, the existing FitRank preferences
- `k` from 1 to 50, `diversity` from 0 to 1 meaning `1 - λ`, optional `alpha`

`SearchResponse`:

- `indexVersion`, `mode`, `backend` of `clip` or `fallback`, optional `fallbackReason`
- `results`: `id`, `rank`, `score`, `components` (`img`, `txt`, `pref`), `signalsUsed`, `category`, `attrs` with nulls preserved, `explanation`
- `timings`: `embedMs`, `searchMs`, `totalMs`

Cache format: `emb.f32` is row-major Float32, N by D, row `i` matching `ids.json[i]`. `manifest.json` contains `schemaVersion`, `modelId`, model file sizes and sha256, `transformersVersion`, `dtype`, `preprocessConfigHash`, dataset file sha256 values, `splitConfigHash`, `idsHash`, `dim`, `count`, `normChecked`, `gitCommit`, and `createdAt`. The cache key hashes every manifest field except `createdAt` and `gitCommit`. Writes go to a temp file and are then renamed.

Missing-signal policy: a missing attribute is stored as null and never defaulted. A missing signal is excluded from fusion and the remaining weights are renormalized. The explanation lists `signalsUsed`. An item with no embedding cannot enter embedding candidate generation, and that gap is counted.

### Section 3: Three-day implementation plan

Active engineering time is about 25 hours across 3 days. Essential items are marked. Machine time for about 2,800 images at the measured rate is a few minutes, plus a download if the train split is fetched. The time risk is debugging.

Critical path: T0, T1, T2, T3, T4, T5, T6, T7, T9. T8 can shrink to a minimal panel.

Set sizes, decided in T0 from batch-1 throughput 45.834 ms/image:

- t ≤ 100: index 2,000 (200/class), validation 300 (30/class), test 500 (50/class). This is the branch in force.
- 100 < t ≤ 300 would have been index 1,000, validation 100, test 200.
- Otherwise index 1,000, validation 100, test 100, and the report would state the low statistical power.

#### T0: Audit and baseline reproduction (Essential, done)

Objective: establish verified facts and reproduce the prototype numbers.

Acceptance met with a documented test-count discrepancy: 64 passing tests, not 48. Prototype quality numbers match the reported Precision@3, NDCG@3, and top-1. The size decision is written in `docs/AUDIT.md`.

#### T1: Dataset adapter and splits (Essential, about 2h, depends on T0)

Objective: read the IDX files in pure JavaScript, build seeded stratified splits, and write item records.

Steps:

1. Write the IDX parser, using built-in `zlib` for gzip.
2. The train files are absent. Download them only from the official `zalandoresearch/fashion-mnist` repository, and verify the checksums against the official README. A checksum mismatch stops the task.
3. Index and validation come from the train split and are disjoint. Test queries come from the test split.
4. If the train split cannot be obtained, partition the test split into three disjoint sets and record that fallback.
5. Use mulberry32 with seed 20261012.
6. Hash every image's pixels, and drop any query whose pixel hash is in the index.
7. Write `ml/data/splits/fmnist.v1.json` with ids, labels, config, and hashes. That file is committed.
8. Each item is `{id, rawLabel, category, attrs:{price:null, brand:null, color:null, size:null, stock:null, rating:null}}`.
9. Map `category` to the FitRank taxonomy only where a clean mapping exists. Otherwise keep the raw label and set the mapped value to null.
10. Emit a missingness report.

Tests: disjoint ids and pixel hashes, stratified counts, identical hash on two runs, nulls preserved, and a truncated-file error.

Acceptance: the split file is reproducible bit for bit.

The already scored 100/10/10 test-set slice in `experiments/` is a finished experiment. It is not the validation set for this sprint.

#### T2: Embedding pipeline and cache (Essential, about 3h, depends on T1)

Objective: embed index, validation, test, text prompts, and catalogue text, with a validated cache.

Steps:

1. Write `ml/src/embed/{clipRuntime,preprocess,cache,manifest}.js`.
2. Preprocessing is a config, `preprocess.v1.json`: the 28×28 image becomes 3-channel RGB by replicating gray, then the CLIP processor's default resize, as-is polarity. Inverted and padded variants are defined and compared only on validation.
3. Choose the batch size from the T0 measurement. Batch 32 was the fastest of 1, 8, and 32 on this machine.
4. The runtime stays offline and fails if model files are missing.
5. `validateCache(expected)` returns `{valid, reasons[]}`.
6. CLI: `npm run ml:embed -- --target index|val|test|text|catalogue`.
7. Text embeddings are keyed by `sha256(normalizedText + templateId)`.

Tests with a deterministic mock embedder, and no model: second-run reuse, invalidation on config or id change, truncated and mismatched-length files, unit norm within 1e-4, and id order. One integration test, skipped with an explicit "SKIPPED: model unavailable" message when the model is absent, re-embeds 20 images and requires cosine at least 0.9999 against the cache.

Acceptance: the second run does zero inference. A modified preprocess config forces regeneration.

Fallback: if transformers.js cannot run, stop and report that blocker. The pixel baseline can still carry the baseline arm.

#### T3: Retrieval core (Essential, about 3h, depends on T2)

Pure JavaScript in `js/retrieval/`, matching the ESM module system, with no dependencies and no model imports.

Modules:

- `vectorStore.js`: load the manifest and Float32 buffer, validate on load.
- `topK.js`: heap-based exhaustive dot product, boolean mask, tie-break by id.
- `sources.js`: CLIP image-to-image, CLIP text-to-image, pixel cosine with mean-centered and raw variants, lexical class-name token match with no synonyms.
- `constraints.js`: a missing attribute fails when that constraint is active.
- `fuse.js`: per-query z-score over the gate-eligible pool, stored global mean and standard deviation when the pool has fewer than 30 rows, weighted fusion with renormalized weights, and RRF with k = 60 as the comparison.
- `mmr.js`: `lambda * rel_minmax - (1 - lambda) * max cosine` to an already selected item. An item without an embedding gets diversity term 0 and is flagged.
- `explain.js`: template text built only from the actual numbers.

Tests: a known neighbour, mask exclusion, deterministic ties, null handling, 1,000 random constraint combinations with zero violations, an item of similarity 1.0 that violates a gate and must not appear, MMR at lambda 1 equal to the plain ranking, and missing-signal renormalization.

Acceptance: all of those pass in Node with no model loaded.

#### T4: Metrics, harness, and validation tuning (Essential, about 3.5h, depends on T3)

1. Implement the Section 6 metrics and check them with hand-computed fixtures.
2. Add a seeded paired bootstrap over queries, 1,000 resamples, 95% interval.
3. `runEval` takes `--config` and `--split val|test` and writes JSON plus Markdown.
4. Write the text-query file before looking at any retrieval result: 10 classes, 5 paraphrases each, at least one paraphrase per class that avoids the class-name word, then split 3 validation and 2 test.
5. Tune on validation only: 3 prompt templates, 3 preprocessing variants, z-score versus RRF, alpha, and MMR lambda.
6. Freeze `configs/frozen.v1.json` and record its hash before any test run.

Selection rule, written before the runs: maximize macro NDCG@10. Choose the largest MMR lambda whose intra-list diversity gain keeps NDCG@10 loss at or below 0.01. Otherwise lambda is 1.

Acceptance: metric tests pass, every arm has validation results, and the frozen config is committed before T5. This task does not score the test split.

#### T5: Test evaluation, ablations, and failure analysis (Essential, about 2h, depends on T4)

1. `npm run eval:test` refuses to run unless the config hash matches `frozen.v1.json`, and appends each invocation to `ml/results/test_run_log.jsonl`.
2. Run each arm once: pixel, lexical, CLIP image-to-image, CLIP text-to-image, hybrid, hybrid plus MMR, and an oracle category gate using the true label. The oracle is an upper bound, not a claim that FitRank won.
3. Report macro and per-class metrics with 95% bootstrap intervals.
4. Add a confusion matrix of the top-1 retrieved class, with T-shirt, shirt, pullover, and coat called out.
5. List the 10 worst queries with their retrieved labels.
6. Ablate one piece at a time: each signal, normalization, MMR, and the preprocessing choice.

Acceptance: result files are generated by the script. The summary includes a negative or inconclusive finding when one exists, and it states how many test runs were made. A result above 0.99 is investigated for leakage before it is reported.

#### T6: Integration layer (Essential, about 2.5h, depends on T3 and T5)

1. `js/retrieval/search.js` implements the SearchRequest and SearchResponse above. Gates run before scoring. Every returned item must pass the gates.
2. Catalogue text uses title and description only, after a check for label-revealing text. The existing preference scorer is called unchanged and contributes a `pref` signal. Default fusion weights are flagged `weightsValidated: false`. A sensitivity test perturbs those weights.
3. On Fashion-MNIST, only a category constraint applies. Other constraints are reported as not applicable because the data does not contain them.
4. A request with no query must match the legacy FitRank ranking on a fixed fixture.

Acceptance: the existing suite still passes, and the no-query path matches the legacy engine on that fixture.

#### T7: Sidecar, API routes, and fallback (Essential, about 2.5h, depends on T6)

1. `ml/src/server/inference.js` listens on 127.0.0.1:8787 with `/health`, `/embed/text`, and `/embed/image`. The model loads lazily.
2. Root `server.js` gains `POST /api/search` and `GET /api/sample-queries`. It proxies to the sidecar with a cached health check and a 3 second timeout. Dynamic imports stay on local pure modules.
3. Fallback sets `backend` to `fallback` and sets `fallbackReason`. Known preset text uses a cached embedding. Other text uses lexical overlap. Image queries use pixel cosine. Sample-image queries use cached embeddings and do not need the sidecar.
4. Malformed input returns 400 JSON and no stack trace.

Acceptance: with the sidecar stopped, the shopper page and `/api/search` still respond.

#### T8: Frontend panel (Essential-minimal, about 3h, depends on T7)

Add a visual-search panel without redesigning the shopper page. Include held-out sample images, a text box with presets, an image/text/hybrid toggle, category chips, a diversity slider, score components, a CLIP-versus-fallback badge, and a permanent notice that this is a Fashion-MNIST 28×28 category-level demo. Budget and size controls stay disabled for that dataset, with the reason shown. No hardcoded metrics. Image upload to 28×28 grayscale is stretch work, and it is out of distribution, so it needs a warning.

Acceptance: the shopper page works with no visual query, and the panel works in fallback mode.

#### T9: Hardening, clean-state run, report, and handoff (Essential, about 3h, depends on all)

1. Follow the README from a fresh directory. Delete `ml/artifacts` and keep the model cache.
2. Run `npm test`, `ml:embed`, `eval:val`, `eval:test`, and start the app.
3. Write `docs/HANDOFF.md`, `docs/DATASETS.md`, `docs/ARCHITECTURE.md`, and `docs/REPORT_SPRINT.md` from the generated result files.
4. Add npm scripts for every command, and update `.gitignore`.

Acceptance: the clean-state commands match the README, and every number in the report matches a result file.

Stretch, only after T9: leave-one-out over the index, uncertainty plots, and the 13-pair duplicate file as a smoke test with no new threshold claim.

Not in this sprint: cross-listing matching as a product feature, a larger dataset, the developer evaluation UI, and learned rankers. Those are Level 2.

### Section 4: Execution rules

These rules apply to every remaining task:

- Implement, run, inspect the output, and fix failures.
- If the repository differs from this plan, adapt and report the difference.
- Keep the current shopper behaviour. The root app stays dependency-free and must work with no ML runtime.
- Do not fabricate metrics. Missing attributes stay null. Reported numbers come from executed scripts.
- Do not use `itemId` or label-revealing descriptions as features. Do not tune on the test split.
- No database, vector database, authentication, cloud service, or framework change.
- Commit after each green milestone.
- Stop if a checksum or licence check fails, the model cannot run, untouched tests stay broken for more than 30 minutes, or the task would require changing this plan.

The detailed phase prompts live in the task that was adopted with this plan. T0 is Prompt A and is complete. Prompts B through J are T1 through T9. Do not batch a later phase into an earlier one. Prompt A was required to finish, and its set-size decision recorded, before T1.

### Section 5: Level 2 roadmap (3–4 weeks)

Dataset work is timeboxed so it cannot block the rest.

Phase 1, about 15 hours: score candidate datasets with the Section 7 rubric. Write `docs/DATASET_DECISION.md` with quoted license text. Ingest only a dataset that passes. Keep real data under `data/real/`, separate from the fictional catalogue. If no dataset passes, use the Section 7 fallback.

Phase 2, about 20 hours: resumable embedding of the chosen images, a latency benchmark of exhaustive search, and an approximate index only if p95 latency is past the budget. A second model is optional and needs its own license and ONNX check.

Phase 3, about 15 hours: structured attributes only where present, weight selection on a labelled validation split, and a paired comparison on test. Learned weights need enough judged pairs. The working rule of thumb is at least 1,000 judged query-item pairs.

Phase 4, about 18 hours: an experimental matching module. Annotation rules come first. The 18 listings and 13 pairs remain a smoke test. Synthetic duplicates are labelled synthetic. Similar style and duplicate identity stay separate labels.

Phase 5, about 15 hours: a small versioned API and a developer page that reads result JSON only, plus a technical report.

The minimum serious set is a license-checked image dataset, a CLIP index, hybrid ranking with hard gates, an evaluation with ablations and intervals, the sprint fallback behaviour, and the report. If time runs out, cut the developer UI first, then the learned ranker, and keep matching marked experimental.

### Section 6: Evaluation protocol

For query `q`, `L_q` is the ranked list, relevance is 1 when the class matches and 0 otherwise, and `R_q` is the number of relevant items in the pool.

- Precision@K = the fraction of the top K that is relevant
- Recall@K = relevant hits in the top K divided by `R_q`, bounded by K/`R_q`
- R-precision = Precision at `R_q`
- Hit@K = 1 when any relevant item is in the top K
- MRR = the mean of 1 over the rank of the first relevant item
- DCG@K = sum of `rel_i / log2(i+1)`; NDCG@K divides by the ideal DCG of `min(K, R_q)` ones
- Coverage@K = the size of the union of top-K ids divided by N
- Intra-list diversity@K = 1 minus the mean pairwise cosine; also report the number of distinct classes. Diversity in CLIP space favours CLIP reranking, so that caveat stays next to the number
- Latency: p50 and p95 of embed time and search time, with model load reported separately
- Constraint-violation rate = returned items that fail an active gate, divided by returned items. The required value is 0

Primary aggregate: macro-average over classes, with per-class tables. A query-level paired bootstrap, 1,000 resamples, seed recorded, gives the 95% interval for each metric and for paired differences.

Leakage safeguards:

- Index and validation come from the train split. Test queries come from the test split. Ids and pixel hashes are disjoint.
- Tuning uses validation only. `eval:test` refuses a config whose hash differs from `frozen.v1.json`. Every test run is logged.
- The selection rule is written before the runs.
- Text paraphrases are written and split before any retrieval result exists.
- Normalization statistics used by a learned component come from validation, not from test.

A change is kept only when all of these hold:

1. The validation gain in macro NDCG@10 is at least 0.02 absolute.
2. The paired bootstrap interval of the test difference excludes 0.
3. No class drops by more than 0.05 without a written explanation.
4. Latency stays within budget.
5. The extra complexity is justified by the gain.

Interpretations:

- A hybrid that beats plain CLIP, with an interval excluding 0 and no unexplained class drop, can be kept. The ablation should show which signal produced the gain.
- A positive difference whose interval includes 0 is inconclusive. It is not an improvement.
- A pixel baseline that matches CLIP on a class, or an MMR setting that spends relevance for little diversity, is reported as a negative finding.

### Section 7: Dataset decision framework

Score each candidate from 0 to 2. A 0 on license or provenance disqualifies it.

1. License text read from the original publisher, including portfolio use, redistribution of derived embeddings, and commercial use.
2. Provenance, including whether retailer images were scraped.
3. Size and download cost.
4. Image resolution and quality.
5. Attribute completeness.
6. Duplicates and missing data.
7. Suitability for text retrieval, image retrieval, and matching.
8. Hardware fit. At about 45 ms/image, 50,000 images are about 40 minutes.
9. Stable URLs and checksums.

Every license statement below is UNVERIFIED. None of it was confirmed in T0.

- Fashion-MNIST is the sprint dataset because it is already in use here as the Zalando test set. The MIT license still has to be quoted from the official repository LICENSE file before a later dataset document treats it as confirmed.
- DeepFashion and DeepFashion2: recalled as research-use terms. Unverified.
- Fashion Product Images, Myntra-derived, on Kaggle: recalled as attribute-rich and scraped. Do not use unless the original terms are verified. Unverified.
- H&M Kaggle competition data: recalled as competition-restricted. Unverified.
- Amazon Reviews 2023: recalled as research-oriented, with images by URL. Unverified.
- Fashion-Gen, Polyvore, Fashion IQ, Feidegger, and hub-hosted fashion mirrors: unverified. Trace any Hugging Face copy to the original publisher.

Level 2 dataset selection:

1. Shortlist 3 or 4 candidates.
2. Quote the original license pages in `docs/DATASET_DECISION.md`. Mark each claim `CONFIRMED` with the source URL and date, or `UNVERIFIED`.
3. Download at most 500 items to inspect quality, attributes, and duplicates.
4. Score the rubric and name a winner and a runner-up.
5. Do not mix sources. Do not scrape retailers.

If no dataset passes in time, keep Fashion-MNIST for category-level retrieval and say so. Matching experiments use the synthetic duplicate protocol and are labelled synthetic. The dataset search does not block the Fashion-MNIST phases.

### Section 8: Risks and contingencies

| Risk | Prevention | Detection | Recovery |
| --- | --- | --- | --- |
| Slow inference | T0 measured throughput and selected the set size | ms/image over 300 | Shrink the sets and state the low power. Keep the baselines |
| Model cache failure | Hash model files into the manifest and stay offline | Load error or hash mismatch | One recorded re-download. The pixel arm still runs |
| Dependency clash | Keep ML dependencies in `ml/package.json` and pin them | Install or import error | Pin the prototype's working versions. The root app stays separate |
| Poor retrieval | Baselines and validation-only tuning | Below the pixel baseline | Report it. Inspect preprocessing on validation only |
| Leakage | Disjoint splits, pixel-hash dedupe, frozen config, test-run log | Scores above 0.99, or a hash refusal | Discard the affected results, re-split, rerun |
| Missing attributes | Nulls preserved, weights renormalized | Missingness report | Mark the constraint not applicable. Do not impute |
| Weak duplicate labels | Rules written first, synthetic positives labelled synthetic | Tiny n or unstable agreement | Keep the module experimental |
| Sidecar failure | Timeout, health cache, fallback tests | Sidecar-down test | Fallback with a visible badge |
| Time overrun | Essential and stretch split | A task past 1.5 times its estimate | Cut in the Section 10 order |

### Section 9: Acceptance checklists

Sprint:

- [ ] `npm test` passes, existing tests included, and the counts are reported
- [ ] `ml:embed` uses the cached model, and a second run performs zero inference
- [ ] A modified preprocess config or a truncated cache is rejected
- [ ] The split file is reproducible, and index, validation, and test are disjoint by id and pixel hash
- [ ] Image, text, and hybrid queries return ranked results
- [ ] Property and adversarial tests show 0 gate violations
- [ ] The shopper page and `/api/search` work with the sidecar stopped
- [ ] `eval:test` ran once against the frozen config, and the generated summary has per-class results, intervals, and ablations
- [ ] The report includes failures, and a script checks the document against the result files
- [ ] A clean run from the README worked

Level 2:

- [ ] `DATASET_DECISION.md` quotes confirmed license text, and the real-data manifest is reproducible
- [ ] Embeddings can resume, and exhaustive search versus an approximate index is a documented decision
- [ ] Hybrid ranking beats the baseline, or the failure is reported, with paired intervals and ablations
- [ ] Matching has a precision-recall curve and annotation rules, or it is marked experimental
- [ ] The API is versioned, and the developer page reads only result files
- [ ] Architecture notes, license notes, and a report with generated tables exist

### Section 10: Execution strategy

Work proceeds in order from T1 through T9. Do not batch phases. After a green phase, commit and continue. Stop and report when a blocker or a deviation appears, when a validation choice or a test result needs interpretation, or when a phase runs past 1.5 times its estimate.

If a task overruns, cut in this order: T8 upload, T8 polish, extra catalogue-index features, then ablations beyond the core set. Do not cut tests, the frozen-config guard, the constraint tests, or the baselines.

If T5 is unfinished at the end of day 2, T8 becomes a minimal panel and T9 keeps its full scope. On the last day, reserve the last 3 hours for T9.

Tick `docs/plan/TASKS.md` after every phase.


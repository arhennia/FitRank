# FitRank progress

## Current phase

The shopper page is a seven-question flow. `recommendFromIntent()` interprets those answers, applies hard gates, scores the profile, and reuses MMR when discovery should be varied. `recommend()` and the synthetic evaluation still use the older preference object. Image search, the CLIP prototype, and the retrieval experiment are unchanged.

`searchCatalogue()` in `js/retrieval/search.js` is the integrated catalogue path from plan task L. With no query text, or an empty soft profile, it returns the same ids and scores as `recommendFromIntent()`. Otherwise it merges the attribute shortlist with text cosine, gates that pool before fusion, and explains which answers drove the attribute signal. A gate failure stays out even when cosine is 1. Fusion weights are marked `weightsValidated: false`. Sample responses for three intents, using stand-in vectors rather than CLIP, are in `ml/results/shopper/search-samples.json`. The page does not call this function. Fashion-MNIST remains a separate experiment.

Task M adds the shopper judging protocol and does not fill grades. `ml/data/personas.v1.json` has 24 personas, 8 validation and 16 test, with 3 tight cases. SHA-256 `a1c7397d0a25c966f2d6daa0b5dea04cdd813ff85aab17c3f2df68794b918180` is in `ml/data/personas.v1.sha256`. `docs/JUDGING.md` was written before the pools. The pools are the union of `legacy_baseline` and `current_scorer` gated lists, shuffled, with the judgment column empty: 27 validation rows and 42 test rows. `embed_only`, `hybrid`, and `hybrid_mmr` are left out because no catalogue text embedding was passed. Arm labels are in `ml/results/shopper/arm-map.<split>.json`. Eligible counts on the fictional catalogue are 0, 1, 2, 3, 3, 4, 4, 10 on validation and 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 8 on test. The three zeros are the tight personas. Swapping `trigger` never changed `current_scorer` order. Budget, category, and size each changed eligibility. `configs/frozen.shopper.v1.json` is not written. The tune script refuses the test split and refuses the empty validation file. `npm test` after task M: 153 passed, 0 failed.

Task T7 adds `POST /api/search` and `GET /api/sample-queries` on the root server. A catalogue body carries `intentProfile` and is ranked by `current_scorer` in-process, with `experiment: false`. A Fashion-MNIST body sets `experiment: true`. New text and uploaded 28×28 images go to `ml/src/server/inference.js` on `127.0.0.1:8787`, which loads CLIP on the first embed. Preset validation text and sample images use cached embeddings and do not need that process. If it is stopped, other text uses lexical class overlap and uploaded images use pixel cosine. Price, size, and stock on a Fashion-MNIST request are reported as not applicable. The shopper page is still the static questionnaire. `npm run sidecar` starts the embedding process. `npm test`: 159 passed, 0 failed.

`PLAN.md` now has a governing 2.1 plan, "FitRank 2.1 revised plan (v2)". The shopping task is the spine, and Fashion-MNIST is a labelled experiment. The 12 Oct engineering plan is kept as v1 and does not govern new work. The `IntentProfile` schema is implemented in `js/intent/` and covered by `test/intent-profile.test.js`.

FitRank 2.0 is complete, including the candidate-generation benchmark and recommendation runtime. Two 2.1 preparations exist and are not wired into the shopper ranking: `data/listings/` and `prototypes/moodboard/`. A REST API is still only specified in `PLAN.md`.

## Audit of the v1 prototype

Inspected `PLAN.md`, `PROGRESS.md`, `README.md`, the catalogue, and the validation, filter, score, rank, explanation, comparison, interface, server, and test modules.

`node --test` on 12 Oct 2026, before 2.0 edits: 16 passed, 0 failed, 0 skipped.

What already worked and was kept:

- `recommend()` validates preferences, applies hard gates, scores with renormalised weights, ranks by score then id, and explains from recorded matches.
- The page calls that function. Results are not hardcoded.
- A price equal to the budget stays. An empty category list does not wipe the catalogue. Malformed rows are skipped.
- Missing optional fields do not throw and do not earn a fake perfect score.
- Comparison stops at three ids and does not mutate the caller’s array.
- The stack is HTML, CSS, vanilla ES modules, and a zero-dependency static server.

The v1 category weight was removed from the hybrid score on purpose. A hard gate should not also award points. The frozen formula stays in `js/baseline.js` so evaluation compares both scorers on the same candidate set.

## Completed tasks

- Rewrote `PLAN.md` as the 2.0 source of truth, including the 2.1 boundary and the three naming limits.
- Extended the catalogue to 60 synthetic products, including the leather work tote and the canvas work tote as similar alternatives.
- Added catalogue validation and session-only JSON/CSV import.
- Separated `generateCandidates` from hybrid scoring. Empty results name the limiting gate.
- Added weighted content similarity, Bayesian review smoothing, deterministic MMR, unique labels, and explanations that match the recorded components.
- Added hand-labelled scenarios and metrics: Precision@5, NDCG@5, catalogue coverage, intra-list diversity, and hard-constraint violation rate.
- Wired the existing page to the engine: situation defaults, breakdowns, similar items, diversity mode, comparison, session feedback, import, and the evaluation runner.
- Timed the exhaustive candidate scan at 60, 1,000, and 10,000 rows. Violations were 0. Candidate counts were 7, 28, and 280.
- Added strategy runtime to the recommendation benchmark and to the evaluation table. The quality numbers were left as measured, including the cases where hybrid precision and NDCG are lower.
- Added a hand-labelled multi-seller listing set with similar style, probable duplicate, attribute conflict, and unrelated pairs.
- Ran a local CLIP ViT-B/32 trial on 40 Fashion-MNIST images. It is not part of the page. Mean Precision@3 was 0.500 against a chance level of 0.100.

## Test results

`node --test` on 12 Oct 2026, after the benchmarks and the preparation sets: 48 passed, 0 failed, 0 skipped. Duration about 1.1 seconds. The CLIP weights are not downloaded by the test suite.

Synthetic evaluation, same day. Labels were written from attributes, not from the ranker.

| Scenario | Baseline P@5 | Hybrid P@5 | Baseline NDCG | Hybrid NDCG | Baseline diversity | Hybrid diversity |
| --- | --- | --- | --- | --- | --- | --- |
| Strict budget and category | 0.600 | 0.600 | 1.000 | 1.000 | 0.435 | 0.435 |
| Comfort and versatility | 0.800 | 0.400 | 0.853 | 0.692 | 0.738 | 0.795 |
| Similar to a reference loafer | 0.800 | 0.800 | 0.758 | 0.963 | 0.447 | 0.447 |
| Conflicting soft preferences | 0.800 | 0.600 | 0.761 | 0.610 | 0.728 | 0.713 |
| Few eligible products | 0.200 | 0.200 | 1.000 | 1.000 | — | — |
| No eligible products | — | — | — | — | — | — |

Catalogue coverage is 0.983 for both strategies. Violation rate is 0.000 on every non-empty list and unset on the empty list.

One timing of those strategy calls, in milliseconds. Hybrid includes explanations and labels.

| Scenario | Baseline ms | Hybrid ms |
| --- | --- | --- |
| Strict budget and category | 1.11 | 32.08 |
| Comfort and versatility | 0.67 | 207.55 |
| Similar to a reference loafer | 0.16 | 1.55 |
| Conflicting soft preferences | 0.69 | 165.92 |
| Few eligible products | 0.07 | 0.34 |
| No eligible products | 0.03 | 0.39 |
| Total | 2.73 | 407.83 |

Candidate-generation benchmark, same day, exhaustive scan, fixed shopper (budget ₹8,000, Handbags and Sneakers, in stock, size one-size):

| Catalogue | Rows | Runtime | Candidates | Violations |
| --- | --- | --- | --- | --- |
| Published | 60 | 0.61 ms | 7 | 0 |
| Synthetic | 1,000 | 1.85 ms | 28 | 0 |
| Synthetic | 10,000 | 13.06 ms | 280 | 0 |

CLIP trial, same day, `Xenova/clip-vit-base-patch32` q8 on CPU. Mean Precision@3 0.500, mean NDCG@3 0.517, class-name top-1 0.700, mean embed 43.5 ms. Coats and T-shirts were weak. Details are in `prototypes/moodboard/README.md`.

## Browser check

Checked on 12 Oct 2026 at `http://127.0.0.1:5173` in the Cursor browser.

- College fills everyday and a comfort emphasis, and the suggestion note says the defaults can be changed. Adding Work and Handbags still runs the real engine.
- Relevance order and diversity-aware order both returned 11 in-stock handbags. Diversity moved Market Shopper ahead of Structured Canvas Tote and placed Evening Clutch ahead of the more similar Navy Bucket Bag.
- Show similar listed attribute overlap and said similarity does not mean the same item.
- Two selected products opened a comparison with match score, budget fit, review estimate, and similarity. The compare control stayed disabled at one selection and reset after a new search.
- More like this dropped the chosen bag from the list and said the reference item is not ranked against itself.
- Budget 1 produced "No products match these constraints. The limiting constraint is budget. 60 removed by budget."
- Run synthetic evaluation rendered the metric table, including the comfort precision drop from 0.800 to 0.400, runtime columns, and the note that coverage counts the full eligible set. One page run reported baseline 2.6 ms and hybrid 330.8 ms.
- At a 390px width the page did not scroll horizontally. The wider evaluation table scrolls inside its own container.

## Known limits

- Coverage is saturated because several scenarios are broad. It does not show a diversity improvement.
- MMR can lower precision and NDCG. On conflicting tastes it also lowered intra-list diversity slightly.
- Comfort labels are a hand-picked subset, so a high-comfort product can rank highly and miss those labels. That is the point of keeping the labels independent of the ranker.
- The page does not use a trained model. The CLIP trial is a separate folder, and its coat and T-shirt retrieval was poor.
- There is no duplicate detector. The listing file is a hand-labelled set for a later one.
- There is no fair-price judgement.

## Retrieval experiment, 12 Oct 2026

`node --test`: 64 passed, 0 failed. The shopper suite is included. CLIP weights are not downloaded by the tests.

Fashion-MNIST test split, K = 10, 1,000 index images, chance precision 0.100, recall ceiling 0.100. Validation was not used to change the protocol.

| Track | Result |
| --- | --- |
| Image, random / pixel / CLIP | Precision 0.094 / 0.684 / 0.721. NDCG 0.091 / 0.704 / 0.733. Failures 93 / 22 / 23 of 100. |
| Image, no text query | Hybrid matched CLIP. |
| Literal text, lexical / CLIP | Precision 0.900 / 0.630. Lexical wins. The T-shirt query ties Shirt because both class names contain "shirt", and the id order then prefers Shirt. |
| Paraphrase text, lexical / CLIP | Precision 0.800 / 0.800. NDCG 0.800 / 0.815. CLIP's coat query was the weak one. |
| Image plus paraphrase | CLIP text 0.800, hybrid 0.766, CLIP image 0.721. Hybrid was between the two signals and below text alone. |
| Diversity on the top 50 | Precision 0.766 to 0.730. Pixel diversity 0.188 to 0.217. |

Coats: pixel precision 0.580, CLIP 0.510. Shirts: CLIP 0.340. Trousers and sandals were the strong CLIP classes. A 1,000-vector query was about 5 ms. First embed: 49.3 ms per image, 1,200 images, text tower downloaded once. The next embed reused all 1,200 vectors and did not download weights.

Duplicate pairs: 13, no held-out split. Exact name plus declared fields: 12 correct. The miss is `pair-conflict-loafer-material`, whose names differ. CLIP name cosine at 0.90: 10 correct. The three similar-style names scored 0.908 to 0.962 and were called conflicts. Descriptions and `itemId` were not features.

Budget, stock, and size on the image index returned the fail-safe errors. A coat category gate kept 100 coats and 0 violations.

## Next concrete task

The active execution plan is the sprint section of `PLAN.md`. T4 is done. The next task is T5, one test-split run against `configs/frozen.v1.json`. The test split was not scored during tuning. The frozen config hash is `5d3d774895e1a329336d6250ed4e7ad6b7f8fc806ab09c832f65547d2ceedda0`.

## Sprint T4, 13 Oct 2026

Section 6 metrics and a 1,000-draw query bootstrap live in `js/retrieval/`. The hand checks are in `test/retrieval-metrics.test.js`. `npm run eval:val` scored the validation grid and wrote `ml/results/val/`. `npm run eval:arm -- --split test` refuses to run. `npm test`: 106 passed, 0 failed. No model weights are loaded by the metric tests.

The text queries were written before the run, in `ml/data/text-queries.v1.json`: 10 classes, 5 paraphrases each, 3 validation and 2 test. Each class has a validation paraphrase that shares no class-name token with the label. The selection rule is `ml/config/tuning.v1.json`. It was not edited after the scores existed.

The as-is index and validation caches were reused with no inference. Inverted and padded embeddings were computed for the index (2,000) and validation (300) only. The test split was not embedded again. Paraphrase text was embedded once, including the held-out strings, and those strings were not used as queries.

Validation, macro over classes, K = 10. Hybrid queries are each validation image paired with each validation paraphrase of its class (900 queries). Image and pixel queries are the 300 validation images. Text and lexical queries are the 30 validation paraphrases. Recall@10 cannot exceed 0.05, because each class has 200 index items. No price, size, or stock gate was active. The empty-constraint check on returned rows had violation rate 0 on every arm.

| Arm | Macro NDCG@10 | 95% interval | Precision@10 |
| --- | ---: | --- | ---: |
| Hybrid, inverted, literal-product, z-score, alpha 0.5, lambda 1 | 0.798 | 0.786 to 0.809 | 0.794 |
| Same arm, lambda 0.9 (frozen) | 0.798 | 0.786 to 0.809 | 0.794 |
| Image, as-is | 0.758 | 0.734 to 0.782 | 0.744 |
| Image, inverted | 0.758 | 0.729 to 0.783 | 0.746 |
| Image, padded | 0.729 | 0.704 to 0.756 | 0.717 |
| Text, inverted, literal-photo | 0.724 | 0.631 to 0.809 | 0.713 |
| Pixel, mean-centered | 0.705 | 0.677 to 0.733 | 0.694 |
| Pixel, raw | 0.698 | 0.670 to 0.725 | 0.687 |
| Lexical, literal-photo | 0.667 | 0.475 to 0.850 | 0.667 |

The frozen arm's other macro figures: Recall@10 0.040, R-precision 0.559, Hit@10 0.998, MRR 0.887, intra-list diversity 0.058, distinct classes 2.006, coverage@10 0.510. Diversity is cosine distance in the inverted CLIP space. Top-10 neighbours from one class sit close together, so the diversity number stays small. Coat NDCG@10 was 0.526 and Shirt was 0.532. Trouser was 1.000, Bag 0.983, Ankle boot 0.965, Sandal 0.935.

Z-score minus the matched RRF arm was +0.024 macro NDCG@10. The paired interval was 0.017 to 0.031 and excluded 0. Image, text, pixel, and lexical do not share the hybrid query list, so those gaps are not paired tests. Lexical and text intervals are wide because each arm has 30 queries.

The lambda rule selected 0.9. Diversity rose by 0.000066 and NDCG fell by 0.000093. The paired interval for that NDCG change was -0.0004 to +0.0002 and includes 0. The rule had no minimum gain, and it was not changed after the run. The gain is not evidence that MMR improved the lists. Search time on the frozen arm, after the score matrix was built, was p50 69.1 ms and p95 93.9 ms. The same arm at lambda 1, which does not run MMR, was p50 0.9 ms. The image-only arm was p50 1.1 ms.

`configs/frozen.v1.json` records inverted polarity, the literal-product template, z-score fusion, alpha 0.5, and lambda 0.9. MMR reranks the top 50 fused-score items. That pool size was written down before the run.

## Sprint T3, 12 Oct 2026

`js/retrieval/` scores cached vectors in plain JavaScript. `vectorStore.js` loads `manifest.json`, `ids.json`, and `emb.f32` and checks the row count, id order, and unit norms. `topK.js` scans every row with a min-heap. A false mask entry is not scored. Equal scores break by id. CLIP image-to-image and text-to-image are dot products against the image matrix. Pixel cosine has raw and mean-centered variants. Lexical overlap uses class-name tokens only, so "tee" does not match "T-shirt/top".

An active price, category, size, or stock constraint fails when that attribute is null. The null is not replaced. Across 1,000 random item and constraint pairs, the gate returned zero violations. An item with similarity 1.0 that misses a price gate is absent from the result list.

Fusion z-scores the gate-eligible pool. A pool smaller than 30 rows uses a stored mean and standard deviation. A missing signal is dropped and the remaining weights are renormalized. Reciprocal rank fusion uses k = 60 and does not insert a zero for a missing list. MMR at lambda 1 matches score-then-id order. An item with no embedding gets diversity term 0 and is flagged. Explanation sentences quote the numbers on the row.

`npm test`: 93 passed, 0 failed. No model weights are loaded by these tests. The shopper scorer in `js/score.js` is unchanged.

## Sprint T2, 12 Oct 2026

`npm run ml:embed` wrote CLIP caches for the index (2,000), validation (300), test (500), 30 prompt strings, and 60 catalogue texts. The second run of every target reported `newlyEmbedded: 0` and `inference: false`. Remote model download stayed off. The weights were read from `prototypes/moodboard/.cache`.

The active preprocess variant is `as-is`. Inverted and padded are defined and were not scored. The three prompt templates were embedded and none was selected. Catalogue text uses name and description only. The audit flagged 0 of 60 products.

`npm test`: 74 passed, 0 failed. The new tests cover cache reuse, a preprocess-hash change, truncation, id order, non-unit vectors, and a 20-image re-embed with cosine at least 0.9999.

## Sprint T1, 12 Oct 2026

`npm run ml:split` checked the four Fashion-MNIST gzip files against the MD5 values in the official README. The train files were downloaded from `zalandoresearch/fashion-mnist`. The test files already on disk matched those checksums. No query pixel hash collided with the index or the other query split. Two runs wrote the same split file, SHA-256 `ce6408f8bec115dcdefe9fcac045b2a607233f88a99880f36c8f03d7333520b7`.

`npm test`: 69 passed, 0 failed. The five new tests cover truncated IDX files, deterministic splits, a pixel-hash collision, and the committed split.

Pullover, Sandal, Bag, and Ankle boot have `mapped: null`. The other six classes map onto a FitRank category. Price, brand, color, size, stock, and rating are null on all 2,800 rows. The Zalando MIT license text is in `ml/data/fashion-mnist-LICENSE.txt`.

## Sprint audit, 12 Oct 2026

`npm test`: 64 passed, 0 failed. The sprint plan expected 48, which was the count before the retrieval tests existed.

The moodboard prototype was rerun from the local cache. Precision@3 was 0.500, NDCG@3 was 0.5173, and class top-1 was 0.700. Mean embed time was 42.6 ms. After a warm-up, 64 images at batch size 1 took 45.834 ms each, so the set-size rule selects index 2,000, validation 300, and test 500. Details are in `docs/AUDIT.md`.

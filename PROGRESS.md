# FitRank progress

## Current phase

FitRank 2.0 is complete, including the candidate-generation benchmark and recommendation runtime. Two 2.1 preparations exist and are not wired into the page: `data/listings/` and `prototypes/moodboard/`. Open aesthetic tags and a REST API are still only specified in `PLAN.md`.

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

The active execution plan is the sprint section of `PLAN.md`. T1 is done. The next task is T2, the embedding cache. The sprint split is index 2,000, validation 300, and test 500, in `ml/data/splits/fmnist.v1.json`.

## Sprint T1, 12 Oct 2026

`npm run ml:split` checked the four Fashion-MNIST gzip files against the MD5 values in the official README. The train files were downloaded from `zalandoresearch/fashion-mnist`. The test files already on disk matched those checksums. No query pixel hash collided with the index or the other query split. Two runs wrote the same split file, SHA-256 `ce6408f8bec115dcdefe9fcac045b2a607233f88a99880f36c8f03d7333520b7`.

`npm test`: 69 passed, 0 failed. The five new tests cover truncated IDX files, deterministic splits, a pixel-hash collision, and the committed split.

Pullover, Sandal, Bag, and Ankle boot have `mapped: null`. The other six classes map onto a FitRank category. Price, brand, color, size, stock, and rating are null on all 2,800 rows. The Zalando MIT license text is in `ml/data/fashion-mnist-LICENSE.txt`.

## Sprint audit, 12 Oct 2026

`npm test`: 64 passed, 0 failed. The sprint plan expected 48, which was the count before the retrieval tests existed.

The moodboard prototype was rerun from the local cache. Precision@3 was 0.500, NDCG@3 was 0.5173, and class top-1 was 0.700. Mean embed time was 42.6 ms. After a warm-up, 64 images at batch size 1 took 45.834 ms each, so the set-size rule selects index 2,000, validation 300, and test 500. Details are in `docs/AUDIT.md`.

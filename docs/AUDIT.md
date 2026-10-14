# T0 audit, 12 Oct 2026

This audit checks the sprint plan's reported facts against the repository. Numbers below come from commands run in this session.

## Module system

Root `package.json` has `"type": "module"` and no `dependencies`. Tests and the page use ES modules. `server.js` is ESM and serves static files. `POST /api/retrieve` dynamically imports `experiments/search.mjs`.

`@huggingface/transformers` 4.3.1 is installed only under `prototypes/moodboard/`. The root package does not depend on it. Calling `/api/retrieve` still loads that library inside the root Node process, because `experiments/search.mjs` reaches `prototypes/moodboard/clipRuntime.mjs`. The sprint wants that inference in a sidecar. It is not isolated yet.

## Tests

Command: `npm test` (`node --test`). Exit code 0.

```text
# tests 64
# suites 26
# pass 64
# fail 0
# cancelled 0
# skipped 0
# duration_ms 1274.3127
```

The plan expected 48. `PROGRESS.md` records 48 as the count before the retrieval tests were added. The current 64 includes those retrieval tests. Nothing was reverted.

## Prototype rerun

Command: `node retrieve.mjs` in `prototypes/moodboard`. Exit code 0. Elapsed 8893 ms. The script does not set `local_files_only`. This run loaded q8 from the existing `.cache` (vision load 537.7 ms, image-text load 1389.8 ms) and did not show a download.

```json
{
  "embeddingShape": [1, 512],
  "meanPrecisionAtK": 0.5,
  "meanNdcgAtK": 0.5173196815056891,
  "classTop1Accuracy": 0.7,
  "meanEmbedMs": 42.565352499999996,
  "loadMs": { "vision": 537.7102, "imageText": 1389.7746000000002 },
  "visionDtype": "q8",
  "imageTextDtype": "q8"
}
```

Reported values were Precision@3 0.500, NDCG@3 0.517, top-1 0.700, about 43.5 ms/image. Precision and top-1 match. NDCG matches at three decimals. The embed time is a new measurement of the same 40 images, not a quality change. The script rewrote `prototypes/moodboard/results.json` with these timings. The moodboard test still requires top-1 accuracy 0.700, which this run produced.

The trial is 10 queries and 30 candidates. Chance Precision@3 in that protocol is 0.100, as the script records `K / labels.products.length`.

## Throughput

64 rendered Fashion-MNIST PNGs from `experiments/fashion-mnist/images`, after one warm-up image. Model `Xenova/clip-vit-base-patch32`, dtype q8, CPU, `local_files_only: true`, remote models disabled. Exit code 0. Load 530.15 ms. Warm-up 83.32 ms. Warm-up shape `[1, 512]`.

| Batch | Images | Total ms | ms/image | Output shape |
| ---: | ---: | ---: | ---: | --- |
| 1 | 64 | 2933.39 | 45.834 | [1, 512] |
| 8 | 64 | 1926.01 | 30.094 | [8, 512] |
| 32 | 64 | 1801.38 | 28.147 | [32, 512] |

## Machine

- Node v22.20.0
- Windows 10.0.26300, x64
- AMD Ryzen 7 8840HS, 16 logical processors
- RAM 33,585,221,632 bytes total, 11,487,850,496 bytes free at the check
- Drive C: 260.71 GB used, 183.08 GB free
- `prototypes/moodboard/.cache`: 295.2 MB
- `experiments/cache`: 13.8 MB
- `prototypes/moodboard/node_modules`: 472.6 MB

`df` and `nproc` are not the Windows commands. Free disk came from `Get-PSDrive`. Processor count came from `os.cpus().length`.

## Fashion-MNIST files

Present:

- `experiments/fashion-mnist/data/t10k-images-idx3-ubyte.gz` (4,422,102 bytes)
- `experiments/fashion-mnist/data/t10k-labels-idx1-ubyte.gz` (5,148 bytes)
- 1,200 PNGs under `experiments/fashion-mnist/images/`
- 40 PNGs under `prototypes/moodboard/images/`

Absent:

- `train-images-idx3-ubyte.gz`
- `train-labels-idx1-ubyte.gz`

An earlier experiment already partitioned the test set, in file order, into 100 index, 10 validation, and 10 test images per class. Those results are in `experiments/retrieval-results.json`. That protocol is not the sprint split. The train files required by the sprint are still missing.

## Catalogue

`js/catalogue.js` exports 60 fictional products. Fields used by a product include `id`, `name`, `category`, `brand`, `colour`, `colours`, `styles`, `silhouette`, `material`, `occasions`, `comfortRating`, `versatilityRating`, `formalityRating`, `price`, `currency`, `availability`, `sizes`, `averageRating`, `reviewCount`, `care`, and `description`. Prices, brands, ratings, and review counts are synthetic.

Categories in `js/weights.js`: Handbags, Jackets and coats, Dresses and skirts, Heels, Flats and loafers, Accessories, Tops, Trousers, Sneakers.

Fashion-MNIST class names do not all match those strings. A later mapping has to stay null where it is not clean.

## Set-size decision

The rule uses measured milliseconds per image. Batch size 1, the slower figure, is 45.834 ms/image. That is at or below 100, so the sprint sizes are:

- Index: 2,000 images, 200 per class
- Validation: 300 images, 30 per class
- Test: 500 images, 50 per class

This is not the low-power branch. With 200 relevant index images in a class, Recall@10 cannot exceed 0.05. Later reports need Recall at larger cutoffs and R-precision beside Recall@10.

At 45.834 ms/image, 2,800 images are about 2.1 minutes of embedding before batching. Batch 32 measured 28.147 ms/image. Free disk is 183 GB. The train gzip files are not here, so T1 still has to obtain them from the official Fashion-MNIST repository and check the checksums before building this split.

## What this audit did not change

No new retrieval code, no new split, and no threshold change. The published retrieval results were not recomputed.

## Intent flow

Written 14 Oct 2026 for the v2 plan, from the code that is already on the shopper page. This section does not change scoring. `js/intent/` now builds the `IntentProfile` this section describes. `js/retrieval/search.js` can rank from that profile. The shopper page still calls `recommendFromIntent()` directly. Task M pools that search for human grades. The judgment column in `ml/data/judging/` is empty, and shopper fusion weights are not frozen.

### Where answers live

The page calls `mountShopper` in `js/shopping/page.js`. State is `createFlowState()` in `js/shopping/flow.js`: `answers` for the seven questions and `constraints` for budget, category, size, and the optional gates. `setAnswer` stores one id for a single-select question and a list for a multi-select question. Choosing "A balance of several of these" clears the other priority ticks.

`recommendFromIntent(products, { answers, constraints })` in `js/shopping/recommendIntent.js` is the search path. It validates, calls `interpretShoppingProfile(answers)`, applies hard gates, scores with `scoreIntentProduct`, then ranks by relevance or by the existing MMR rerank. It does not call `recommend()` and it does not call an embedding index.

`recommend(products, preferences)` still serves the older preference object and the synthetic evaluation. The questionnaire does not build that object.

### Seven questions

Option ids are the stored values. Labels are the words on the page. Effects are summed, then saturated at 2, so a third mention of the same signal does not raise its weight.

1. `trigger` — "What brought you here today?" Single select.
   - `occasion` — I need something for a specific occasion. Sets `purchaseTrigger` and votes for mission `occasion`.
   - `gap` — Something in my wardrobe is missing. Votes for `gap-fill` and adds wardrobe uncertainty.
   - `replace` — I need to replace something worn out. Votes for `replace`. Adds quality and versatility evidence.
   - `spotted` — I spotted something I like. Votes for `temptation`.
   - `explore` — I'm exploring and looking for inspiration. Votes for `explore` and sets discovery evidence. This trigger selects diverse ranking.
   - `deal` — I found a good deal and want to see if it's worth it. Votes for `deal-check`. Adds value and price evidence.

2. `outcome` — "What would make this purchase feel worth it?" Single select.
   - `repeat-wear` — I'll wear it again and again. Versatility evidence, mission `versatile`.
   - `completes` — It completes outfits I already own. Mission `gap-fill`, wardrobe uncertainty, versatility.
   - `new-look` — It gives me a new look or aesthetic. Mission `statement`, distinctiveness, novelty.
   - `occasion-special` — It makes a particular occasion feel special. Mission `occasion`, occasion-fit evidence.
   - `unique` — It's something unique I wouldn't normally find. Distinctiveness and novelty. Split mission vote.
   - `deal-quality` — It's a great deal for the quality. Mission `deal-check`, value, quality.

3. `role` — "How do you want this piece to fit into your wardrobe?" Single select. Sets `wardrobeRole`.
   - `versatile` — A versatile piece that works with many outfits.
   - `basic` — A missing basic I should already have.
   - `connector` — A piece that connects several existing items.
   - `statement` — A statement piece that stands out.
   - `different` — Something different from what I usually wear.
   - `complete-look` — A complete look built around this purchase.

4. `discovery` — "Which sounds most like how you want to shop today?" Single select. Sets `discoveryMode`.
   - `focused` — I know what I need; help me find the best option. Relevance order.
   - `style-new` — I know my style but want to discover something new. Diverse order.
   - `aesthetic-explore` — I want to explore a particular aesthetic. Diverse order.
   - `compare` — I want to compare options before committing. Diverse order.
   - `surprise` — I'm open to surprises if the recommendation makes sense. Diverse order.
   - `temptation` — I'm tempted by something, but want to know if I should buy it. Relevance order. Adds value evidence.

5. `contexts` — "Where and how will you actually wear it?" Multi select. These ids are not the catalogue occasion list. `contextSignal` maps them onto catalogue occasions `everyday`, `work`, `evening`, `travel`, and `special`.
   - `university` — University or everyday life. Everyday, formality 2.
   - `work` — Work, internship or interviews. Work, formality 4.
   - `cafes` — Cafés, outings or dates. Everyday and evening.
   - `parties` — Parties, concerts or festivals. Evening, formality 4.
   - `weddings` — Weddings, festivals or family occasions. Special, plus a smaller evening weight. Formality 5.
   - `travel` — Travel or holidays. Travel.
   - `home` — At home or for comfort. A weak everyday weight, plus comfort evidence.
   - `several` — Several different settings. Everyday, work, travel, and evening.

6. `aesthetics` — "Which styles feel most like what you want right now?" Multi select. A product can carry several tags with unequal `relevance`. The score is the average of the selected tags, so one match is partial credit. Tags live in `js/shopping/annotations.js` and are merged only when the product field is empty. They are synthetic.
   - `goth`, `grunge`, `dark-academia`, `coquette`, `fairycore`, `y2k`, `streetwear`, `vintage`, `preppy`, `minimal`, `artistic`.
   - `open` — I'm exploring and don't have a fixed aesthetic. This does not add an aesthetic score. It sets `exploringAesthetic`. If no named aesthetic is selected, aesthetic match is not scored.

7. `priorities` — "What matters most when choosing between good options?" Multi select.
   - `versatility`, `comfort`, `distinctive`, `quality`, `value` — each adds that score component.
   - `fit` — A flattering fit and silhouette. Collected, then forced to 0 in `scoringPreferences`. Unused for ranking.
   - `not-owned` — Something I don't already own. Novelty and distinctiveness evidence. There is no owned-wardrobe field, so this cannot check ownership.
   - `price` — The lowest price or a genuinely good deal. A separate price component is used only when value is inactive. Value already includes budget headroom, so the two are not stacked.
   - `balance` — A balance of several of these. Other priority ticks are ignored. Empty trade-off keys are set to 0.5. This is not an extra bonus.

### What reaches the scorer

`intentWeights` in `js/shopping/scoreIntent.js` turns the profile into component weights. Base weights, before saturation, are context 26, aesthetic 18, versatility 14, distinctiveness 14, comfort 12, quality 12, value 16, price 6, wardrobe role 12. Similarity 16 and avoid 14 apply only when the shopper uses "More like this" or "Less like this".

| Answer signal | Score component |
| --- | --- |
| Any selected context | `context`, from catalogue `occasions` and `formalityRating` |
| Named aesthetics | `aesthetic`, from product `aesthetics` relevance |
| Versatility evidence, unless the role already uses it | `versatility`, from `versatilityRating` or occasion count |
| Distinctiveness evidence, unless the role already uses it | `distinctiveness`, from styles and aesthetic tags |
| Comfort evidence | `comfort`, from `comfortRating` |
| Quality evidence | `quality`, Bayesian smoothing of `averageRating` and `reviewCount` |
| Value evidence | `value`, geometric mean of that quality estimate and room under the budget |
| Price evidence when value is off | `price`, room under the budget |
| Any wardrobe role | `wardrobeRole`, a role-specific reading of versatility, distinctiveness, occasions, or formality |

`occasionFit`, `basics`, `focus`, `discovery`, and `wardrobeUncertainty` change the mission, the ranking mode, or the explanation. They do not have their own score weight. Mission is the highest vote, with `MISSION_ORDER` breaking ties. It is a label, not a multiplier.

Hard constraints are not score bonuses. `js/shopping/gates.js` applies category, colour, material, fit, brand, season, dress code, and avoid rules only when the shopper set them. A missing product field fails an active rule. Budget, stock, and size go through `generateCandidates` first. Category ids are the fine list in `SHOP_CATEGORIES`. A missing `shopCategory` matches a coarse catalogue category only for handbags, sneakers, and heels.

### Catalogue fields and vocabularies

Published rows in `js/catalogue.js` use `id`, `name`, `category`, `brand`, `colour`, `colours`, `styles`, `silhouette`, `material`, `occasions`, `comfortRating`, `versatilityRating`, `formalityRating`, `price`, `currency`, `availability`, `sizes`, `averageRating`, `reviewCount`, `care`, and `description`.

Closed lists in `js/weights.js`:

- Categories: Handbags, Jackets and coats, Dresses and skirts, Heels, Flats and loafers, Accessories, Tops, Trousers, Sneakers.
- Occasions: everyday, work, evening, travel, special.
- Styles: minimalist, structured, classic, bold, artistic.
- Colours: black, brown, navy, beige, white, burgundy, green, red, tan, grey.

The questionnaire uses a finer category list and a finer aesthetic list than those closed lists. Aesthetic tags are not on the published rows until `withShoppingAnnotations` fills them. There is no discount, no owned wardrobe, and no flattering-fit measurement.

### Collected but unused

- `priorities.fit` is stored and then set to 0. It never changes a score or a gate. The separate optional fit constraint (`relaxed`, `oversized`, `regular`, `fitted`, `wide-leg`) is a hard gate when the shopper sets it. That control is not the priority answer.
- `aesthetics.open` does not score aesthetic match. It is used only as a flag for ranking mode and the explanation, so it is not on the unused list.
- No questionnaire answer sets `imageSeed`. Image search stays on the Fashion-MNIST panel.

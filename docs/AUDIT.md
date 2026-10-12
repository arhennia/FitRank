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

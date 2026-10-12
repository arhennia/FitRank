# Moodboard retrieval trial

This folder is a local trial of a pretrained image-text model. The FitRank page does not import it, and `npm test` in the project root does not download the weights.

The question for this trial: given a small inspiration image, which fashion products land in the top 3, and can the same model name the garment?

## Setup

Measured on 12 Oct 2026 with Node.js 22.20.0, on CPU.

```bash
cd prototypes/moodboard
npm install
node prepare.mjs
node retrieve.mjs
```

- `npm install` installs `@huggingface/transformers` 4.3.1 in this folder only. The FitRank page stays free of installed libraries.
- `prepare.mjs` downloads the Fashion-MNIST test set and writes 10 inspiration images plus 30 product images. The images are the first four test-set examples of each class. Zalando Research released Fashion-MNIST under the MIT License.
- `retrieve.mjs` downloads `Xenova/clip-vit-base-patch32` in q8 and caches it in `.cache/`. That cache is not part of the app. The first measured load took 20.5 s for the vision tower and 34.0 s for the image-text model, including the download.
- No paid API. After the weights are cached, a later run does not need the network.

## What was measured

Labels in `labels.json` are the dataset class ids. The script reads them and does not rewrite them. Each class contributes one inspiration image and three other images of that class. Chance Precision@3 is 3/30 = 0.100.

Image-to-image retrieval uses the CLIP vision projection. The embedding shape was `[1, 512]`.

| Measure | Result |
| --- | --- |
| Mean Precision@3 | 0.500 |
| Mean NDCG@3 | 0.517 |
| Class name top-1, prompt "a photo of a {}" | 0.700 (7 of 10) |
| Mean time to embed one image | 43.5 ms |
| Time to rank all 10 queries after the embeddings existed | 5.4 ms |
| Time for the 10 image-to-text class checks | 715 ms |

| Inspiration | Precision@3 | NDCG@3 | Top 3 product classes | Text label |
| --- | --- | --- | --- | --- |
| T-shirt/top | 0.000 | 0.000 | Shirt, Shirt, Coat | T-shirt/top |
| Trouser | 1.000 | 1.000 | Trouser, Trouser, Trouser | Ankle boot |
| Pullover | 0.333 | 0.469 | Pullover, Shirt, Coat | T-shirt/top |
| Dress | 0.333 | 0.296 | Coat, Dress, Shirt | Dress |
| Coat | 0.000 | 0.000 | Shirt, Dress, Pullover | Coat |
| Sandal | 1.000 | 1.000 | Sandal, Sandal, Sandal | Sandal |
| Shirt | 0.667 | 0.704 | Shirt, Pullover, Shirt | Shirt |
| Sneaker | 0.667 | 0.704 | Sneaker, Ankle boot, Sneaker | Sneaker |
| Bag | 0.333 | 0.296 | Sandal, Bag, T-shirt/top | Bag |
| Ankle boot | 0.667 | 0.704 | Ankle boot, Sneaker, Ankle boot | Sneaker |

Retrieval is above chance. It is not even across classes. Trousers and sandals were exact. Coats and T-shirts were confused with other tops. The text label was right for the T-shirt and the coat even when the product ranking missed them, and wrong for the trousers even when the product ranking was exact. The images are 28×28 grayscale photographs, resized by the CLIP preprocessor. That is a hard probe, and these numbers are the result.

`results.json` is the raw record. This trial is not connected to the shopper page.

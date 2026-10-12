# Retrieval protocol

`js/retrievalProtocol.js` is the source of truth for every constant below. The numbers were fixed before the Fashion-MNIST test split was scored. Validation queries are reported separately and are not used to change weights, thresholds, or query text.

Fashion-MNIST labels are garment classes from Zalando Research, MIT license. A hit means the retrieved image has the same class id. That is not a shopper judgement, and it does not validate real-world fashion recommendations. The images are 28×28 grayscale. The 60-product shopper catalogue is a different system and is not scored here.

## Splits

The Fashion-MNIST test set is scanned in file order. For each class, the first 120 images are kept: 100 index, then 10 validation, then 10 test. The three slices do not share source indexes. Index rows are the only candidates. Validation and test images are queries.

## Hybrid score

`retrievalScore = sum(weight_s * cosine_s) / sum(weight_s)` over the query signals that exist.

Image and text each have weight 1. Cosine is the dot product of L2-normalized CLIP embeddings. A missing query signal is left out of both the numerator and the denominator. It is not filled in as zero. A candidate with no image embedding is omitted. A query with neither signal fails and returns no list.

Hard constraints run before scoring and are not part of the score. Budget, stock, and size fail the search when the catalogue has none of that field. The missing value is not invented. The shopper attribute score is not applied to these images, because price, reviews, and comfort are not in the dataset.

## Diversity

When diversity is requested, the top 50 candidates by retrieval score are reranked:

`MMR(d) = 0.7 * retrievalScore(d) - 0.3 * max image-embedding cosine to an item already chosen`

The max is 0 for the first item. Lambda 1 keeps score order, then id. This ablation is compared only with the same 50 candidates left in retrieval order.

## Baselines

Every method in a track sees the same queries and the same candidate pool.

- Random: seeded scores, seed 20261012, independent of input order.
- Pixel cosine: L2-normalized raw 28×28 pixels. Image queries only.
- Lexical overlap: share of the class-name tokens that appear in the query text. Text queries only.
- CLIP image, CLIP text, and the hybrid score above.

K is 10. With 100 relevant index images in a class, recall@10 cannot exceed 0.10. That ceiling is reported beside the metric.

## Duplicate pairs

The detector reads the listing name and the declared fields: category, colour, material, silhouette, price, currency. It does not read `description` or `itemId`. A different category is `unrelated`. The same normalized name, or a CLIP name cosine of at least 0.90, plus full field agreement, is `probable_duplicate`. The same identity with any field disagreement is `attribute_conflict`. Anything else in the same category is `similar_style`. The cosine cutoff was not searched on the 13 pairs. There is no held-out split. Thirteen pairs is too small for a stable estimate.

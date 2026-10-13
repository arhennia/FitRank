# image__inverted

Task `image`. Fusion `zscore`. Lambda 1. Diversity space `clip-inverted`.

300 validation queries. Coverage@10 0.664. Violation rate 0.000. Search p50 1.102 ms, p95 1.664 ms.

| Metric | Macro | 95% interval |
| --- | ---: | --- |
| precisionAt10 | 0.746 | 0.717 to 0.772 |
| recallAt10 | 0.037 | 0.036 to 0.039 |
| rPrecision | 0.512 | 0.495 to 0.528 |
| hitAt10 | 0.977 | 0.960 to 0.991 |
| mrr | 0.865 | 0.834 to 0.892 |
| ndcgAt10 | 0.758 | 0.729 to 0.783 |
| diversityAt10 | 0.057 | 0.055 to 0.058 |
| distinctClasses | 2.020 | 1.922 to 2.121 |

| Class | NDCG@10 | Precision@10 | Diversity@10 |
| --- | ---: | ---: | ---: |
| T-shirt/top | 0.673 | 0.647 | 0.061 |
| Trouser | 1.000 | 1.000 | 0.043 |
| Pullover | 0.572 | 0.563 | 0.050 |
| Dress | 0.700 | 0.687 | 0.067 |
| Coat | 0.633 | 0.627 | 0.053 |
| Sandal | 0.869 | 0.853 | 0.069 |
| Shirt | 0.469 | 0.443 | 0.059 |
| Sneaker | 0.891 | 0.877 | 0.056 |
| Bag | 0.882 | 0.873 | 0.065 |
| Ankle boot | 0.889 | 0.890 | 0.044 |


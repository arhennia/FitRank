# image__padded

Task `image`. Fusion `zscore`. Lambda 1. Diversity space `clip-padded`.

300 validation queries. Coverage@10 0.659. Violation rate 0.000. Search p50 1.087 ms, p95 1.581 ms.

| Metric | Macro | 95% interval |
| --- | ---: | --- |
| precisionAt10 | 0.717 | 0.692 to 0.743 |
| recallAt10 | 0.036 | 0.035 to 0.037 |
| rPrecision | 0.471 | 0.457 to 0.484 |
| hitAt10 | 0.983 | 0.967 to 0.996 |
| mrr | 0.855 | 0.823 to 0.883 |
| ndcgAt10 | 0.729 | 0.704 to 0.756 |
| diversityAt10 | 0.058 | 0.057 to 0.059 |
| distinctClasses | 2.187 | 2.080 to 2.289 |

| Class | NDCG@10 | Precision@10 | Diversity@10 |
| --- | ---: | ---: | ---: |
| T-shirt/top | 0.650 | 0.627 | 0.063 |
| Trouser | 0.992 | 0.990 | 0.047 |
| Pullover | 0.567 | 0.567 | 0.047 |
| Dress | 0.673 | 0.643 | 0.072 |
| Coat | 0.539 | 0.513 | 0.056 |
| Sandal | 0.846 | 0.843 | 0.070 |
| Shirt | 0.420 | 0.417 | 0.057 |
| Sneaker | 0.790 | 0.783 | 0.057 |
| Bag | 0.897 | 0.870 | 0.067 |
| Ankle boot | 0.919 | 0.920 | 0.046 |


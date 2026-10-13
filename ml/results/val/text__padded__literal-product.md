# text__padded__literal-product

Task `text`. Fusion `zscore`. Lambda 1. Diversity space `clip-padded`.

30 validation queries. Coverage@10 0.084. Violation rate 0.000. Search p50 0.855 ms, p95 1.705 ms.

| Metric | Macro | 95% interval |
| --- | ---: | --- |
| precisionAt10 | 0.597 | 0.508 to 0.683 |
| recallAt10 | 0.030 | 0.025 to 0.034 |
| rPrecision | 0.417 | 0.370 to 0.457 |
| hitAt10 | 0.933 | 0.833 to 1.000 |
| mrr | 0.760 | 0.652 to 0.865 |
| ndcgAt10 | 0.608 | 0.515 to 0.694 |
| diversityAt10 | 0.068 | 0.063 to 0.073 |
| distinctClasses | 2.433 | 2.130 to 2.783 |

| Class | NDCG@10 | Precision@10 | Diversity@10 |
| --- | ---: | ---: | ---: |
| T-shirt/top | 0.727 | 0.733 | 0.067 |
| Trouser | 0.827 | 0.833 | 0.065 |
| Pullover | 0.699 | 0.633 | 0.050 |
| Dress | 0.645 | 0.633 | 0.073 |
| Coat | 0.152 | 0.200 | 0.073 |
| Sandal | 0.311 | 0.200 | 0.076 |
| Shirt | 0.573 | 0.567 | 0.073 |
| Sneaker | 0.292 | 0.267 | 0.070 |
| Bag | 1.000 | 1.000 | 0.062 |
| Ankle boot | 0.858 | 0.900 | 0.071 |


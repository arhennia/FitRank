# text__inverted__literal-grayscale

Task `text`. Fusion `zscore`. Lambda 1. Diversity space `clip-inverted`.

30 validation queries. Coverage@10 0.098. Violation rate 0.000. Search p50 1.183 ms, p95 1.762 ms.

| Metric | Macro | 95% interval |
| --- | ---: | --- |
| precisionAt10 | 0.703 | 0.606 to 0.791 |
| recallAt10 | 0.035 | 0.030 to 0.040 |
| rPrecision | 0.476 | 0.418 to 0.530 |
| hitAt10 | 0.967 | 0.900 to 1.000 |
| mrr | 0.826 | 0.719 to 0.932 |
| ndcgAt10 | 0.716 | 0.615 to 0.807 |
| diversityAt10 | 0.078 | 0.072 to 0.085 |
| distinctClasses | 2.600 | 2.234 to 2.965 |

| Class | NDCG@10 | Precision@10 | Diversity@10 |
| --- | ---: | ---: | ---: |
| T-shirt/top | 0.814 | 0.767 | 0.065 |
| Trouser | 0.619 | 0.600 | 0.097 |
| Pullover | 0.773 | 0.733 | 0.067 |
| Dress | 0.490 | 0.467 | 0.091 |
| Coat | 0.450 | 0.500 | 0.079 |
| Sandal | 0.815 | 0.767 | 0.095 |
| Shirt | 0.530 | 0.533 | 0.073 |
| Sneaker | 0.936 | 0.900 | 0.067 |
| Bag | 0.927 | 0.967 | 0.077 |
| Ankle boot | 0.802 | 0.800 | 0.072 |


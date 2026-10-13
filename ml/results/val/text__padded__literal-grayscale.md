# text__padded__literal-grayscale

Task `text`. Fusion `zscore`. Lambda 1. Diversity space `clip-padded`.

30 validation queries. Coverage@10 0.092. Violation rate 0.000. Search p50 1.024 ms, p95 1.643 ms.

| Metric | Macro | 95% interval |
| --- | ---: | --- |
| precisionAt10 | 0.637 | 0.533 to 0.730 |
| recallAt10 | 0.032 | 0.027 to 0.037 |
| rPrecision | 0.428 | 0.372 to 0.479 |
| hitAt10 | 0.933 | 0.833 to 1.000 |
| mrr | 0.841 | 0.748 to 0.926 |
| ndcgAt10 | 0.661 | 0.557 to 0.756 |
| diversityAt10 | 0.079 | 0.073 to 0.085 |
| distinctClasses | 2.400 | 2.147 to 2.657 |

| Class | NDCG@10 | Precision@10 | Diversity@10 |
| --- | ---: | ---: | ---: |
| T-shirt/top | 0.743 | 0.667 | 0.068 |
| Trouser | 0.693 | 0.667 | 0.093 |
| Pullover | 0.653 | 0.633 | 0.052 |
| Dress | 0.560 | 0.533 | 0.085 |
| Coat | 0.209 | 0.233 | 0.080 |
| Sandal | 0.547 | 0.500 | 0.103 |
| Shirt | 0.620 | 0.600 | 0.083 |
| Sneaker | 0.924 | 0.900 | 0.083 |
| Bag | 0.977 | 0.967 | 0.071 |
| Ankle boot | 0.681 | 0.667 | 0.072 |


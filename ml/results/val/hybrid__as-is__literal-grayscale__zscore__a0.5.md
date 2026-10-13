# hybrid__as-is__literal-grayscale__zscore__a0.5

Task `hybrid`. Fusion `zscore`. Lambda 1. Diversity space `clip-as-is`.

900 validation queries. Coverage@10 0.514. Violation rate 0.000. Search p50 0.862 ms, p95 1.500 ms.

| Metric | Macro | 95% interval |
| --- | ---: | --- |
| precisionAt10 | 0.765 | 0.752 to 0.778 |
| recallAt10 | 0.038 | 0.038 to 0.039 |
| rPrecision | 0.525 | 0.518 to 0.532 |
| hitAt10 | 0.978 | 0.968 to 0.987 |
| mrr | 0.872 | 0.857 to 0.888 |
| ndcgAt10 | 0.774 | 0.762 to 0.788 |
| diversityAt10 | 0.063 | 0.062 to 0.064 |
| distinctClasses | 2.121 | 2.068 to 2.173 |

| Class | NDCG@10 | Precision@10 | Diversity@10 |
| --- | ---: | ---: | ---: |
| T-shirt/top | 0.695 | 0.687 | 0.061 |
| Trouser | 0.999 | 0.999 | 0.051 |
| Pullover | 0.815 | 0.784 | 0.054 |
| Dress | 0.699 | 0.692 | 0.078 |
| Coat | 0.351 | 0.340 | 0.068 |
| Sandal | 0.864 | 0.848 | 0.067 |
| Shirt | 0.536 | 0.531 | 0.065 |
| Sneaker | 0.888 | 0.873 | 0.061 |
| Bag | 0.957 | 0.957 | 0.067 |
| Ankle boot | 0.941 | 0.937 | 0.054 |


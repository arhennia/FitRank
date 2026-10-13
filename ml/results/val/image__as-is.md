# image__as-is

Task `image`. Fusion `zscore`. Lambda 1. Diversity space `clip-as-is`.

300 validation queries. Coverage@10 0.650. Violation rate 0.000. Search p50 1.149 ms, p95 1.817 ms.

| Metric | Macro | 95% interval |
| --- | ---: | --- |
| precisionAt10 | 0.744 | 0.719 to 0.769 |
| recallAt10 | 0.037 | 0.036 to 0.038 |
| rPrecision | 0.500 | 0.484 to 0.514 |
| hitAt10 | 0.990 | 0.978 to 1.000 |
| mrr | 0.881 | 0.852 to 0.907 |
| ndcgAt10 | 0.758 | 0.734 to 0.781 |
| diversityAt10 | 0.059 | 0.057 to 0.060 |
| distinctClasses | 2.077 | 1.976 to 2.175 |

| Class | NDCG@10 | Precision@10 | Diversity@10 |
| --- | ---: | ---: | ---: |
| T-shirt/top | 0.733 | 0.710 | 0.061 |
| Trouser | 0.987 | 0.987 | 0.048 |
| Pullover | 0.564 | 0.547 | 0.052 |
| Dress | 0.715 | 0.713 | 0.062 |
| Coat | 0.528 | 0.500 | 0.054 |
| Sandal | 0.894 | 0.887 | 0.068 |
| Shirt | 0.454 | 0.420 | 0.062 |
| Sneaker | 0.877 | 0.863 | 0.060 |
| Bag | 0.910 | 0.903 | 0.070 |
| Ankle boot | 0.918 | 0.913 | 0.048 |


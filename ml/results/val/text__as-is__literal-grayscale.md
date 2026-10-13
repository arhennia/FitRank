# text__as-is__literal-grayscale

Task `text`. Fusion `zscore`. Lambda 1. Diversity space `clip-as-is`.

30 validation queries. Coverage@10 0.088. Violation rate 0.000. Search p50 1.231 ms, p95 1.570 ms.

| Metric | Macro | 95% interval |
| --- | ---: | --- |
| precisionAt10 | 0.633 | 0.544 to 0.722 |
| recallAt10 | 0.032 | 0.027 to 0.036 |
| rPrecision | 0.454 | 0.394 to 0.505 |
| hitAt10 | 0.967 | 0.900 to 1.000 |
| mrr | 0.857 | 0.761 to 0.944 |
| ndcgAt10 | 0.654 | 0.567 to 0.741 |
| diversityAt10 | 0.086 | 0.080 to 0.093 |
| distinctClasses | 2.433 | 2.066 to 2.800 |

| Class | NDCG@10 | Precision@10 | Diversity@10 |
| --- | ---: | ---: | ---: |
| T-shirt/top | 0.638 | 0.567 | 0.081 |
| Trouser | 0.693 | 0.667 | 0.108 |
| Pullover | 0.783 | 0.767 | 0.067 |
| Dress | 0.692 | 0.667 | 0.088 |
| Coat | 0.231 | 0.167 | 0.090 |
| Sandal | 0.341 | 0.333 | 0.096 |
| Shirt | 0.523 | 0.533 | 0.088 |
| Sneaker | 0.879 | 0.900 | 0.080 |
| Bag | 0.873 | 0.867 | 0.085 |
| Ankle boot | 0.893 | 0.867 | 0.079 |


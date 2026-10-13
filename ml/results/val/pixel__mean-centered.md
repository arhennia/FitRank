# pixel__mean-centered

Task `pixel`. Fusion `zscore`. Lambda 1. Diversity space `pixel-mean-centered`.

300 validation queries. Coverage@10 0.587. Violation rate 0.000. Search p50 1.154 ms, p95 1.675 ms.

| Metric | Macro | 95% interval |
| --- | ---: | --- |
| precisionAt10 | 0.694 | 0.665 to 0.722 |
| recallAt10 | 0.035 | 0.033 to 0.036 |
| rPrecision | 0.456 | 0.441 to 0.470 |
| hitAt10 | 0.940 | 0.916 to 0.961 |
| mrr | 0.821 | 0.791 to 0.850 |
| ndcgAt10 | 0.705 | 0.677 to 0.733 |
| diversityAt10 | 0.150 | 0.143 to 0.158 |
| distinctClasses | 1.950 | 1.873 to 2.027 |

| Class | NDCG@10 | Precision@10 | Diversity@10 |
| --- | ---: | ---: | ---: |
| T-shirt/top | 0.715 | 0.703 | 0.142 |
| Trouser | 0.986 | 0.983 | 0.088 |
| Pullover | 0.564 | 0.533 | 0.142 |
| Dress | 0.731 | 0.717 | 0.117 |
| Coat | 0.644 | 0.647 | 0.114 |
| Sandal | 0.294 | 0.277 | 0.255 |
| Shirt | 0.442 | 0.430 | 0.151 |
| Sneaker | 0.831 | 0.827 | 0.142 |
| Bag | 0.906 | 0.890 | 0.221 |
| Ankle boot | 0.940 | 0.937 | 0.134 |


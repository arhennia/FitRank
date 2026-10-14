# Judging rubric

Written before any pool file. The catalogue is 60 fictional products. A judgment is about whether an item fits the persona's sentence, not about whether the ranker scored it highly, and not about Fashion-MNIST.

Fill only the `judgment` column in `ml/data/judging/pool.val.csv` and `pool.test.csv`. Leave every other column as it is. Do not open `ml/results/shopper/`. That folder holds which arm retrieved which item.

## Scale

| Score | Meaning |
| --- | --- |
| 0 | Not relevant. You would not show this item to this person for the purchase described. |
| 1 | Acceptable. It could work, with a clear compromise on style, setting, or role. |
| 2 | Great. It is the kind of piece the sentence is asking for, within the stated limits. |

Judge the sentence in `persona_text`, not a general fashion score. Price, category, and size in `item_attrs` are the fictional catalogue fields. Do not infer a discount, a wardrobe, or a fit measurement that the row does not state.

An empty `judgment` cell is unfinished. The ingest script rejects anything other than 0, 1, or 2.

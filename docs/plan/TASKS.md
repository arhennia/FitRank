# Sprint tasks

Status against `PLAN.md` "FitRank 2.1 revised plan (v2)". v1 tasks T0–T4 are done and are not repeated. The committed Fashion-MNIST split stays at index 2,000 / validation 300 / test 500. v2's smaller cap applies to a fresh split, not to this one.

- [x] T0 v1 audit and baseline reproduction
- [x] T0 v2 intent-flow audit (`docs/AUDIT.md`, "Intent flow")
- [x] T1 Dataset adapter and seeded splits
- [x] T2 Embedding pipeline and cache
- [x] T3 Retrieval core in `js/retrieval/`
- [x] T4 Metrics, harness, and validation tuning
- [ ] T4/T5 reduced Fashion-MNIST test eval (experiment only)
- [x] K IntentProfile and templates
- [x] L Integrated catalogue search (`js/retrieval/search.js`; the shopper page still calls `recommendFromIntent`)
- [x] M Personas, rubric, empty pools, influence test (judgments stay empty; shopper weights are not frozen)
- [x] T7 `/api/search` with a dataset field, sidecar, and fallback
- [ ] T8 Shopper explanations from provenance, Fashion-MNIST labelled as a lab
- [ ] T9 `COMPONENTS.md` check and handoff

Do not score the Fashion-MNIST test split while tuning. Do not fill shopper judgment cells in code. Do not treat `experiments/retrieval-results.json` as evidence about shopping quality.

# Sprint tasks

Status after T0 on 12 Oct 2026. The plan text is in `PLAN.md`. Measured facts are in `docs/AUDIT.md` and `ml/results/env.json`.

Set sizes chosen by the T0 rule: index 2,000 (200 per class), validation 300 (30 per class), test 500 (50 per class). Batch-1 throughput was 45.834 ms/image. The Fashion-MNIST train split is not on disk.

- [x] T0 Audit and baseline reproduction
- [ ] T1 Dataset adapter and seeded splits
- [ ] T2 Embedding pipeline and cache
- [ ] T3 Retrieval core in `js/retrieval/`
- [ ] T4 Metrics, harness, and validation tuning
- [ ] T5 Test evaluation, ablations, and failure analysis
- [ ] T6 Integration layer
- [ ] T7 Sidecar, API routes, and fallback
- [ ] T8 Frontend panel
- [ ] T9 Hardening, clean-state run, report, and handoff

Do not start T4 tuning on the test split. Do not treat the already published `experiments/retrieval-results.json` numbers as a validation set for this sprint.

I'm building a Genomics ML Portal — a web app where scientists
train small ML models to classify genomic features (R-loops,
G-quadruplexes, CpG islands, anomaly detection) across the
complete human genome.

Phase 0 is DONE and validated (see research/ for graphs):
- 3 structural classifiers on hg38 chr21 data
- RLFS: AUC 0.934, G4: AUC 0.978, CpG: AUC 0.933
- 52 sequence features, XGBoost + Random Forest
- Pre-computed feature matrix: data/features_master.parquet

Phase 1 is DONE:
- Backend: FastAPI + Celery + Redis (backend/)
- Frontend: React + TypeScript (frontend/)
- Core flow: upload BED labels → select features → pick model
  → train → view metrics → export predictions as BedGraph
- 3 models: XGBoost, Random Forest, Isolation Forest
- Run: docker compose up --build

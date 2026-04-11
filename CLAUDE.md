I'm building a Genomics ML Portal — a web app where scientists
train small ML models to classify genomic features (R-loops,
G-quadruplexes, CpG islands, anomaly detection) across the
complete human genome.

Phase 0 is DONE and validated:
- 3 structural classifiers working on real hg38 chr21 data
- RLFS: AUC 0.934, G4: AUC 0.978, CpG: AUC 0.933
- 51 sequence features, XGBoost + Random Forest
- BedGraph output for genome browsers
- Code in: phase0d_multi_feature.py

Now build Phase 1: Web portal
- Backend: FastAPI + Celery + Redis
- Frontend: React
- Core flow: upload BED labels → select features → pick model
  → train → view metrics → export predictions as BedGraph
- Store pre-computed feature matrices as Parquet (per chromosome)
- Support 3 models: XGBoost, Random Forest, Isolation Forest
- Start with chr21, scale to full genome later

Start with the FastAPI backend and project structure.
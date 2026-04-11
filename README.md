# Genomics ML Portal

A web application for training machine learning models to classify genomic features across the human genome. Scientists upload BED label files, select sequence features, choose a model, and receive genome-wide predictions as BedGraph files ready for genome browsers.

---

## Background

Certain DNA sequence features — R-loops, G-quadruplexes, CpG islands — play important roles in gene regulation, genome stability, and disease. Experimentally mapping these features genome-wide is expensive. This portal lets researchers train classifiers on existing label sets and predict feature locations across entire chromosomes using only primary sequence composition, requiring no experimental data beyond the labels themselves.

### Phase 0 — Validated baseline (chr21, hg38)

Three classifiers were trained and validated on chromosome 21:

| Feature | Description | Best AUC |
|---------|-------------|----------|
| RLFS | R-loop forming sequences (QmRLFS-finder method) | **0.934** |
| G4 | G-quadruplex-forming motifs | **0.978** |
| CpG | CpG islands (Gardiner-Garden criteria) | **0.933** |

Models: XGBoost (500 trees, depth 8) and Random Forest (500 trees, depth 12), trained on 51 sequence features computed from 200 bp non-overlapping windows. Pre-computed predictions are in `phase0d_multi/`.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser (React)                  │
│  Upload BED → Select features → Pick model → Results │
└────────────────────┬────────────────────────────────┘
                     │ HTTP  /api/*
┌────────────────────▼────────────────────────────────┐
│                FastAPI (port 8000)                   │
│  POST /api/jobs  →  dispatches Celery task           │
│  GET  /api/jobs/{id}  →  reads Redis job state       │
│  GET  /api/jobs/{id}/export  →  streams BedGraph     │
└──────────┬───────────────────────┬──────────────────┘
           │ broker/backend        │
┌──────────▼──────────┐  ┌────────▼─────────────────┐
│     Redis           │  │     Celery Worker         │
│  job metadata (TTL  │  │  load parquet → label →   │
│  24 h), task queue  │  │  train → predict → export │
└─────────────────────┘  └──────────────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │  phase0d_multi/                  │
                    │  features_master.parquet         │
                    │  (200,451 windows × 52 features) │
                    └─────────────────────────────────┘
```

**Stack**

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Recharts |
| Backend | FastAPI 0.115, Python 3.12 |
| Task queue | Celery 5 + Redis 7 |
| ML | XGBoost 2.1, scikit-learn 1.5 |
| Data | Pandas 2.2, PyArrow 17 (Parquet) |

---

## Project structure

```
MLGenomics/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI app entry point
│   │   ├── config.py              # Settings (Redis URL, paths)
│   │   ├── core/
│   │   │   ├── features.py        # 52-feature metadata catalogue
│   │   │   ├── models.py          # train_xgboost / train_rf / train_isoforest
│   │   │   └── export.py          # BedGraph + high-confidence BED writers
│   │   ├── routers/
│   │   │   ├── features.py        # GET /api/features, /api/chromosomes
│   │   │   ├── jobs.py            # GET/DELETE /api/jobs, /api/jobs/{id}
│   │   │   └── train.py           # POST /api/jobs
│   │   ├── schemas/               # Pydantic request/response models
│   │   └── tasks/
│   │       └── training.py        # Celery training task
│   ├── celery_app.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx                # Routes + job list
│   │   ├── api/client.ts          # Typed axios wrappers
│   │   ├── components/
│   │   │   ├── BedUpload.tsx      # Drag-and-drop BED input
│   │   │   ├── FeatureSelector.tsx # Grouped feature checkboxes
│   │   │   ├── ModelPicker.tsx    # Model + hyperparameter UI
│   │   │   └── MetricsDisplay.tsx # AUC badges + importance chart
│   │   └── pages/
│   │       ├── NewJob.tsx         # 3-step job wizard
│   │       └── JobResults.tsx     # Live-polling results page
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── phase0d_multi/                 # Phase 0 outputs (read-only at runtime)
│   ├── features_master.parquet    # Pre-computed feature matrix (200k windows)
│   └── pred_*.bedGraph            # Baseline predictions for RLFS / G4 / CpG
├── phase05_real_data/             # Reference genome data
│   └── chr21.fa                   # hg38 chromosome 21 sequence
├── data/jobs/                     # Training job outputs (created at runtime)
├── phase0d_multi_feature.py       # Phase 0 pipeline script
├── docker-compose.yml
└── CLAUDE.md
```

---

## Quickstart

### With Docker (recommended)

Requires [Docker](https://docs.docker.com/get-docker/) with Compose V2.

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Web UI | http://localhost:5173 |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

### Without Docker (development)

**Prerequisites:** Python 3.12, Node.js 20, a running Redis instance.

```bash
# Start Redis (or use a local installation)
docker run -d -p 6379:6379 redis:7-alpine

# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Celery worker (new terminal, same directory)
cd backend
celery -A celery_app.celery worker --loglevel=info --concurrency=2

# Frontend (new terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173
```

To point at a non-default Redis, set the environment variable before starting:

```bash
export REDIS_URL=redis://myhost:6379/0
```

---

## User guide

### 1. Prepare a BED file

Your BED file defines **positive-label regions** — genomic intervals you want the model to learn. Each row is a region:

```
chr21   10000   10200
chr21   15400   15600
chr21   31000   31400
```

- Must be tab-separated, BED3 or wider format.
- Coordinates must be on `chr21` (hg38). Other chromosomes are ignored at this stage.
- You can use the baseline predictions in `phase0d_multi/pred_*_highconf.bed` as label files to reproduce the Phase 0 results.
- Isolation Forest mode does not need a BED file — it detects sequence anomalies without labels.

### 2. Submit a job

Open http://localhost:5173 and click **+ New Job**, then follow the three-step wizard:

**Step 1 — Upload labels**
Drop your BED file onto the upload area. Set the Neg:Pos ratio (default 3) to control class balance during training.

**Step 2 — Select features**
Features are organised into eight groups. Toggle individual features or whole groups. Deselecting irrelevant groups (e.g. G-quadruplex features for a CpG classifier) can speed up training and reduce overfitting.

| Group | Features |
|-------|----------|
| Composition | GC content, A/C/G/T fractions |
| Skew | GC skew, AT skew |
| Dinucleotide | All 16 dinucleotide frequencies |
| G/C Runs | Run counts, max run length, total run bases |
| CpG | CpG count, frequency, obs/exp ratio, TpG, CpA |
| Complexity | Sequence complexity, Shannon entropy, purine fraction |
| G-Quadruplex | G4/C4 motif counts, G4Hunter scores |
| R-Loop | G/C density max/std, local GC skew range |
| Structural | Trinucleotide repeats, palindrome density, homopolymer length |

**Step 3 — Configure model**

| Model | Notes |
|-------|-------|
| XGBoost | Highest AUC; slower (~5 min on chr21) |
| Random Forest | Fast; robust to noisy labels |
| Isolation Forest | No labels needed; detects sequence anomalies |

Click **Train model** to submit. The job is dispatched to the Celery worker immediately.

### 3. View results

The results page polls the job every 2 seconds. Once complete it shows:

- **ROC-AUC** and **Average Precision** on the held-out test set (20%)
- **5-fold cross-validation AUC ± std**
- Positive / negative window counts
- High-confidence region count (probability ≥ 0.5)
- Feature importance bar chart (top 15 features)

### 4. Export predictions

Click **Download BedGraph** to get the full genome-wide prediction file. Load it in [IGV](https://igv.org/) or the [UCSC Genome Browser](https://genome.ucsc.edu/):

```
# IGV: File → Load from File → predictions_<id>.bedGraph
# UCSC: My Data → Custom Tracks → paste the bedGraph
```

The file contains one row per 200 bp window across chr21 with a probability score (0–1). A companion high-confidence BED file (`data/jobs/<id>/highconf.bed`) lists only windows scoring ≥ 0.5.

---

## API reference

All endpoints are under `/api`. Interactive docs at `/docs`.

### `GET /api/chromosomes`
Lists available chromosomes and whether a pre-computed feature matrix exists.

```json
[{"name": "chr21", "parquet_available": true, "n_windows": 200451}]
```

### `GET /api/features`
Returns all 52 feature names with group and description.

### `POST /api/jobs`
Submit a training job. Multipart form with two fields:

| Field | Type | Description |
|-------|------|-------------|
| `config` | JSON string | `TrainRequest` object (see below) |
| `bed_file` | file | BED file (optional for Isolation Forest) |

**TrainRequest fields:**

```json
{
  "chromosome":   "chr21",
  "model_type":   "xgboost",
  "features":     null,
  "model_params": {"n_estimators": 500, "max_depth": 8},
  "neg_ratio":    3,
  "test_fraction": 0.2
}
```

`features: null` uses all 52. Returns `202 Accepted` with `{"job_id": "..."}`.

### `GET /api/jobs`
List all jobs, sorted by creation time (newest first).

### `GET /api/jobs/{id}`
Full job detail including status, progress (0–1), metrics, and feature importances.

**Status values:** `pending` → `running` → `completed` / `failed`

```json
{
  "job_id": "3f2a...",
  "status": "completed",
  "progress": 1.0,
  "metrics": {
    "auc": 0.934,
    "ap": 0.856,
    "cv_auc_mean": 0.901,
    "cv_auc_std": 0.012,
    "n_positives": 4521,
    "n_negatives": 13563,
    "n_highconf_regions": 3102
  },
  "feature_importance": {"cpg_oe": 0.18, "gc_content": 0.12, ...}
}
```

### `GET /api/jobs/{id}/export`
Streams the BedGraph file as a download.

### `DELETE /api/jobs/{id}`
Removes the job from Redis and deletes output files from disk.

---

## Extending to other chromosomes

The portal is designed to scale. To add a chromosome:

1. Add `chrN.fa` to `phase05_real_data/`.
2. Run `phase0d_multi_feature.py` (or an adapted version) to produce a feature Parquet.
3. Register the path in `backend/app/routers/features.py` (`_PARQUET_MAP`).
4. Add `"chrN"` to the `validate_chrom` allowlist in `backend/app/schemas/training.py`.

---

## Development notes

- Job metadata is stored in Redis with a 24-hour TTL. Output files live in `data/jobs/<uuid>/`.
- The Celery worker and the API server both mount the same `phase0d_multi/` and `data/jobs/` directories — keep them on a shared volume in any multi-host deployment.
- The backend uses `PYTHONPATH=.` (the `backend/` directory), so imports are rooted there.
- To run the worker with more parallelism: `--concurrency=4` (memory-bound; each job loads the 200k-row Parquet).

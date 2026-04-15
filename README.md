# Genomics ML Portal

A web application for training machine learning models to classify genomic features across the human genome. Scientists upload BED label files, select sequence features, choose a model, and receive genome-wide predictions as BedGraph files ready for genome browsers.

**Live demo: [mlgenomics.up.railway.app](https://mlgenomics.up.railway.app)**

---

## Background

Certain DNA sequence features — R-loops, G-quadruplexes, CpG islands — play important roles in gene regulation, genome stability, and disease. Experimentally mapping these features genome-wide is expensive. This portal lets researchers train classifiers on existing label sets and predict feature locations across entire chromosomes using only primary sequence composition, requiring no experimental data beyond the labels themselves.

### Validated baseline (chr21, hg38)

Three classifiers were trained and validated on chromosome 21. See [research/](research/) for detailed plots and analysis.

| Feature | Description | Best AUC |
|---------|-------------|----------|
| RLFS | R-loop forming sequences (QmRLFS-finder method) | **0.934** |
| G4 | G-quadruplex-forming motifs | **0.978** |
| CpG | CpG islands (Gardiner-Garden criteria) | **0.933** |

Models: XGBoost (500 trees, depth 8) and Random Forest (500 trees, depth 12), trained on 52 sequence features computed from 200 bp non-overlapping windows.

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
                    │  data/features_master.parquet    │
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
│   │   │   ├── Nav.tsx            # Fixed top navigation bar
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
├── data/
│   ├── features_master.parquet    # Pre-computed feature matrix (200k windows)
│   └── jobs/                      # Training job outputs (created at runtime)
├── research/
│   ├── README.md                  # Graph descriptions and analysis notes
│   ├── phase0d_comparison.png     # ROC / PR / CV comparison across all tasks
│   ├── phase0d_details.png        # Per-task confusion matrix, importances, score dist
│   └── phase05_real_results.png   # Early DRIP-seq prototype results
├── docker-compose.yml
└── CLAUDE.md
```

---

## Quickstart

**Live demo:** [mlgenomics.up.railway.app](https://mlgenomics.up.railway.app)

### With Docker (recommended)

Requires [Docker](https://docs.docker.com/get-docker/) with Compose V2.

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Web UI + API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

The React frontend is served directly by the API on port 8000. There is no separate frontend port in production mode.

### Without Docker (development)

**Prerequisites:** Python 3.12, Node.js 20, a running Redis instance.

```bash
# Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# Backend (port 8000)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Celery worker (new terminal, same backend directory)
celery -A celery_app.celery worker --loglevel=info --concurrency=2

# Frontend dev server with hot reload (new terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173 → proxies /api to port 8000
```

| Service | URL |
|---------|-----|
| Frontend (hot reload) | http://localhost:5173 |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

---

## User guide

### 1. Prepare a BED file

Your BED file defines **positive-label regions** — genomic intervals you want the model to learn. Each row is a region:

```
chr21   10000   10200
chr21   15400   15600
chr21   31000   31400
```

- Tab-separated, BED3 or wider format, max 50 MB.
- Coordinates must be on `chr21` (hg38).
- Isolation Forest mode does not need a BED file — it detects sequence anomalies without labels.

### 2. Submit a job

Open http://localhost:5173 and click **+ New Job**, then follow the three-step wizard:

**Step 1 — Upload labels**
Drop your BED file onto the upload area. Set the Neg:Pos ratio (default 3) to control class balance.

**Step 2 — Select features**
Features are organised into nine groups. Toggle individual features or whole groups.

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

### 3. View results

Once complete the results page shows:

- **ROC-AUC** and **Average Precision** on the held-out test set (20%)
- **5-fold cross-validation AUC ± std**
- Positive / negative window counts and high-confidence region count
- Feature importance bar chart (top 15 features)
- **Embedded genome browser** (IGV.js) — pan and zoom across chr21, inspect prediction scores per window directly in the app without downloading anything

### 4. Export predictions

Click **Download BedGraph** to get the full genome-wide prediction file. The file contains one row per 200 bp window across chr21 with a probability score (0–1). A companion `highconf.bed` file lists only windows scoring ≥ 0.5.

The BedGraph can also be loaded externally in [IGV Desktop](https://igv.org/) or the [UCSC Genome Browser](https://genome.ucsc.edu/) for more advanced visualisation options.

---

## API reference

All endpoints are under `/api`. Interactive docs at `/docs`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chromosomes` | List available chromosomes |
| GET | `/api/features` | All 52 feature names with group and description |
| POST | `/api/jobs` | Submit a training job (multipart: `config` + `bed_file`) |
| GET | `/api/jobs` | List all jobs, newest first |
| GET | `/api/jobs/{id}` | Job detail: status, progress, metrics, feature importances |
| GET | `/api/jobs/{id}/export` | Stream BedGraph file as download |
| DELETE | `/api/jobs/{id}` | Remove job and output files |

**TrainRequest (JSON `config` field):**

```json
{
  "chromosome":    "chr21",
  "model_type":    "xgboost",
  "features":      null,
  "model_params":  {"n_estimators": 500, "max_depth": 8},
  "neg_ratio":     3,
  "test_fraction": 0.2
}
```

`features: null` uses all 52.

---

## Extending to other chromosomes

1. Compute a feature matrix Parquet for the new chromosome (200 bp windows, same 52 features).
2. Place it in `data/` and register the path in `backend/app/routers/features.py` (`_PARQUET_MAP`).
3. Add the chromosome name to the allowlist in `backend/app/schemas/training.py`.

---

## Development notes

- Job metadata lives in Redis (AOF persistence enabled) with a 24-hour TTL.
- Trained models are saved to `data/jobs/<uuid>/model.joblib` alongside the BedGraph output.
- The Celery worker and API server share the `data/` directory via bind mount.
- Worker parallelism: `--concurrency=4` (memory-bound; each job loads the 200k-row Parquet).

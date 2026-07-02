# Genomics ML Portal

A web application for training machine learning models that classify genomic features across whole genomes. Scientists pick a genome and chromosome, upload a BED label file, set a feature window, and receive genome-wide predictions as bedGraph / bigWig tracks — ready for a genome browser. Trained models can be saved to a library and re-applied to **other chromosomes or other organisms** without retraining.

**Live demo: [jan-havlik.tech](https://www.jan-havlik.tech)**

---

## Background

Certain DNA sequence features — R-loops, G-quadruplexes, CpG islands — play important roles in gene regulation, genome stability, and disease. Experimentally mapping these features genome-wide (DRIP-seq, BG4-seq, bisulfite sequencing, and so on) is expensive and has to be repeated per cell type and per organism.

This portal takes a different route: it learns each feature from **primary sequence composition alone**. You supply a set of example regions (a BED file) that mark where the feature occurs; the portal turns the surrounding DNA into numeric descriptors, trains a classifier to tell "feature" from "background", and then scores every window across the chromosome — or a completely different genome — using nothing but the sequence itself.

---

## How model training works

Training is a single Celery job. Every run performs the same eight stages, streaming a human-readable progress string back to the browser at each step.

### 1. Feature extraction (sequence → numbers)

The chromosome FASTA is fetched from UCSC (cached on first use) and sliced into windows of `window_size` bp, stepped by `step_size` bp. For each window the extractor computes **51 numeric features** grouped into nine biologically motivated families:

| Group | What it captures |
| --- | --- |
| Composition | GC content and per-base A/C/G/T fractions |
| Skew | GC skew and AT skew — strand asymmetry, an R-loop signal |
| Dinucleotide | All 16 dinucleotide frequencies |
| G/C Runs | Homopolymer run counts, longest run, total run bases |
| CpG | CpG count/frequency, observed/expected ratio, TpG & CpA (deamination products) |
| Complexity | 4-mer complexity, Shannon entropy, purine fraction |
| G-Quadruplex | G4/C4 motif counts and G4Hunter-style G/C-richness scores |
| R-Loop | Local G/C density peaks and GC-skew range over 50 bp sub-windows |
| Structural | Trinucleotide repeats, palindrome density, longest homopolymer |

Windows that are more than 50% `N` are dropped. The full matrix is written to a per-`(genome, chromosome, window, step)` parquet and cached, so repeat runs at the same resolution skip extraction entirely.

The **window size is the key knob**. The UI auto-suggests it from the median width of your BED regions, because a feature's natural scale matters: G4 motifs localize sharply (~25 bp), CpG islands span hundreds of bp. A smaller window localizes predictions more precisely but produces many more windows; a larger one is coarser but cheaper. The chosen size is stored with the model and reused whenever the model is later applied elsewhere.

### 2. Labeling

Each window is labeled **positive** if it overlaps any interval in your BED file, otherwise **negative**. Overlap is computed as a single vectorized pass, so labeling a million-window chromosome is instant. Two guards protect against degenerate setups:

- Fewer than 10 positive windows → rejected (usually a chromosome mismatch or a window far larger than the regions).
- Positives making up ≥ 50% of windows → rejected. With no real background to contrast against, the model just learns "say positive" and scores everything ~1.0.

### 3. Class balancing and split

Genomic features are rare, so negatives vastly outnumber positives. The trainer samples negatives at a fixed **negative:positive ratio** (default 3:1), shuffles, and makes a stratified 80/20 train/test split. Everything downstream uses a fixed random seed (42) so runs are reproducible.

### 4. Training the classifier

A single **XGBoost** gradient-boosted tree model is trained. The defaults are deliberately regularized for noisy biological labels rather than tuned for a leaderboard:

```
n_estimators = 500     learning_rate = 0.05     max_depth = 8
subsample = 0.8        colsample_bytree = 0.7   min_child_weight = 3
reg_alpha = 0.1        reg_lambda = 1.0         eval_metric = logloss
```

`n_estimators` and `max_depth` are exposed in the UI; the rest are sensible fixed defaults. The held-out test set is passed as an eval set so training can be monitored.

### 5. Evaluation

The model is scored two ways so you can trust the number:

- **Held-out test set** → ROC-AUC and Average Precision (ranking quality), plus precision / recall / F1 / specificity at the 0.5 operating point (what a biologist actually gets when they threshold the track).
- **5-fold stratified cross-validation** → mean AUC ± std, which confirms the result isn't an artifact of one lucky split.

XGBoost gain-based **feature importances** are extracted and returned, so every prediction is explainable in terms of known biology.

### 6–8. Genome-wide prediction and export

The trained model then scores **every window on the chromosome** (not just the test set), producing a probability from 0 to 1 per window. Three files are written per job:

- `predictions.bedGraph` — one scored row per window, loadable anywhere.
- `predictions.bw` — a bigWig built from the bedGraph via UCSC `bedGraphToBigWig`, so the embedded genome browser can do fast range queries instead of streaming the whole chromosome as text.
- `highconf.bed` — only the windows scoring ≥ 0.5, i.e. the shortlist worth looking at.

The model itself (`model.joblib`) and its metadata (`model_meta.json`, which records the window size) are saved alongside so the model can be promoted to the library and reused.

### What this brings — the usefulness

1. **No wet-lab experiment needed for the target.** Once trained, the model predicts a feature anywhere from DNA sequence alone. The training labels can come from an existing experimental dataset (e.g. DRIP-seq peaks) *or* from a rule-based detector — both are valid.
2. **Genome-wide scans in minutes, not sequencing runs.** Experimental mapping is expensive and cell-type-specific; a trained classifier sweeps an entire chromosome in one job and a whole genome across a few.
3. **Cross-organism transfer.** Because the features are organism-agnostic sequence statistics, a model trained on human labels can be applied to mouse or the T2T assembly, where no labels exist. This is the portal's headline capability (see the Model Library below) and the reason window size travels with the model.
4. **Interpretable, not a black box.** Top importances line up with textbook determinants — `cpg_oe` dominates CpG-island prediction, `g4_motif_count` dominates G4, G-density and GC-skew dominate R-loops — so a prediction can be defended, not just reported.
5. **A prioritized shortlist for validation.** The high-confidence BED and operating-point metrics turn a genome into a ranked list of candidate regions to test experimentally, which is where a portal like this saves the most time.

---

## Validated baseline (chr21, hg38)

Three feature detectors were used to generate labels and validate the pipeline on chromosome 21. See [research/](research/) for the plots and analysis notes.

| Feature | Label source | Best AUC |
| --- | --- | --- |
| RLFS | R-loop forming sequences (QmRLFS-finder method) | **0.934** |
| G4 | G-quadruplex-forming motifs | **0.978** |
| CpG | CpG islands (Gardiner-Garden criteria) | **0.933** |

An early prototype trained on experimental **DRIP-seq peaks** (rather than the rule-based RLFS detector) reached AUC 0.89 — lower because experimental peaks carry biological noise and cell-type specificity, and a useful confirmation that user-uploaded experimental labels work as intended.

All three tasks exceed AUC 0.93 using 51 sequence features and 200 bp windows, demonstrating that primary sequence composition alone predicts these structural features at high accuracy.

---

## Model Library & cross-organism detection

Any completed training job can be **saved to the library** under a name. Library models can be:

- **Listed, renamed, tagged, and deleted** through the UI.
- **Exported as a portable `.zip`** (`model.joblib` + `model_meta.json` + `library_info.json` + `features.csv`) and **imported** on another instance.
- **Applied to a new target** — pick any supported genome and chromosome and the model scores it **without retraining**. The target is extracted at the *same window size the model was trained with* (read from `model_meta.json`), so the feature matrix always matches what the model expects.

This is the cross-organism workflow: train a G4 classifier on `hg38/chr21`, then detect G4 sites on `mm39/chrX` or the `hs1` (T2T-CHM13) assembly — regions no experimental dataset covers. Apply jobs produce the same bedGraph / bigWig / high-confidence outputs; ranking metrics (AUC/AP) are carried over from the model's original training job, since the target has no labels of its own.

---

## Supported genomes

Chromosome FASTAs are downloaded on demand from the UCSC goldenPath mirror and cached.

| ID | Genome | Species | Chromosomes |
| --- | --- | --- | --- |
| `hg38` | Human (hg38) | *Homo sapiens* | chr1–22, X, Y |
| `hs1` | Human T2T-CHM13 | *Homo sapiens* | chr1–22, X, Y |
| `mm39` | Mouse (mm39) | *Mus musculus* | chr1–19, X, Y |

Adding a genome is a few lines in `backend/app/core/genomes.py` — no data needs to be shipped.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (React + IGV.js)                │
│  Pick genome/chr → upload BED → set window → train           │
│  view metrics · browse predictions · save to library · apply │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP  /api/*
┌──────────────────────────▼──────────────────────────────────┐
│                     FastAPI (port 8000)                      │
│  /api/jobs · /api/library · /api/genomes · /api/cache        │
│  serves the built React SPA in production                    │
└─────────┬───────────────────────────────┬────────────────────┘
          │ broker/backend + job state     │ dispatch
┌─────────▼──────────┐          ┌──────────▼───────────────────┐
│       Redis         │          │        Celery Worker         │
│  job metadata (TTL  │          │  prepare_genome · train_model│
│  24 h) · progress · │          │  apply_model                 │
│  rate-limit buckets │          │  extract → label → train →   │
└─────────────────────┘          │  predict → bedGraph/bigWig   │
                                 └──────────┬───────────────────┘
                                            │ downloads + caches
                    ┌───────────────────────▼───────────────────┐
                    │  /var/data/cache/{genome}/                 │
                    │   {chrom}.fa               (UCSC FASTA)     │
                    │   {chrom}__w{W}_s{S}.parquet (51 features)  │
                    │  LRU-evicted under a 4 GB soft cap         │
                    └────────────────────────────────────────────┘
```

**Stack**

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, React Router, Recharts, IGV.js |
| Backend | FastAPI 0.115, Python 3.12 |
| Task queue | Celery 5 + Redis 7 |
| ML | XGBoost 2.1, scikit-learn 1.5 |
| Data | Pandas 2.2, PyArrow 17 (Parquet), NumPy 2.1 |
| Genome tooling | UCSC `bedGraphToBigWig` |

---

## Project structure

```
MLGenomics/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI app + SPA serving
│   │   ├── config.py              # Settings + legacy parquet migration
│   │   ├── core/
│   │   │   ├── genomes.py         # Supported genome/chromosome registry
│   │   │   ├── features.py        # 51-feature metadata catalogue
│   │   │   ├── extraction.py      # FASTA → windowed feature matrix
│   │   │   ├── models.py          # XGBoost train / CV / balance / importances
│   │   │   ├── export.py          # bedGraph, high-conf BED, bigWig writers
│   │   │   ├── cache_eviction.py  # LRU disk-cap eviction for the genome cache
│   │   │   └── rate_limit.py      # Redis per-IP rate limiter
│   │   ├── routers/
│   │   │   ├── features.py        # genomes, chromosomes, cache prepare/status
│   │   │   ├── train.py           # POST /api/jobs
│   │   │   ├── jobs.py            # job status, export (bedGraph/bigWig), delete
│   │   │   └── library.py        # save / list / export / import / apply models
│   │   ├── schemas/               # Pydantic request/response models
│   │   └── tasks/
│   │       ├── extraction.py      # prepare_genome + ensure_feature_parquet
│   │       ├── training.py        # train_model Celery task
│   │       └── predict.py         # apply_model (cross-organism) Celery task
│   ├── celery_app.py
│   ├── start.sh                   # runs worker + uvicorn in one container
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx                # Routes + job list
│   │   ├── api/{client.ts,usePolling.ts}
│   │   ├── components/            # GenomePicker, BedUpload, IgvViewer,
│   │   │                          # MetricsDisplay, Nav, InfoDot, …
│   │   └── pages/
│   │       ├── NewJob.tsx         # genome/chr picker + training wizard
│   │       ├── JobResults.tsx     # live-polling results + IGV browser
│   │       └── Library.tsx        # saved models + apply-to-target UI
│   ├── Dockerfile
│   └── package.json
├── data/
│   └── features_master.parquet    # baked chr21/200bp matrix (migrated into cache)
├── research/                      # baseline plots + analysis notes
├── docker-compose.yml
└── CLAUDE.md
```

---

## Quickstart

### With Docker (recommended)

Requires [Docker](https://docs.docker.com/get-docker/) with Compose V2.

```
docker compose up --build
```

| Service | URL |
| --- | --- |
| API (dev) | <http://localhost:8000> |
| API docs | <http://localhost:8000/docs> |
| Frontend (dev, hot reload) | <http://localhost:5173> |

The Compose stack runs `redis`, the `api`, and a Celery `worker` as separate services sharing the genome cache volume. Start the frontend dev server with the `dev` profile (`docker compose --profile dev up`). In production the React build is baked into the image and served directly by the API on one port.

### Without Docker (development)

**Prerequisites:** Python 3.12, Node.js 20, a running Redis instance, and the UCSC `bedGraphToBigWig` binary on `PATH` (bigWig export is skipped gracefully if it's missing).

```
# Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# Backend API (port 8000)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Celery worker (new terminal, same backend directory)
celery -A celery_app.celery worker --loglevel=info --concurrency=2

# Frontend dev server (new terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173 → proxies /api to port 8000
```

---

## User guide

### 1. Pick a genome and prepare it

On **New Job**, choose a genome and chromosome. If that chromosome hasn't been downloaded yet, click **Prepare data** — this fetches the FASTA from UCSC and caches it. Extraction itself happens later, during training, because it depends on the window size.

### 2. Prepare a BED file

Your BED file defines the **positive-label regions** — intervals where the feature occurs:

```
chr21   10000   10200
chr21   15400   15600
chr21   31000   31400
```

Tab-separated, BED3 or wider, up to 50 MB, on the chromosome you selected. Track/browser header lines are ignored.

### 3. Configure and submit

The wizard has two steps:

- **Labels & window** — drop your BED file (the feature window auto-fills from the median region width; override it if you like). Set the negative:positive ratio (default 3).
- **Model** — an XGBoost classifier trains on all 51 features; optionally tune `n_estimators` and `max_depth`.

### 4. View results

The results page polls live and, once complete, shows:

- **ROC-AUC** and **Average Precision** on the held-out 20% test set
- **5-fold cross-validation AUC ± std**
- **Precision / recall / F1 / specificity** at the 0.5 operating point
- Positive/negative counts, high-confidence region count, and the fraction / bp of the chromosome flagged
- A **feature-importance** bar chart (top predictors)
- An **embedded IGV.js genome browser** — pan and zoom across the chromosome and inspect per-window scores without downloading anything

### 5. Export and reuse

- **Download bedGraph** or **bigWig** for the full genome-wide prediction (one row per window, score 0–1). A companion `highconf.bed` lists windows ≥ 0.5. Both load in [IGV Desktop](https://igv.org/) or the [UCSC Genome Browser](https://genome.ucsc.edu/).
- **Save to library** to keep the model, then from the **Library** page **apply** it to any other genome/chromosome, or export it as a `.zip` to share.

---

## API reference

All endpoints are under `/api`. Interactive docs at `/docs`.

**Genomes & cache**

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/genomes` | Supported genomes and their chromosomes |
| GET | `/api/chromosomes?genome=` | Chromosomes for a genome, with cache status |
| GET | `/api/features` | All 51 feature names, groups, descriptions |
| GET | `/api/cache/usage` | Cache bytes used vs. cap |
| POST | `/api/genome/{g}/chromosome/{c}/prepare` | Download & cache a chromosome FASTA |
| GET | `/api/genome/{g}/chromosome/{c}/status` | Cache/prepare progress |

**Jobs**

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/jobs` | Submit a training job (multipart: `config` + `bed_file`) |
| GET | `/api/jobs` | List all jobs, newest first |
| GET | `/api/jobs/{id}` | Status, progress, metrics, feature importances |
| GET | `/api/jobs/{id}/export` | Stream the bedGraph |
| GET | `/api/jobs/{id}/export.bw` | Stream the bigWig (lazily built if absent) |
| DELETE | `/api/jobs/{id}` | Remove job and output files |

**Library**

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/jobs/{id}/save` | Promote a completed job's model to the library |
| GET | `/api/library` | List saved models |
| GET | `/api/library/{name}` | Model detail |
| PATCH | `/api/library/{name}` | Rename / retag |
| DELETE | `/api/library/{name}` | Remove a saved model |
| GET | `/api/library/{name}/export` | Download `.zip` bundle |
| POST | `/api/library/import` | Upload a `.zip` → register model |
| POST | `/api/library/{name}/predict` | Apply model to a target genome/chr (async) |

**TrainRequest (JSON `config` field):**

```json
{
  "genome":        "hg38",
  "chromosome":    "chr21",
  "window_size":   200,
  "step_size":     null,
  "features":      null,
  "model_params":  {"n_estimators": 500, "max_depth": 8},
  "neg_ratio":     3,
  "test_fraction": 0.2
}
```

`step_size: null` means non-overlapping windows (= `window_size`). `features: null` uses all 51.

---

## Operations & development notes

- **Genome cache.** FASTAs and per-window feature parquets live under `/var/data/cache/{genome}/`. Total size is held under a ~4 GB soft cap by LRU eviction (oldest by mtime). Extraction is memory-bounded via pre-allocated NumPy arrays — a ~1.2M-window chromosome peaks around 350 MB rather than ~1.5 GB.
- **Job state.** Metadata lives in Redis (AOF persistence) with a 24-hour TTL; per-job progress is streamed as `stage` + fractional `progress`. Trained models and outputs are written to `/var/data/jobs/<uuid>/`, library models to `/var/data/library/<slug>/`.
- **Rate limiting.** Redis-backed per-IP sliding-window limits guard `/prepare` and job submission (5/min each) against runaway scripts.
- **Safety.** `job_id` must be a UUID and library names must be lowercase slugs — both are validated before any filesystem access to block path traversal. CORS is closed by default and only opens for origins listed in `ALLOWED_ORIGINS`.
- **Deployment.** In production a single container runs the Celery worker and uvicorn together (`start.sh`) so they share one persistent `/var/data` volume; the React build is served by the API. The Dockerfile installs `bedGraphToBigWig` and bakes the legacy chr21 matrix, which `config.py` migrates into the cache layout on startup so a 200 bp chr21 job reuses it instead of re-extracting.
- **Worker parallelism.** `--concurrency` is memory-bound: each job loads its chromosome's feature matrix, so size it against available RAM and window count.

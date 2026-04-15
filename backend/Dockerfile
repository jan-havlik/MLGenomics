# ── Stage 1: build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json .
RUN npm install
COPY frontend/ .
RUN npm run build

# ── Stage 2: Python backend + baked frontend ──────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Install Python deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ .

# Bake the feature matrix (12 MB)
COPY data/features_master.parquet /data/features_master.parquet

# Copy built frontend
COPY --from=frontend-build /app/dist /frontend/dist

# Ensure runtime directories exist
RUN mkdir -p /data/jobs /data/library

ENV PYTHONUNBUFFERED=1
ENV PARQUET_DIR=/data
ENV JOBS_DIR=/data/jobs

COPY backend/start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]

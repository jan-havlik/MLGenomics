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

# Bake the feature matrix (12 MB) as a read-only asset inside the image.
# Kept separate from /var/data so it survives a Railway volume mount.
COPY data/features_master.parquet /app/data/features_master.parquet

# Copy built frontend
COPY --from=frontend-build /app/dist /frontend/dist

# Ensure runtime state directories exist (overlaid by the Railway volume in prod)
RUN mkdir -p /var/data/jobs /var/data/library

ENV PYTHONUNBUFFERED=1
ENV PARQUET_DIR=/app/data
ENV JOBS_DIR=/var/data/jobs
ENV LIBRARY_DIR=/var/data/library

COPY backend/start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]

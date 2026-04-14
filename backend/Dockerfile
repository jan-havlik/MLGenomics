FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for layer caching
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ .

# Bake the feature matrix into the image (12 MB — avoids host bind mounts in production)
COPY data/features_master.parquet /data/features_master.parquet

# Ensure runtime directories exist
RUN mkdir -p /data/jobs /data/library

ENV PYTHONUNBUFFERED=1
ENV PARQUET_DIR=/data
ENV JOBS_DIR=/data/jobs

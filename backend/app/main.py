from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import features, jobs, train

app = FastAPI(
    title="Genomics ML Portal",
    description="Train ML models to classify genomic features across the human genome.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(features.router)
app.include_router(jobs.router)
app.include_router(train.router)


@app.get("/health")
def health():
    return {"status": "ok"}

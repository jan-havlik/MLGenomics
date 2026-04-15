from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.routers import features, jobs, train, library

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
app.include_router(library.router)


@app.get("/health")
def health():
    return {"status": "ok"}


# Serve the React SPA for production (frontend built into /frontend/dist).
# In local dev the Vite dev server handles the frontend, so this is a no-op
# when /frontend/dist doesn't exist.
_DIST = Path("/frontend/dist")

if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        # Let /api/* fall through to the routers above; serve index.html for everything else
        return FileResponse(_DIST / "index.html")

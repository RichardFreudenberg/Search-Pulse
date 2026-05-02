"""
pipeline/api/app.py
────────────────────
FastAPI application for the pipeline REST API.

All endpoints are NEW — they don't conflict with the existing
JavaScript CRM frontend in any way.

Base URL: http://localhost:8000/api/v1/

Endpoints:
  GET  /companies              search canonical companies
  GET  /companies/{id}         get one company with full enrichment
  GET  /companies/{id}/ownership  ownership tree
  GET  /companies/{id}/directors  director list + network
  GET  /companies/{id}/filings    filing history
  GET  /directors/{id}/companies  all companies for a director
  GET  /filings                search filings
  POST /search/trigger         trigger an on-demand search job
  GET  /pipeline/status        health + queue depths + budget
  GET  /pipeline/costs         retrieval cost summary
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from pipeline.api.routes import companies, directors, filings, pipeline_admin
from pipeline.monitoring.audit_log import configure_logging
from pipeline.config import config as cfg_module


# ─── App factory ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown hooks."""
    log_cfg = cfg_module.get("monitoring")
    configure_logging(
        level       = log_cfg.get("log_level", "INFO"),
        json_output = True,
    )

    # Ensure pipeline tables exist on first boot
    try:
        from pipeline.db.database import create_tables
        create_tables()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("DB init skipped: %s", exc)

    yield   # application runs here
    # Cleanup on shutdown (if needed)


app = FastAPI(
    title       = "SearchPulse Pipeline API",
    description = (
        "Internal data pipeline API for German company data ingestion, "
        "enrichment, and synchronisation to the SearchPulse CRM."
    ),
    version     = "1.0.0",
    lifespan    = lifespan,
    docs_url    = "/api/docs",
    redoc_url   = "/api/redoc",
    openapi_url = "/api/openapi.json",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
# Allow the CRM frontend (served from any port in development)
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],     # tighten to your production domain in prod
    allow_credentials = False,
    allow_methods     = ["GET", "POST", "PUT"],
    allow_headers     = ["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(companies.router,      prefix="/api/v1")
app.include_router(directors.router,      prefix="/api/v1")
app.include_router(filings.router,        prefix="/api/v1")
app.include_router(pipeline_admin.router, prefix="/api/v1")

# ─── Health check ────────────────────────────────────────────────────────────
@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}

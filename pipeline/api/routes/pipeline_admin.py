"""pipeline/api/routes/pipeline_admin.py — Pipeline health, status and triggers."""

from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


class SearchTriggerRequest(BaseModel):
    source:  str
    query:   str
    max_pages: int = 3


@router.get("/status", summary="Pipeline health and queue depths")
async def pipeline_status():
    """Return queue depths, last run times, and DB health."""
    from pipeline.config import config as cfg_module
    from pipeline.ingestion.queue import create_queue
    from pipeline.retrieval.cost_tracker import CostTracker

    try:
        ing_cfg = cfg_module.get("ingestion")
        queue   = create_queue(ing_cfg)
        depths  = {
            "high":    await queue.length("high_priority"),
            "default": await queue.length("default"),
            "bulk":    await queue.length("bulk"),
            "dead":    len(await queue.dead_letters(limit=10)),
        }
    except Exception as exc:
        depths = {"error": str(exc)}

    try:
        costs = CostTracker(cfg_module.get("retrieval")).summary()
    except Exception:
        costs = {}

    return {
        "status":    "ok",
        "queues":    depths,
        "budget":    costs,
    }


@router.get("/costs", summary="Retrieval cost summary")
async def cost_summary():
    from pipeline.config import config as cfg_module
    from pipeline.retrieval.cost_tracker import CostTracker
    tracker = CostTracker(cfg_module.get("retrieval"))
    return tracker.summary()


@router.post("/search/trigger", summary="Trigger on-demand search job")
async def trigger_search(body: SearchTriggerRequest):
    """
    Kick off an immediate connector fetch for a source + query.
    Returns the Celery task ID for polling.
    """
    from pipeline.ingestion.tasks import run_connector
    task = run_connector.apply_async(
        kwargs={"source": body.source, "job": "fetch", "query": body.query}
    )
    return {"status": "queued", "task_id": task.id, "source": body.source, "query": body.query}


@router.post("/sync/firestore", summary="Trigger Firestore sync for all companies")
async def sync_all_firestore():
    """Enqueue a Firestore sync task for every company in the pipeline DB."""
    from pipeline.db.database import get_session
    from pipeline.db.models import CanonicalCompany
    from pipeline.ingestion.tasks import sync_to_firestore
    from sqlalchemy import select

    with get_session() as session:
        result = session.execute(select(CanonicalCompany.id))
        ids    = [row[0] for row in result]

    for cid in ids:
        sync_to_firestore.apply_async(kwargs={"company_id": cid})

    return {"status": "queued", "company_count": len(ids)}

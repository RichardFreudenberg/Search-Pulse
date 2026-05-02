"""pipeline/api/routes/directors.py — Director cross-company lookup."""

from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pipeline.db.database import get_async_session
from pipeline.db.models import Director, DirectorRole

router = APIRouter(prefix="/directors", tags=["directors"])


@router.get("", summary="Search directors")
async def search_directors(
    q:     str = Query(..., description="Director name search"),
    limit: int = Query(20, le=100),
    session: AsyncSession = Depends(get_async_session),
):
    stmt = (select(Director)
            .where(Director.full_name.ilike(f"%{q}%"))
            .limit(limit))
    result    = await session.execute(stmt)
    directors = result.scalars().all()
    return {"count": len(directors), "results": [
        {"id": d.id, "full_name": d.full_name, "role_count": len(d.roles)}
        for d in directors
    ]}


@router.get("/{director_id}/companies", summary="All companies for a director")
async def get_director_companies(
    director_id: str,
    active_only: bool = Query(True),
    session: AsyncSession = Depends(get_async_session),
):
    director = await session.get(Director, director_id)
    if not director:
        raise HTTPException(status_code=404, detail="Director not found")

    roles = director.roles
    if active_only:
        roles = [r for r in roles if not r.end_date]

    return {
        "director_id": director_id,
        "full_name":   director.full_name,
        "companies": [
            {
                "company_id":   role.company_id,
                "company_name": role.company.canonical_name if role.company else "",
                "role":         role.role,
                "start_date":   role.start_date,
                "end_date":     role.end_date,
            }
            for role in roles
        ],
    }

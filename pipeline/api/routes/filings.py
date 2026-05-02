"""pipeline/api/routes/filings.py — Filing search and detail endpoints."""

from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pipeline.db.database import get_async_session
from pipeline.db.models import Filing

router = APIRouter(prefix="/filings", tags=["filings"])


@router.get("", summary="Search filings")
async def search_filings(
    q:           Optional[str] = Query(None, description="Company name substring"),
    filing_type: Optional[str] = Query(None, description="annual_accounts | announcement etc."),
    fiscal_year: Optional[int] = Query(None),
    source:      Optional[str] = Query(None),
    limit:  int = Query(50, le=200),
    offset: int = Query(0),
    session: AsyncSession = Depends(get_async_session),
):
    from sqlalchemy import and_
    stmt    = select(Filing)
    filters = []

    if filing_type:
        filters.append(Filing.filing_type == filing_type)
    if fiscal_year:
        filters.append(Filing.fiscal_year == fiscal_year)
    if source:
        filters.append(Filing.source == source)

    if filters:
        stmt = stmt.where(and_(*filters))

    stmt = stmt.order_by(Filing.filing_date.desc()).offset(offset).limit(limit)
    result  = await session.execute(stmt)
    filings = result.scalars().all()

    return {
        "count":   len(filings),
        "offset":  offset,
        "results": [
            {
                "id":          f.id,
                "company_id":  f.company_id,
                "filing_type": f.filing_type,
                "filing_date": f.filing_date,
                "fiscal_year": f.fiscal_year,
                "source":      f.source,
                "revenue_eur": float(f.revenue_eur) if f.revenue_eur else None,
                "employees":   f.employees,
            }
            for f in filings
        ],
    }

"""
pipeline/api/routes/companies.py
──────────────────────────────────
Company endpoints:

  GET  /companies              search with filters
  GET  /companies/{id}         single company detail
  GET  /companies/{id}/ownership  ownership tree
  GET  /companies/{id}/directors  director list
  GET  /companies/{id}/filings    filing history
  POST /companies/{id}/enrich  trigger on-demand enrichment
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.db.database import get_async_session
from pipeline.db.models import CanonicalCompany, Filing, DirectorRole

router = APIRouter(prefix="/companies", tags=["companies"])


# ─── Search / list ────────────────────────────────────────────────────────────

@router.get("", summary="Search companies")
async def search_companies(
    q:           Optional[str] = Query(None, description="Company name search"),
    legal_form:  Optional[str] = Query(None, description="e.g. GmbH, AG"),
    state:       Optional[str] = Query(None, description="2-letter state code, e.g. NW"),
    city:        Optional[str] = Query(None),
    industry:    Optional[str] = Query(None),
    status:      Optional[str] = Query("active"),
    min_age:     Optional[int] = Query(None, description="Minimum company age in years"),
    limit:  int = Query(50, le=200),
    offset: int = Query(0),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Search canonical companies with optional filters.
    Results are ordered by last_updated_at descending.
    """
    stmt = select(CanonicalCompany)
    filters = []

    if q:
        filters.append(CanonicalCompany.canonical_name.ilike(f"%{q}%"))
    if legal_form:
        filters.append(CanonicalCompany.legal_form == legal_form)
    if state:
        filters.append(CanonicalCompany.court_state == state.upper())
    if city:
        filters.append(CanonicalCompany.city.ilike(f"%{city}%"))
    if industry:
        filters.append(CanonicalCompany.industry == industry)
    if status:
        filters.append(CanonicalCompany.status == status)

    if filters:
        stmt = stmt.where(and_(*filters))

    stmt = (stmt
            .order_by(CanonicalCompany.last_updated_at.desc())
            .offset(offset)
            .limit(limit))

    result    = await session.execute(stmt)
    companies = result.scalars().all()

    return {
        "count":   len(companies),
        "offset":  offset,
        "results": [_company_summary(c) for c in companies],
    }


# ─── Single company ───────────────────────────────────────────────────────────

@router.get("/{company_id}", summary="Get company detail")
async def get_company(
    company_id: str,
    session: AsyncSession = Depends(get_async_session),
):
    company = await session.get(CanonicalCompany, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    return _company_detail(company)


# ─── Ownership tree ───────────────────────────────────────────────────────────

@router.get("/{company_id}/ownership", summary="Ownership tree")
async def get_ownership(
    company_id: str,
    direction: str = Query("both", description="up | down | both"),
    depth:     int = Query(3, le=5),
    session: AsyncSession = Depends(get_async_session),
):
    company = await session.get(CanonicalCompany, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    from pipeline.enrichment.ownership_tree import OwnershipTree
    # Use sync session for enrichment (it's read-only here)
    from pipeline.db.database import get_session
    with get_session() as sync_session:
        tree = OwnershipTree(sync_session)
        graph = tree.get_tree(company_id, direction=direction, depth=depth)

    return graph


# ─── Directors ────────────────────────────────────────────────────────────────

@router.get("/{company_id}/directors", summary="Director list and network")
async def get_directors(
    company_id: str,
    include_network: bool = Query(False, description="Include cross-company director network"),
    session: AsyncSession = Depends(get_async_session),
):
    company = await session.get(CanonicalCompany, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    roles = [
        {
            "director_id": role.director_id,
            "full_name":   role.director.full_name if role.director else "",
            "role":        role.role,
            "start_date":  role.start_date,
            "end_date":    role.end_date,
            "active":      not role.end_date,
        }
        for role in company.director_roles
    ]

    result = {"company_id": company_id, "directors": roles}

    if include_network:
        from pipeline.enrichment.director_graph import DirectorGraph
        from pipeline.db.database import get_session
        with get_session() as sync_session:
            graph = DirectorGraph(sync_session)
            result["network"] = graph.get_network(company_id, depth=2)

    return result


# ─── Filings ──────────────────────────────────────────────────────────────────

@router.get("/{company_id}/filings", summary="Filing history")
async def get_filings(
    company_id: str,
    filing_type: Optional[str] = Query(None),
    limit: int = Query(20, le=100),
    session: AsyncSession = Depends(get_async_session),
):
    company = await session.get(CanonicalCompany, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    stmt = select(Filing).where(Filing.company_id == company_id)
    if filing_type:
        stmt = stmt.where(Filing.filing_type == filing_type)
    stmt = stmt.order_by(Filing.filing_date.desc()).limit(limit)

    result  = await session.execute(stmt)
    filings = result.scalars().all()

    return {
        "company_id": company_id,
        "filings":    [_filing_summary(f) for f in filings],
    }


# ─── On-demand enrichment trigger ────────────────────────────────────────────

@router.post("/{company_id}/enrich", summary="Trigger on-demand enrichment")
async def trigger_enrich(
    company_id: str,
    session: AsyncSession = Depends(get_async_session),
):
    company = await session.get(CanonicalCompany, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    from pipeline.ingestion.tasks import enrich_company
    task = enrich_company.apply_async(kwargs={"company_id": company_id})

    return {"status": "queued", "task_id": task.id, "company_id": company_id}


# ─── Serialisers ─────────────────────────────────────────────────────────────

def _company_summary(c: CanonicalCompany) -> dict:
    return {
        "id":               c.id,
        "name":             c.canonical_name,
        "legal_form":       c.legal_form,
        "registry_number":  c.registry_number,
        "court":            c.court,
        "court_state":      c.court_state,
        "city":             c.city,
        "postal_code":      c.postal_code,
        "status":           c.status,
        "industry":         c.industry,
        "incorporation_date": c.incorporation_date,
        "last_updated_at":  c.last_updated_at.isoformat() if c.last_updated_at else None,
    }


def _company_detail(c: CanonicalCompany) -> dict:
    detail = _company_summary(c)
    detail.update({
        "street_address":   c.street_address,
        "website":          c.website,
        "share_capital":    float(c.share_capital) if c.share_capital else None,
        "share_capital_currency": c.share_capital_currency,
        "euid":             c.euid,
        "dissolution_date": c.dissolution_date,
        "sources":          [s.source for s in c.sources],
        "director_count":   len(c.director_roles),
        "filing_count":     len(c.filings),
        "document_count":   len(c.documents),
        "first_seen_at":    c.first_seen_at.isoformat() if c.first_seen_at else None,
        "firestore_synced_at": c.firestore_synced_at.isoformat() if c.firestore_synced_at else None,
    })
    return detail


def _filing_summary(f: Filing) -> dict:
    return {
        "id":           f.id,
        "filing_type":  f.filing_type,
        "filing_date":  f.filing_date,
        "fiscal_year":  f.fiscal_year,
        "source":       f.source,
        "revenue_eur":  float(f.revenue_eur) if f.revenue_eur else None,
        "ebitda_eur":   float(f.ebitda_eur) if f.ebitda_eur else None,
        "employees":    f.employees,
        "document_url": f.document_url,
    }

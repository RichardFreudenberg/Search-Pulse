"""
pipeline/db/models.py
──────────────────────
SQLAlchemy ORM models for the pipeline's PostgreSQL database.

⚠️  These are NEW tables only — they DO NOT modify any existing tables.
    The existing Firestore CRM data is untouched; this DB is the pipeline's
    own structured store for entity resolution, filings, directors, etc.

Table inventory:
  canonical_companies    → deduplicated master company records
  company_sources        → raw source entries (one per source per company)
  raw_ingestions         → append-only log of every ingested record
  filings                → structured annual filings
  directors              → individuals appearing in filings
  director_roles         → M2M: director ↔ company with time range
  shareholders           → ownership stakes
  ownership_edges        → graph edges (owner → owned, with % stake)
  documents              → downloaded and cached filing PDFs
  retrieval_costs        → per-document cost tracking
  connector_state        → last successful run time per connector
  change_log             → append-only audit trail of detected changes
  entity_mappings        → source entity_id → canonical company_id
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, Float, ForeignKey,
    Index, Integer, Numeric, String, Text, UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── Canonical companies ──────────────────────────────────────────────────────

class CanonicalCompany(Base):
    """
    The authoritative, deduplicated company record.
    Each row represents one real-world company regardless of how many
    sources reported it.
    """
    __tablename__ = "canonical_companies"

    id                 = Column(String(36),  primary_key=True)          # UUID
    canonical_name     = Column(String(512), nullable=False, index=True)
    legal_form         = Column(String(64),  index=True)
    registry_number    = Column(String(64),  index=True)   # "HRB 12345"
    registry_type      = Column(String(8))                 # "HRB" | "HRA"
    court              = Column(String(128))               # "Amtsgericht Köln"
    court_state        = Column(String(2),   index=True)   # "NW"
    status             = Column(String(32),  default="active", index=True)
    incorporation_date = Column(String(10))                # ISO date or ""
    dissolution_date   = Column(String(10))
    street_address     = Column(String(256))
    postal_code        = Column(String(10),  index=True)
    city               = Column(String(128), index=True)
    website            = Column(String(512))
    industry           = Column(String(64),  index=True)
    industry_raw       = Column(Text)
    share_capital      = Column(Numeric(15, 2))
    share_capital_currency = Column(String(8), default="EUR")
    euid               = Column(String(32))
    first_seen_at      = Column(DateTime(timezone=True), default=_now)
    last_updated_at    = Column(DateTime(timezone=True), default=_now, onupdate=_now)
    firestore_synced_at = Column(DateTime(timezone=True))

    # Relationships
    sources            = relationship("CompanySource",  back_populates="company", cascade="all, delete-orphan")
    filings            = relationship("Filing",         back_populates="company", cascade="all, delete-orphan")
    director_roles     = relationship("DirectorRole",   back_populates="company", cascade="all, delete-orphan")
    documents          = relationship("Document",       back_populates="company", cascade="all, delete-orphan")
    ownership_as_owner = relationship("OwnershipEdge",  foreign_keys="OwnershipEdge.owner_company_id",
                                       back_populates="owner_company")
    ownership_as_owned = relationship("OwnershipEdge",  foreign_keys="OwnershipEdge.owned_company_id",
                                       back_populates="owned_company")

    __table_args__ = (
        Index("ix_cc_registry", "registry_number", "court"),
        Index("ix_cc_state_form", "court_state", "legal_form"),
    )


# ─── Company sources ──────────────────────────────────────────────────────────

class CompanySource(Base):
    """
    One row per (company, source) pair — the raw data as received from
    each source, linked back to the canonical company.
    """
    __tablename__ = "company_sources"

    id              = Column(BigInteger, primary_key=True, autoincrement=True)
    company_id      = Column(String(36), ForeignKey("canonical_companies.id"), nullable=False, index=True)
    source          = Column(String(64), nullable=False)          # "bundesanzeiger"
    source_id       = Column(String(128))                         # ID in source system
    company_name    = Column(String(512))
    registry_number = Column(String(64))
    legal_form      = Column(String(64))
    status          = Column(String(32))
    raw_json        = Column(Text)
    first_seen_at   = Column(DateTime(timezone=True), default=_now)
    last_updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    company = relationship("CanonicalCompany", back_populates="sources")

    __table_args__ = (
        UniqueConstraint("company_id", "source", name="uq_company_source"),
    )


# ─── Raw ingestion log ────────────────────────────────────────────────────────

class RawIngestion(Base):
    """
    Append-only log of every RawRecord ingested.
    Useful for reprocessing and debugging — never update rows here.
    """
    __tablename__ = "raw_ingestions"

    id           = Column(BigInteger, primary_key=True, autoincrement=True)
    source       = Column(String(64),  nullable=False, index=True)
    record_type  = Column(String(32),  index=True)
    source_url   = Column(Text)
    source_id    = Column(String(128), index=True)
    raw_json     = Column(Text)
    company_id   = Column(String(36),  ForeignKey("canonical_companies.id"), index=True)
    ingested_at  = Column(DateTime(timezone=True), default=_now, index=True)


# ─── Filings ──────────────────────────────────────────────────────────────────

class Filing(Base):
    """Structured annual accounts and other filings from Bundesanzeiger."""
    __tablename__ = "filings"

    id             = Column(BigInteger, primary_key=True, autoincrement=True)
    company_id     = Column(String(36), ForeignKey("canonical_companies.id"), nullable=False, index=True)
    filing_type    = Column(String(64), index=True)       # "annual_accounts" etc.
    filing_date    = Column(String(10), index=True)       # ISO date
    document_url   = Column(Text)
    document_id    = Column(BigInteger, ForeignKey("documents.id"))
    source         = Column(String(64))
    fiscal_year    = Column(Integer)                      # e.g. 2023
    revenue_eur    = Column(Numeric(18, 2))
    ebitda_eur     = Column(Numeric(18, 2))
    employees      = Column(Integer)
    parsed_data    = Column(Text)                         # JSON extracted fields
    created_at     = Column(DateTime(timezone=True), default=_now)
    updated_at     = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    company  = relationship("CanonicalCompany", back_populates="filings")
    document = relationship("Document")


# ─── Directors ────────────────────────────────────────────────────────────────

class Director(Base):
    """
    An individual person appearing as a director or officer in filings.
    Deduplicated across companies — one row per unique natural person.
    """
    __tablename__ = "directors"

    id            = Column(String(36),  primary_key=True)    # UUID
    full_name     = Column(String(256), nullable=False, index=True)
    normalized_name = Column(String(256), index=True)         # lowercase, sorted tokens
    birth_year    = Column(Integer)
    nationality   = Column(String(64))
    address_city  = Column(String(128))
    first_seen_at = Column(DateTime(timezone=True), default=_now)
    last_seen_at  = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    roles = relationship("DirectorRole", back_populates="director")


class DirectorRole(Base):
    """Many-to-many: Director ↔ Company with role and time range."""
    __tablename__ = "director_roles"

    id           = Column(BigInteger, primary_key=True, autoincrement=True)
    director_id  = Column(String(36),  ForeignKey("directors.id"), nullable=False, index=True)
    company_id   = Column(String(36),  ForeignKey("canonical_companies.id"), nullable=False, index=True)
    role         = Column(String(128))     # "Geschäftsführer" | "Prokurist" etc.
    start_date   = Column(String(10))      # ISO date or ""
    end_date     = Column(String(10))      # "" = currently active
    source       = Column(String(64))
    created_at   = Column(DateTime(timezone=True), default=_now)

    director = relationship("Director",         back_populates="roles")
    company  = relationship("CanonicalCompany", back_populates="director_roles")

    __table_args__ = (
        UniqueConstraint("director_id", "company_id", "role", "start_date",
                         name="uq_director_role"),
    )


# ─── Shareholders / ownership ─────────────────────────────────────────────────

class Shareholder(Base):
    """
    A shareholder entry from a filing (natural person or legal entity).
    """
    __tablename__ = "shareholders"

    id            = Column(BigInteger, primary_key=True, autoincrement=True)
    company_id    = Column(String(36), ForeignKey("canonical_companies.id"), nullable=False, index=True)
    name          = Column(String(256))
    stake_pct     = Column(Float)                        # percentage, e.g. 51.0
    stake_eur     = Column(Numeric(15, 2))
    shareholder_type = Column(String(32))                # "person" | "company"
    source        = Column(String(64))
    filing_date   = Column(String(10))
    created_at    = Column(DateTime(timezone=True), default=_now)


class OwnershipEdge(Base):
    """
    Directed ownership graph edge: owner_company → owned_company.
    Only populated when the shareholder is itself a registered company.
    """
    __tablename__ = "ownership_edges"

    id              = Column(BigInteger, primary_key=True, autoincrement=True)
    owner_company_id = Column(String(36), ForeignKey("canonical_companies.id"), nullable=False, index=True)
    owned_company_id = Column(String(36), ForeignKey("canonical_companies.id"), nullable=False, index=True)
    stake_pct       = Column(Float)
    effective_date  = Column(String(10))
    source          = Column(String(64))
    created_at      = Column(DateTime(timezone=True), default=_now)

    owner_company = relationship("CanonicalCompany",
                                  foreign_keys=[owner_company_id],
                                  back_populates="ownership_as_owner")
    owned_company = relationship("CanonicalCompany",
                                  foreign_keys=[owned_company_id],
                                  back_populates="ownership_as_owned")

    __table_args__ = (
        UniqueConstraint("owner_company_id", "owned_company_id", name="uq_ownership_edge"),
    )


# ─── Documents ────────────────────────────────────────────────────────────────

class Document(Base):
    """Cached filing documents (PDFs downloaded from Bundesanzeiger etc.)."""
    __tablename__ = "documents"

    id            = Column(BigInteger, primary_key=True, autoincrement=True)
    company_id    = Column(String(36), ForeignKey("canonical_companies.id"), nullable=False, index=True)
    document_type = Column(String(64))       # "annual_accounts" | "announcement" etc.
    source_url    = Column(Text)
    file_path     = Column(Text)             # local cache path
    file_hash     = Column(String(64))       # SHA-256 for dedup
    pages         = Column(Integer, default=0)
    parsed_json   = Column(Text)             # structured extracted data
    cost_eur      = Column(Float, default=0.0)
    fetched_at    = Column(DateTime(timezone=True), default=_now, index=True)

    company = relationship("CanonicalCompany", back_populates="documents")


# ─── Retrieval cost tracking ──────────────────────────────────────────────────

class RetrievalCost(Base):
    """Tracks spend per document fetch for budget enforcement."""
    __tablename__ = "retrieval_costs"

    id            = Column(BigInteger, primary_key=True, autoincrement=True)
    company_id    = Column(String(36), ForeignKey("canonical_companies.id"), index=True)
    document_type = Column(String(64))
    cost_eur      = Column(Float, default=0.0)
    source        = Column(String(64))
    fetched_at    = Column(DateTime(timezone=True), default=_now, index=True)


# ─── Connector state ──────────────────────────────────────────────────────────

class ConnectorState(Base):
    """Tracks the last successful run time per connector (for incremental sync)."""
    __tablename__ = "connector_state"

    source      = Column(String(64), primary_key=True)
    last_run_at = Column(DateTime(timezone=True))
    last_count  = Column(Integer, default=0)


# ─── Change log (append-only) ─────────────────────────────────────────────────

class ChangeLog(Base):
    """
    Append-only audit trail of every detected change.
    Never update rows — only INSERT.
    """
    __tablename__ = "change_log"

    id           = Column(BigInteger, primary_key=True, autoincrement=True)
    company_id   = Column(String(36), ForeignKey("canonical_companies.id"), nullable=False, index=True)
    event_type   = Column(String(64), nullable=False, index=True)  # "director_added" etc.
    field_name   = Column(String(128))
    old_value    = Column(Text)
    new_value    = Column(Text)
    source       = Column(String(64))
    detected_at  = Column(DateTime(timezone=True), default=_now, index=True)
    notified     = Column(Boolean, default=False)


# ─── Entity mappings ──────────────────────────────────────────────────────────

class EntityMapping(Base):
    """
    Cross-source entity resolution table.
    Maps a (source, source_entity_id) pair to a canonical_company_id.
    """
    __tablename__ = "entity_mappings"

    id                  = Column(BigInteger, primary_key=True, autoincrement=True)
    source              = Column(String(64),  nullable=False)
    source_entity_id    = Column(String(256), nullable=False)
    canonical_company_id = Column(String(36), ForeignKey("canonical_companies.id"), nullable=False, index=True)
    confidence          = Column(Float, default=1.0)         # 0–1 match confidence
    match_method        = Column(String(64))                 # "exact_registry" | "fuzzy_name" etc.
    created_at          = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        UniqueConstraint("source", "source_entity_id", name="uq_entity_mapping"),
    )

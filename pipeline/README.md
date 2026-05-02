# SearchPulse — German Company Data Pipeline

A **production-grade, legally compliant data ingestion platform** that aggregates German company data from public registries, enriches it, and synchronises it to the SearchPulse CRM.

Completely additive — no existing CRM code is modified.

---

## Architecture Overview

```
Public Sources                     Pipeline                      CRM
─────────────    ──────────────────────────────────────────    ──────────
Bundesanzeiger → [Connector] → [Queue] → [Worker]           →  Firestore
Unternehmens-  → [Connector] ↗          │                       (existing
register                                 ├─ Parse (PDF+HTML)      frontend
Handelsregister→ [Connector] ↗          ├─ Entity Resolution     unchanged)
                                         ├─ Enrichment
                                         │   ├── Director Graph
                                         │   ├── Ownership Tree
                                         │   └── Industry Classify
                                         ├─ Change Detection
                                         └─ Firestore Sync

REST API: GET /api/v1/companies, /directors, /filings, /pipeline/status
```

---

## Quick Start (Docker — recommended)

```bash
# 1. Clone / navigate to the pipeline directory
cd search-fund-crm/pipeline

# 2. Copy and edit the environment file
cp .env.example .env
# Edit .env — set FIREBASE_PROJECT_ID, optionally OPENAI_API_KEY

# 3. Place your Firebase service account key
#    (download from Firebase Console → Project Settings → Service Accounts)
cp ~/Downloads/serviceAccountKey.json ./config/serviceAccountKey.json

# 4. Start all services
docker compose up --build

# 5. API is live at http://localhost:8000/api/docs
```

Services started:
| Service   | Purpose                        | Port  |
|-----------|--------------------------------|-------|
| `api`     | FastAPI REST API               | 8000  |
| `worker`  | Celery task worker             | —     |
| `beat`    | Celery cron scheduler          | —     |
| `postgres`| Pipeline database              | 5432  |
| `redis`   | Message broker + queue         | 6379  |

---

## Local Development (no Docker)

```bash
# Python 3.11+ required
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium

# Environment
export DATABASE_URL=postgresql://pipeline:pipeline@localhost:5432/pipeline
export REDIS_URL=redis://localhost:6379/0
export FIREBASE_CREDENTIALS_PATH=./config/serviceAccountKey.json

# Start PostgreSQL + Redis (Docker for just the infra)
docker compose up postgres redis -d

# Initialise schema
python -c "from pipeline.db.database import create_tables; create_tables()"

# Start API
uvicorn pipeline.api.app:app --reload --port 8000

# Start worker (separate terminal)
celery -A pipeline.ingestion.tasks.celery_app worker --loglevel=info

# Start beat scheduler (separate terminal)
celery -A pipeline.ingestion.tasks.celery_app beat --loglevel=info
```

---

## Running Tests

```bash
# Unit tests only (no DB, no network required)
pytest tests/unit/ -v

# Integration tests (requires SQLite — no PostgreSQL needed)
pytest tests/integration/ -v

# All tests
pytest -v
```

Expected output:
```
tests/unit/test_parsing.py::TestParseGermanNumber::test_standard_format   PASSED
tests/unit/test_parsing.py::TestPDFParser::test_extract_revenue           PASSED
tests/unit/test_matching.py::TestNormaliseCompanyName::test_strips_gmbh   PASSED
tests/integration/test_ingestion.py::TestEntityResolver::test_new_company_created  PASSED
...
```

---

## Configuration

All configuration lives in `config/pipeline.yaml`.  
Override any value with environment variables:

```bash
PIPELINE__INGESTION__REDIS_URL=redis://my-redis:6379/0
PIPELINE__RETRIEVAL__MONTHLY_BUDGET_EUR=1000
PIPELINE__MATCHING__FUZZY_THRESHOLD=0.90
```

### Key configuration options

```yaml
# Which sources are active
data_sources:
  bundesanzeiger:          { enabled: true,  rate_limit_rps: 1.0 }
  unternehmensregister:    { enabled: true,  rate_limit_rps: 0.5 }
  handelsregister:         { enabled: true,  rate_limit_rps: 0.3, metadata_only: true }

# Paid document retrieval — trigger conditions
retrieval:
  trigger_rules:
    - { field: estimated_revenue_eur, operator: ">=", value: 5_000_000 }
    - { field: legal_form, operator: "in", value: ["GmbH", "AG"] }
  monthly_budget_eur: 500.0

# Entity resolution sensitivity
matching:
  fuzzy_threshold: 0.85    # lower = more liberal matching
```

---

## API Endpoints

Base URL: `http://localhost:8000/api/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/companies` | Search companies (q, legal_form, state, city, industry) |
| `GET` | `/companies/{id}` | Full company detail |
| `GET` | `/companies/{id}/ownership` | Ownership tree (up/down/both, depth) |
| `GET` | `/companies/{id}/directors` | Directors + optional network graph |
| `GET` | `/companies/{id}/filings` | Filing history |
| `POST` | `/companies/{id}/enrich` | Trigger on-demand enrichment |
| `GET` | `/directors?q=` | Search directors by name |
| `GET` | `/directors/{id}/companies` | All companies for a director |
| `GET` | `/filings` | Search filings (type, year, source) |
| `GET` | `/pipeline/status` | Queue depths + budget |
| `POST` | `/pipeline/search/trigger` | Kick off a connector fetch now |
| `POST` | `/pipeline/sync/firestore` | Sync all companies to Firestore |

Interactive docs: `http://localhost:8000/api/docs`

---

## Database Schema (new tables only)

```
canonical_companies   ← master deduplicated company records
company_sources       ← raw source entries per (company, source)
raw_ingestions        ← append-only ingestion log
filings               ← annual accounts and other filings
directors             ← deduplicated individuals
director_roles        ← director ↔ company M2M with time range
shareholders          ← raw shareholder data from filings
ownership_edges       ← directed graph: owner_company → owned_company
documents             ← cached filing PDFs + parsed output
retrieval_costs       ← per-document cost tracking
connector_state       ← last successful run per connector
change_log            ← append-only audit trail of detected changes
entity_mappings       ← source_entity_id → canonical_company_id
```

No existing tables are modified.

---

## Data Flow

```
1. SCHEDULED JOB (Celery Beat)
   └── run_connector(source="bundesanzeiger", job="new_filings")

2. CONNECTOR (BundesanzeigerConnector.fetch)
   ├── Rate-limited HTTP GET (max 1 req/s)
   ├── robots.txt checked
   ├── HTML parsed → list[RawRecord]
   └── push_to_queue() → Redis

3. WORKER (ingest_record task)
   ├── Parse raw_data → normalised dict
   ├── EntityResolver.resolve()
   │   ├── Exact registry match → canonical_id
   │   ├── Fuzzy name + address → canonical_id (if score ≥ 0.85)
   │   └── New entity → INSERT canonical_companies
   ├── Upsert company_sources + raw_ingestions
   ├── Trigger enrich_company task (async)
   └── Trigger sync_to_firestore task (async)

4. ENRICHMENT (enrich_company task)
   ├── DirectorGraph.build_for_company()
   ├── OwnershipTree.build_for_company()
   └── IndustryClassifier.classify_company()

5. SYNC (sync_to_firestore task)
   ├── Filter: only acquisition-grade companies
   └── FirestoreWriter.sync_company()
       ├── Set companies/{id} (merge)
       ├── Set companies/{id}/pipeline_filings/{filing_id}
       └── Set companies/{id}/pipeline_directors/{role_id}

6. CHANGE DETECTION (detect_changes task, every 6h)
   ├── Compare latest source data vs canonical state
   ├── Emit ChangeLog rows for each change
   └── Alert on: insolvency, liquidation, director_removed
```

---

## Legal Compliance Notes

| Source | Legal Basis | Our Approach |
|--------|-------------|--------------|
| Bundesanzeiger | HGB §325 — mandatory public disclosure | Public search endpoint, 1 req/s, no login |
| Unternehmensregister | HGB §9 — public inspection right | Public fulltext search, 0.5 req/s |
| Handelsregister | §9 HGB — public inspection right | **Metadata-only point lookups**, 0.3 req/s |

All connectors:
- Respect `robots.txt`
- Identify via User-Agent header
- Never bypass CAPTCHAs (human verification is never automated)
- Never bulk-enumerate registry numbers
- Never use authenticated scraping sessions

---

## Cost Model

| Operation | Cost | Notes |
|-----------|------|-------|
| Basic search (list only) | Free | Bundesanzeiger / UR public search |
| Document download | €1–3/doc | Only for companies passing trigger rules |
| LLM extraction fallback | ~€0.01/doc | Optional, only for scanned PDFs |

Monthly budget cap: configurable in `pipeline.yaml` (default €500).  
The `CostTracker` hard-blocks fetches once budget is exhausted.

---

## Extending the Pipeline

### Add a new data source

1. Create `connectors/my_source.py` inheriting `BaseConnector`
2. Implement `async def fetch(...)` → `list[RawRecord]`
3. Add to `connector_map` in `ingestion/tasks.py`
4. Add config section to `pipeline.yaml`

### Add a new enrichment step

1. Create `enrichment/my_enricher.py`
2. Call it from `enrich_company` task in `ingestion/tasks.py`

### Add a new API endpoint

1. Create `api/routes/my_endpoint.py`
2. Register router in `api/app.py`

All additions are isolated — nothing existing needs to change.

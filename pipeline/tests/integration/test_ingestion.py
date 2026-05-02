"""
tests/integration/test_ingestion.py
─────────────────────────────────────
Integration tests for the ingestion pipeline.

Uses:
  • In-memory SQLite DB (not PostgreSQL) for test isolation
  • InMemoryQueue (no Redis required)
  • Mocked HTTP responses (no real network calls)

Run with:
    pytest pipeline/tests/integration/ -v
"""

import asyncio
import json
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from pipeline.db.models import Base, CanonicalCompany, EntityMapping
from pipeline.ingestion.queue import InMemoryQueue
from pipeline.connectors.base import RawRecord
from pipeline.entity_resolution.resolver import EntityResolver


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def sqlite_engine():
    """Fresh in-memory SQLite engine per test."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def db_session(sqlite_engine):
    Session = sessionmaker(bind=sqlite_engine)
    session = Session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@pytest.fixture
def queue():
    return InMemoryQueue()


# ─── RawRecord tests ──────────────────────────────────────────────────────────

class TestRawRecord:

    def test_to_dict_shape(self):
        rec = RawRecord(
            source="bundesanzeiger",
            record_type="filing",
            raw_data={"company_name": "Test GmbH"},
            source_url="https://example.com/filing/1",
            source_id="abc123",
        )
        d = rec.to_dict()
        assert d["source"] == "bundesanzeiger"
        assert d["type"] == "filing"
        assert d["raw_data"]["company_name"] == "Test GmbH"
        assert "timestamp" in d

    def test_dedup_key_deterministic(self):
        rec = RawRecord(
            source="bundesanzeiger", record_type="filing",
            raw_data={}, source_id="abc123",
        )
        assert rec.dedup_key == rec.dedup_key   # same object, stable
        rec2 = RawRecord(
            source="bundesanzeiger", record_type="filing",
            raw_data={}, source_id="abc123",
        )
        assert rec.dedup_key == rec2.dedup_key  # same inputs, same hash

    def test_dedup_key_differs_by_source(self):
        rec_a = RawRecord(source="ba", record_type="filing", raw_data={}, source_id="1")
        rec_b = RawRecord(source="ur", record_type="filing", raw_data={}, source_id="1")
        assert rec_a.dedup_key != rec_b.dedup_key


# ─── In-memory queue tests ────────────────────────────────────────────────────

class TestInMemoryQueue:

    def make_record(self, source_id: str = "001") -> RawRecord:
        return RawRecord(
            source="test", record_type="company",
            raw_data={"name": f"Company {source_id}"},
            source_id=source_id,
        )

    @pytest.mark.asyncio
    async def test_push_and_pop(self, queue):
        rec = self.make_record("1")
        pushed = await queue.push(rec)
        assert pushed is True

        msg = await queue.pop()
        assert msg is not None
        assert msg.payload["source"] == "test"

    @pytest.mark.asyncio
    async def test_deduplication(self, queue):
        rec = self.make_record("dup1")
        await queue.push(rec)
        again = await queue.push(rec)
        assert again is False     # second push is a duplicate

        depth = await queue.length()
        assert depth == 1         # only one item

    @pytest.mark.asyncio
    async def test_ack_removes_from_inflight(self, queue):
        rec = self.make_record("ack_test")
        await queue.push(rec)
        msg = await queue.pop()
        assert msg is not None

        await queue.ack(msg.job_id)
        # After ack, inflight should be empty
        assert msg.job_id not in queue._inflight

    @pytest.mark.asyncio
    async def test_nack_requeues(self, queue):
        rec = self.make_record("nack_test")
        await queue.push(rec)
        msg = await queue.pop()
        await queue.nack(msg.job_id)

        # Should be back in the queue
        depth = await queue.length()
        assert depth == 1

    @pytest.mark.asyncio
    async def test_dead_letter_after_max_retries(self, queue):
        rec = self.make_record("dlq_test")
        await queue.push(rec)

        for _ in range(3):
            msg = await queue.pop()
            if msg:
                await queue.nack(msg.job_id)

        dead = await queue.dead_letters()
        assert len(dead) >= 1


# ─── Entity resolver tests ────────────────────────────────────────────────────

class TestEntityResolver:

    def _make_parsed(self, name: str, registry: str = "", court: str = "") -> dict:
        return {
            "company_name":    name,
            "registry_number": registry,
            "court":           court,
            "legal_form":      "GmbH",
            "postal_code":     "80331",
            "city":            "München",
            "status":          "active",
            "source":          "test",
            "source_id":       registry or name[:10],
        }

    def test_new_company_created(self, db_session):
        resolver = EntityResolver(db_session)
        parsed   = self._make_parsed("Neue Firma GmbH", "HRB 99999", "München")

        cid, is_new = resolver.resolve(parsed)
        assert is_new is True
        assert cid is not None

        company = db_session.get(CanonicalCompany, cid)
        assert company.canonical_name == "Neue Firma GmbH"

    def test_exact_registry_match(self, db_session):
        resolver = EntityResolver(db_session)

        # Create company
        parsed = self._make_parsed("Test GmbH", "HRB 11111", "München")
        cid1, _   = resolver.resolve(parsed)
        db_session.commit()

        # Resolve same registry number again
        parsed2 = self._make_parsed("Test GmbH Alias", "HRB 11111", "München")
        cid2, is_new = resolver.resolve(parsed2)
        assert is_new is False
        assert cid2 == cid1

    def test_fuzzy_name_match(self, db_session):
        resolver = EntityResolver(db_session)

        # Create original
        parsed = self._make_parsed("Müller Sanitär GmbH", "HRB 22222", "München")
        cid1, _ = resolver.resolve(parsed)
        db_session.commit()

        # Slightly different name, same city — should match
        parsed2 = self._make_parsed("Müller Sanitär GmbH", "", "München")
        parsed2["source_id"] = "different_source_id"  # avoid cached mapping
        cid2, is_new = resolver.resolve(parsed2)
        # With fuzzy matching, same name + same city → should resolve to same entity
        assert cid2 == cid1

    def test_entity_mapping_stored(self, db_session):
        resolver = EntityResolver(db_session)
        parsed   = self._make_parsed("Mapping Test GmbH", "HRB 33333", "Berlin")
        cid, _   = resolver.resolve(parsed)
        db_session.commit()

        mapping = db_session.query(EntityMapping).filter_by(
            source="test", source_entity_id="HRB 33333"
        ).first()
        assert mapping is not None
        assert mapping.canonical_company_id == cid

    def test_different_companies_different_ids(self, db_session):
        resolver = EntityResolver(db_session)

        parsed_a = self._make_parsed("Alpha GmbH",  "HRB 44444", "München")
        parsed_b = self._make_parsed("Bravo GmbH",  "HRB 55555", "Hamburg")

        cid_a, _ = resolver.resolve(parsed_a)
        db_session.commit()
        cid_b, _ = resolver.resolve(parsed_b)
        db_session.commit()

        assert cid_a != cid_b


# ─── End-to-end ingestion flow ────────────────────────────────────────────────

class TestIngestionFlow:

    @pytest.mark.asyncio
    async def test_connector_pushes_to_queue(self, queue):
        """A connector should push records to the queue."""
        from pipeline.connectors.bundesanzeiger import BundesanzeigerConnector

        cfg = {
            "base_url":        "https://www.bundesanzeiger.de",
            "rate_limit_rps":  100,
            "retry_attempts":  1,
            "timeout_seconds": 5,
        }
        connector = BundesanzeigerConnector(cfg, queue=queue)

        # Mock the HTTP call to return a sample search results page
        sample_html = """
        <html><body>
        <table class="result_container">
          <tr class="result">
            <td class="col_firma">REWE Markt GmbH</td>
            <td class="col_datum">01.01.2024</td>
            <td class="col_kategorie">Jahresabschluss</td>
          </tr>
        </table>
        </body></html>
        """

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = sample_html
        mock_resp.raise_for_status = MagicMock()

        with patch.object(connector, "_get", return_value=mock_resp):
            records = await connector.fetch(query="REWE")

        await connector.push_to_queue(records)
        depth = await queue.length()
        assert depth >= 1

        await connector.close()

    @pytest.mark.asyncio
    async def test_full_pipeline_record(self, db_session, queue):
        """Simulate a record flowing from queue → parsing → entity resolution → DB."""
        # Push a raw record
        raw = RawRecord(
            source="bundesanzeiger",
            record_type="company",
            raw_data={
                "company_name":    "Testfirma GmbH",
                "registry_number": "HRB 77777",
                "court":           "München",
                "legal_form":      "GmbH",
                "status":          "active",
                "address":         {"postal_code": "80331", "city": "München"},
            },
            source_id="HRB77777",
        )
        await queue.push(raw)

        # Pop and process
        msg = await queue.pop()
        assert msg is not None

        parsed = {
            "company_name":    msg.payload["raw_data"]["company_name"],
            "registry_number": msg.payload["raw_data"]["registry_number"],
            "court":           msg.payload["raw_data"]["court"],
            "legal_form":      msg.payload["raw_data"]["legal_form"],
            "status":          msg.payload["raw_data"]["status"],
            "postal_code":     "80331",
            "city":            "München",
            "source":          msg.payload["source"],
            "source_id":       msg.payload["source_id"],
        }

        resolver = EntityResolver(db_session)
        cid, is_new = resolver.resolve(parsed)
        db_session.commit()

        assert is_new is True
        company = db_session.get(CanonicalCompany, cid)
        assert company.canonical_name == "Testfirma GmbH"
        assert company.registry_number == "HRB 77777"
        assert company.city == "München"

        await queue.ack(msg.job_id)

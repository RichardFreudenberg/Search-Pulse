"""
tests/unit/test_matching.py
─────────────────────────────
Unit tests for entity resolution matchers.
Pure functions — no I/O or DB required.
"""

import pytest
from pipeline.entity_resolution.matchers import (
    normalise_company_name,
    registry_key,
    fuzzy_score,
    address_score,
    director_overlap_score,
    top_n_candidates,
)


class TestNormaliseCompanyName:

    def test_strips_gmbh(self):
        assert normalise_company_name("Müller GmbH") == "muller"

    def test_strips_gmbh_co_kg(self):
        assert normalise_company_name("ACME GmbH & Co. KG") == "acme"

    def test_strips_ag(self):
        assert normalise_company_name("Bayer AG") == "bayer"

    def test_strips_ug(self):
        assert normalise_company_name("TechStart UG") == "techstart"

    def test_strips_ek(self):
        assert normalise_company_name("Hans Müller e.K.") == "hans muller"

    def test_sorts_tokens(self):
        a = normalise_company_name("Söhne und Müller GmbH")
        b = normalise_company_name("Müller und Söhne GmbH")
        assert a == b

    def test_umlaut_normalisation(self):
        a = normalise_company_name("Bäckerei Öz GmbH")
        assert "ae" in a and "oe" in a

    def test_empty_string(self):
        assert normalise_company_name("") == ""

    def test_none_like_empty(self):
        assert normalise_company_name("  ") == ""

    def test_punctuation_removed(self):
        name = normalise_company_name("Hans-Peter Müller GmbH")
        assert " " in name or "hans" in name

    def test_case_insensitive(self):
        assert normalise_company_name("ACME GMBH") == normalise_company_name("acme GmbH")


class TestRegistryKey:

    def test_normalises_spacing(self):
        assert registry_key("HRB  12345 ") == "HRB12345"

    def test_uppercase(self):
        assert registry_key("hrb12345") == "HRB12345"

    def test_hra_type(self):
        assert registry_key("HRA 999") == "HRA999"

    def test_with_court_text_ignored(self):
        # The function should find the registry number even in longer text
        assert "HRB" in registry_key("HRB 12345 Amtsgericht München")


class TestFuzzyScore:

    def test_identical_returns_one(self):
        assert fuzzy_score("acme", "acme") == 1.0

    def test_empty_returns_zero(self):
        assert fuzzy_score("", "acme") == 0.0
        assert fuzzy_score("acme", "") == 0.0

    def test_very_similar(self):
        a = normalise_company_name("Müller Bau GmbH")
        b = normalise_company_name("Mueller Bau GmbH")
        score = fuzzy_score(a, b)
        assert score >= 0.80, f"Expected ≥0.80, got {score}"

    def test_different_names_low_score(self):
        a = normalise_company_name("ABC Technik GmbH")
        b = normalise_company_name("XYZ Bäckerei GmbH")
        score = fuzzy_score(a, b)
        assert score < 0.60, f"Expected <0.60, got {score}"

    def test_partial_overlap(self):
        a = "bau"
        b = "bauunternehmen"
        score = fuzzy_score(a, b)
        # Should be a moderate score, not 0
        assert score > 0.30


class TestAddressScore:

    def test_exact_postal_code(self):
        a = {"postal_code": "80331", "city": "München"}
        b = {"postal_code": "80331", "city": "Muenchen"}
        score = address_score(a, b)
        assert score >= 0.8

    def test_different_postal_code(self):
        a = {"postal_code": "80331", "city": "München"}
        b = {"postal_code": "10115", "city": "Berlin"}
        score = address_score(a, b)
        assert score < 0.3

    def test_empty_addresses(self):
        assert address_score({}, {}) == 0.0

    def test_partial_match_prefix(self):
        # Same first 3 digits = partial match
        a = {"postal_code": "80331"}
        b = {"postal_code": "80333"}
        score = address_score(a, b)
        assert 0.0 < score < 1.0


class TestDirectorOverlap:

    def test_full_overlap(self):
        a = ["Hans Müller", "Maria Schmidt"]
        b = ["Hans Müller", "Maria Schmidt"]
        assert director_overlap_score(a, b) == 1.0

    def test_partial_overlap(self):
        a = ["Hans Müller", "Maria Schmidt"]
        b = ["Hans Müller", "Klaus Weber"]
        score = director_overlap_score(a, b)
        assert 0.4 < score < 0.7

    def test_no_overlap(self):
        a = ["Hans Müller"]
        b = ["Klaus Weber"]
        score = director_overlap_score(a, b)
        assert score < 0.3

    def test_empty_lists_return_zero(self):
        assert director_overlap_score([], ["Hans"]) == 0.0
        assert director_overlap_score(["Hans"], []) == 0.0


class TestTopNCandidates:

    def test_returns_best_matches(self):
        candidates = [
            ("id1", "muller bau"),
            ("id2", "schmidt tech"),
            ("id3", "mueller bau"),
        ]
        results = top_n_candidates("muller bau", candidates, n=2, threshold=0.5)
        ids = [r[0] for r in results]
        assert "id1" in ids

    def test_empty_candidates(self):
        results = top_n_candidates("muller", [], n=5, threshold=0.5)
        assert results == []

    def test_threshold_filters_weak_matches(self):
        candidates = [("id1", "xyz completely different")]
        results = top_n_candidates("muller bau", candidates, n=5, threshold=0.9)
        assert results == []

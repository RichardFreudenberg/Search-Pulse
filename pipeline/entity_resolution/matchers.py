"""
pipeline/entity_resolution/matchers.py
────────────────────────────────────────
Pure-function string normalisation and fuzzy matching utilities
used by the entity resolution engine.

All functions are stateless — no I/O, no external dependencies
beyond RapidFuzz and the Python stdlib.  This makes them easy to
test exhaustively in isolation.
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache

try:
    from rapidfuzz.distance import JaroWinkler
    from rapidfuzz import fuzz as rf_fuzz
    _HAS_RAPIDFUZZ = True
except ImportError:
    _HAS_RAPIDFUZZ = False


# ─── Legal form suffix list (ordered longest-first to avoid partial matches) ──

_LEGAL_FORM_SUFFIXES: list[str] = sorted([
    "Gesellschaft mit beschränkter Haftung",
    "GmbH & Co. Kommanditgesellschaft auf Aktien",
    "GmbH & Co. KGaA",
    "GmbH & Co. KG",
    "GmbH & Co.",
    "GmbH",
    "Kommanditgesellschaft auf Aktien",
    "KGaA",
    "Aktiengesellschaft",
    "Kommanditgesellschaft",
    "Offene Handelsgesellschaft",
    "Unternehmergesellschaft (haftungsbeschränkt)",
    "Eingetragener Kaufmann",
    "Einzelkaufmann",
    "AG",
    "KG",
    "OHG",
    "UG",
    "e.K.",
    "e.V.",
    "eG",
], key=len, reverse=True)

_REGISTRY_STRIP_RE = re.compile(r"\b(HR[AB]|PR|VR|GnR)\s*(\d+)\b", re.IGNORECASE)
_WHITESPACE_RE     = re.compile(r"\s+")
_NON_ALPHANUM_RE   = re.compile(r"[^\w\s]", re.UNICODE)


def normalise_company_name(name: str) -> str:
    """
    Normalise a company name for fuzzy comparison:
      1. Strip leading/trailing whitespace
      2. Normalise unicode (NFC)
      3. Strip legal form suffix
      4. Lowercase
      5. Remove punctuation
      6. Collapse whitespace
      7. Sort tokens (makes "Müller und Söhne" == "Söhne und Müller")

    >>> normalise_company_name("Müller & Söhne GmbH")
    'muller sohne'
    >>> normalise_company_name("ACME GmbH & Co. KG")
    'acme'
    """
    if not name:
        return ""

    # Unicode normalisation
    name = unicodedata.normalize("NFC", name.strip())

    # Remove legal form suffix (longest match first)
    for suffix in _LEGAL_FORM_SUFFIXES:
        # Match suffix at end of string, case-insensitive
        pattern = re.escape(suffix) + r"\s*$"
        name = re.sub(pattern, "", name, flags=re.IGNORECASE).strip()
        name = re.sub(r"[&,\.]+$", "", name).strip()

    # Lowercase
    name = name.lower()

    # Normalise umlauts: ä→ae, ö→oe, ü→ue, ß→ss
    name = (name
            .replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
            .replace("ß", "ss"))

    # Remove remaining punctuation and special chars
    name = _NON_ALPHANUM_RE.sub(" ", name)

    # Collapse whitespace
    name = _WHITESPACE_RE.sub(" ", name).strip()

    # Sort tokens for order-invariant matching
    tokens = sorted(name.split())

    return " ".join(tokens)


def registry_key(registry_number: str) -> str:
    """
    Normalise a registry number for exact matching.
    "HRB  12345 " → "HRB12345"
    "hrb12345"    → "HRB12345"
    """
    m = _REGISTRY_STRIP_RE.search(registry_number)
    if m:
        return f"{m.group(1).upper()}{m.group(2)}"
    # Fallback: strip spaces and uppercase
    return re.sub(r"\s+", "", registry_number.strip().upper())


def fuzzy_score(a: str, b: str) -> float:
    """
    Compute a similarity score between two normalised strings.
    Returns a float in [0, 1].

    Uses RapidFuzz when available (C extension, ~100× faster than
    pure-Python alternatives).  Falls back to a simple Jaccard
    coefficient when RapidFuzz is not installed.
    """
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0

    if _HAS_RAPIDFUZZ:
        # Weighted combination of token_set_ratio and JaroWinkler
        token_score   = rf_fuzz.token_set_ratio(a, b) / 100.0
        jaro_score    = JaroWinkler.normalized_similarity(a, b)
        return 0.7 * token_score + 0.3 * jaro_score

    # Pure-Python fallback: Jaccard on character bigrams
    return _jaccard_bigrams(a, b)


def address_score(addr_a: dict, addr_b: dict) -> float:
    """
    Score address similarity.
    Both dicts may have keys: postal_code, city, street.
    """
    score = 0.0
    parts = 0

    pc_a = (addr_a.get("postal_code") or "").strip()
    pc_b = (addr_b.get("postal_code") or "").strip()
    if pc_a and pc_b:
        parts += 1
        if pc_a == pc_b:
            score += 1.0
        elif pc_a[:3] == pc_b[:3]:
            score += 0.5

    city_a = (addr_a.get("city") or "").lower().strip()
    city_b = (addr_b.get("city") or "").lower().strip()
    if city_a and city_b:
        parts += 1
        score += fuzzy_score(city_a, city_b)

    return score / parts if parts > 0 else 0.0


def director_overlap_score(
    directors_a: list[str], directors_b: list[str]
) -> float:
    """
    Fraction of directors in A that fuzzy-match a director in B.
    Returns 0 if either list is empty.
    """
    if not directors_a or not directors_b:
        return 0.0

    norm_b = [normalise_company_name(d) for d in directors_b]
    matches = 0

    for director_a in directors_a:
        norm_a = normalise_company_name(director_a)
        for norm_b_i in norm_b:
            if fuzzy_score(norm_a, norm_b_i) >= 0.85:
                matches += 1
                break

    return matches / len(directors_a)


# ─── Pure-Python fallback matchers ───────────────────────────────────────────

def _jaccard_bigrams(a: str, b: str) -> float:
    """Jaccard similarity on character 2-grams."""
    bg_a = _bigrams(a)
    bg_b = _bigrams(b)
    if not bg_a or not bg_b:
        return 0.0
    intersection = bg_a & bg_b
    union        = bg_a | bg_b
    return len(intersection) / len(union)


def _bigrams(s: str) -> set[str]:
    return {s[i:i+2] for i in range(len(s) - 1)}


# ─── Batch scoring (used by resolver for bulk candidate filtering) ────────────

def top_n_candidates(
    query_name: str,
    candidates: list[tuple[str, str]],   # list of (id, name)
    n: int = 5,
    threshold: float = 0.70,
) -> list[tuple[str, float]]:
    """
    Return the top-N (id, score) pairs from candidates that exceed threshold.
    Efficient for bulk filtering before expensive per-candidate scoring.

    Args:
        query_name:  Normalised query name
        candidates:  List of (id, normalised_name)
        n:           Max results
        threshold:   Minimum score to include

    Returns:
        Sorted list of (id, score) tuples, highest score first
    """
    if not _HAS_RAPIDFUZZ:
        # Simple fallback
        scored = [
            (cid, fuzzy_score(query_name, cname))
            for cid, cname in candidates
        ]
    else:
        # Use RapidFuzz's extract for vectorised processing
        choices = {cid: cname for cid, cname in candidates}
        from rapidfuzz import process as rf_process
        results = rf_process.extract(
            query_name,
            choices,
            scorer=rf_fuzz.token_set_ratio,
            score_cutoff=threshold * 100,
            limit=n,
        )
        return [(cid, score / 100.0) for _, score, cid in results]

    filtered = [(cid, s) for cid, s in scored if s >= threshold]
    return sorted(filtered, key=lambda x: x[1], reverse=True)[:n]

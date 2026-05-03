"""
pipeline/connectors/industry_classifier.py
──────────────────────────────────────────
Keyword-based industry classifier for German company names.
No external dependencies or AI API required — runs in-process.

Returns one of the canonical industry strings used by company-scout.js
so the frontend dropdown works without any translation layer.
"""
from __future__ import annotations
import re

# Rules are ordered from most specific to most generic.
# Each entry: (industry_label, [keyword_fragments])
# Short generic fragments (e.g. "bau", "it") use word-boundary matching
# via _wb(); longer specific ones use substring matching.
_RULES: list[tuple[str, list[str]]] = [
    ("Technology", [
        "software", "it-dienst", "informatik", "edv", "netzwerk",
        "digital", "cyber", "cloud", "saas", "iot",
        "automatisierung", "robotik", "künstliche intelligenz",
        "data", "webentwicklung", "app-entwicklung",
    ]),
    ("Industrial", [
        "maschinenbau", "maschinen", "metallbau", "stahlbau",
        "werkzeugbau", "anlagenbau", "apparatebau", "feinmechanik",
        "hydraulik", "pneumatik", "antriebstechnik", "fertigung",
        "produktion", "automotive", "fahrzeugbau", "industrietechnik",
    ]),
    ("Construction / Trades", [
        "bauunternehmen", "baugesellschaft", "bautechnik", "bauservice",
        "tiefbau", "hochbau", "sanitärtechnik", "elektrotechnik",
        "heizungsbau", "klimatechnik", "gebäudetechnik", "dachdeckerei",
        "malerbetrieb", "fliesenleger", "zimmerei", "gerüstbau",
        "innenausbau", "trockenbau", "sanierung",
    ]),
    ("Distribution", [
        "logistik", "spedition", "fulfillment",
        "großhandel", "distribution", "kurierdienst",
        "lieferdienst", "frachtlogistik", "lagerlogistik",
    ]),
    ("Healthcare Services", [
        "medizintechnik", "arztpraxis", "zahnarzt", "physiotherapie",
        "ergotherapie", "logopädie", "krankenhaus", "pflegeheim",
        "ambulanter pflegedienst", "gesundheitszentrum", "apotheke",
        "sanitätshaus", "rehazentrum", "labortechnik",
    ]),
    ("Food & Beverage", [
        "bäckerei", "bäckermeister", "metzgerei", "fleischerei",
        "restaurant", "gastronomie", "catering", "lebensmittel",
        "getränkehandel", "brauerei", "konditorei", "feinkost",
        "food", "ernährung",
    ]),
    ("Financial Services", [
        "steuerberatung", "wirtschaftsprüfung", "buchführung",
        "buchhaltungsservice", "finanzberatung", "versicherungsmakler",
        "kapitalverwaltung", "vermögensverwaltung", "leasing",
        "factoring", "fondsmanagement",
    ]),
    ("Real Estate", [
        "immobilien", "grundstücksverwaltung", "hausverwaltung",
        "wohnbaugesellschaft", "facility management", "gebäudeverwaltung",
        "immobilienmakler",
    ]),
    ("Business Services", [
        "unternehmensberatung", "personalberatung", "zeitarbeit",
        "werbeagentur", "marketingagentur", "kommunikationsagentur",
        "druckerei", "übersetzungsbüro", "rechtsanwaltskanzlei",
        "notariat", "sicherheitsdienst", "reinigungsunternehmen",
    ]),
    ("Education", [
        "privatschule", "bildungszentrum", "fahrschule", "sprachschule",
        "weiterbildungsakademie", "nachhilfeinstitut", "kindertagesstätte",
        "kindergarten", "ausbildungszentrum",
    ]),
    ("Consumer", [
        "einzelhandel", "modeboutique", "textilhandel", "spielwarenhandel",
        "sportartikel", "möbelhaus", "einrichtungshaus", "kosmetikstudio",
        "friseursalon", "optiker", "juwelier",
    ]),
    ("Media & Printing", [
        "druckhaus", "verlagshaus", "filmproduktion", "fotoatelier",
        "grafikdesign", "werbedruckerei", "medienagentur",
    ]),
    ("Energy & Environment", [
        "energietechnik", "solaranlagen", "windkraftanlagen",
        "entsorgungsbetrieb", "recyclingunternehmen", "umwelttechnik",
        "abfallentsorgung", "wasserversorgung", "wärmeversorgung",
        "photovoltaik",
    ]),
]

# Short generic words that need word-boundary matching to avoid false positives
# e.g. "bau" inside "BAUER" should not match Construction
_WB_KEYWORDS: list[tuple[str, str]] = [
    (r"\bbau\b",        "Construction / Trades"),
    (r"\b it \b",       "Technology"),
    (r"\bhandel\b",     "Distribution"),
    (r"\btransport\b",  "Distribution"),
    (r"\bmedizin\b",    "Healthcare Services"),
    (r"\bpflege\b",     "Healthcare Services"),
    (r"\benergie\b",    "Energy & Environment"),
    (r"\bmedien\b",     "Media & Printing"),
    (r"\bimmobilien\b", "Real Estate"),
    (r"\bfinanz\b",     "Financial Services"),
]


def classify_industry(name: str, purpose: str = "") -> str:
    """
    Classify a German company name + optional business purpose string
    into one of ~13 canonical industry labels.

    Args:
        name:    Company name (e.g. "Müller Maschinenbau GmbH")
        purpose: Business purpose from Handelsregister (optional)

    Returns:
        Industry label string, or "Other" if no match.
    """
    text = f" {name} {purpose} ".lower()

    # 1. Substring rules (longer, specific keywords — no false-positive risk)
    for industry, keywords in _RULES:
        if any(kw in text for kw in keywords):
            return industry

    # 2. Word-boundary rules (short generic terms)
    for pattern, industry in _WB_KEYWORDS:
        if re.search(pattern, text):
            return industry

    return "Other"

"""
tests/unit/test_parsing.py
───────────────────────────
Unit tests for PDF and HTML parsers.
No I/O, no DB, no network — all inputs are inline fixtures.
"""

import pytest
from pipeline.parsing.pdf_parser import PDFParser, _parse_german_number
from pipeline.parsing.html_parser import HTMLParser


# ─── German number parser ─────────────────────────────────────────────────────

class TestParseGermanNumber:

    def test_standard_format(self):
        assert _parse_german_number("1.234.567,89") == 1234567.89

    def test_integer(self):
        assert _parse_german_number("42.000") == 42000.0

    def test_no_thousands(self):
        assert _parse_german_number("500,00") == 500.0

    def test_teur_label(self):
        # "TEUR" values: 1.500 TEUR = 1500 * 1000 = 1_500_000
        val = _parse_german_number("1.500 TEUR")
        assert val == 1_500_000.0

    def test_invalid_returns_none(self):
        assert _parse_german_number("n/a") is None

    def test_empty_returns_none(self):
        assert _parse_german_number("") is None

    def test_whitespace_stripped(self):
        assert _parse_german_number("  999,00  ") == 999.0


# ─── PDF parser ───────────────────────────────────────────────────────────────

class TestPDFParser:

    def setup_method(self):
        self.parser = PDFParser()

    def test_extract_registry_number(self):
        text = "Registernummer: HRB 12345 beim Amtsgericht München"
        result = self.parser._extract_fields(text, "test.pdf")
        assert result["registry_number"] == "HRB 12345"

    def test_extract_revenue(self):
        text = "Umsatzerlöse: 5.234.000,00\nJahresüberschuss: 234.000,00"
        result = self.parser._extract_fields(text, "test.pdf")
        assert result["revenue"] == 5234000.0

    def test_extract_net_profit(self):
        text = "Jahresüberschuss 123.456,00 EUR"
        result = self.parser._extract_fields(text, "test.pdf")
        assert result["net_profit"] == 123456.0

    def test_extract_employees(self):
        text = "durchschnittlich 47 Arbeitnehmer"
        result = self.parser._extract_fields(text, "test.pdf")
        assert result["employees"] == 47

    def test_extract_fiscal_year(self):
        text = "Jahresabschluss für das Geschäftsjahr 2023"
        result = self.parser._extract_fields(text, "test.pdf")
        assert result["fiscal_year"] == 2023

    def test_extract_directors(self):
        text = "Geschäftsführer: Hans Müller, Maria Schmidt\nOrt: München"
        result = self.parser._extract_fields(text, "test.pdf")
        assert len(result.get("directors", [])) >= 1
        names = [d["name"] for d in result["directors"]]
        assert any("Müller" in n or "Hans" in n for n in names)

    def test_extract_purpose(self):
        text = "Unternehmensgegenstand: Handel mit Sanitärprodukten und verwandten Artikeln.\n\nSonstiges"
        result = self.parser._extract_fields(text, "test.pdf")
        assert "Sanitär" in result.get("business_purpose", "")

    def test_no_text_returns_error(self):
        result = self.parser.parse_bytes(b"", "empty.pdf")
        assert "_error" in result or result == {}

    def test_hash_present(self):
        text = "Umsatzerlöse: 100.000,00"
        result = self.parser._extract_fields(text, "test.pdf")
        assert "page_hash" in result


# ─── HTML parser ─────────────────────────────────────────────────────────────

class TestHTMLParser:

    def setup_method(self):
        self.parser = HTMLParser()

    def test_german_date(self):
        assert self.parser._german_date("15.03.2024") == "2024-03-15"

    def test_german_date_passthrough(self):
        assert self.parser._german_date("2024-03-15") == "2024-03-15"

    def test_registry_number_extraction(self):
        text = "Amtsgericht München HRB 99887"
        assert self.parser._registry_number(text) == "HRB 99887"

    def test_court_name_extraction(self):
        text = "Amtsgericht Düsseldorf, eingetragen"
        assert "Düsseldorf" in self.parser._court_name(text)

    def test_legal_form_gmbh(self):
        assert self.parser._legal_form("Müller GmbH") == "GmbH"

    def test_legal_form_gmbh_co_kg(self):
        assert self.parser._legal_form("Müller GmbH & Co. KG") == "GmbH & Co. KG"

    def test_legal_form_ag(self):
        assert self.parser._legal_form("Bayer AG") == "AG"

    def test_address_extraction(self):
        text = "Sitz: 80331 München, Maximilianstr. 1"
        addr = self.parser._extract_address(text)
        assert addr.get("postal_code") == "80331"
        assert "München" in addr.get("city", "")

    def test_status_active(self):
        assert self.parser._normalise_status("aktiv eingetragen") == "active"

    def test_status_dissolved(self):
        assert self.parser._normalise_status("gelöscht") == "dissolved"

    def test_ba_search_page_empty(self):
        """Empty page returns empty list without error."""
        result = self.parser.parse("<html><body></body></html>", "bundesanzeiger")
        assert result == []

    def test_ba_search_page_with_rows(self):
        html = """
        <html><body>
        <table class="result_container">
          <tr class="result">
            <td class="col_firma"><strong>ACME GmbH</strong></td>
            <td class="col_datum">01.01.2024</td>
            <td class="col_kategorie">Jahresabschluss</td>
          </tr>
        </table>
        </body></html>
        """
        result = self.parser.parse(html, "bundesanzeiger")
        assert len(result) == 1
        assert result[0]["company_name"] == "ACME GmbH"
        assert result[0]["pub_date"] == "2024-01-01"

    def test_ur_search_page(self):
        html = """
        <html><body>
        <table class="result_list">
          <tr class="row_data">
            <td class="col-name"><a class="result_link" href="/detail/123">Muster GmbH</a></td>
            <td class="col-regnr">HRB 54321</td>
            <td class="col-court">Amtsgericht Frankfurt am Main</td>
          </tr>
        </table>
        </body></html>
        """
        result = self.parser.parse(html, "unternehmensregister")
        assert len(result) == 1
        assert result[0]["company_name"] == "Muster GmbH"
        assert result[0]["registry_number"] == "HRB 54321"

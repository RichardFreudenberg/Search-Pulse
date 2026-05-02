"""Shared pytest configuration and fixtures."""
import pytest


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "asyncio: mark test as async"
    )


@pytest.fixture(scope="session")
def sample_filing_text():
    from pathlib import Path
    return (Path(__file__).parent / "fixtures" / "sample_filing.txt").read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def sample_ba_html():
    from pathlib import Path
    return (Path(__file__).parent / "fixtures" / "sample_ba_page.html").read_text(encoding="utf-8")

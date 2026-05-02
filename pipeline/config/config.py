"""
pipeline/config/config.py
─────────────────────────
Loads pipeline.yaml and merges environment-variable overrides.

Env-var pattern:  PIPELINE__<SECTION>__<KEY>=value
Example:          PIPELINE__DATABASE__URL=postgresql://...
                  PIPELINE__INGESTION__REDIS_URL=redis://redis:6379/0
"""

from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

_CONFIG_PATH = Path(__file__).parent / "pipeline.yaml"
_ENV_PREFIX = "PIPELINE__"


def _resolve_env_refs(value: Any) -> Any:
    """Expand ${VAR:-default} shell-style references in string values."""
    if not isinstance(value, str):
        return value
    pattern = re.compile(r"\$\{([^}]+)\}")

    def _sub(match: re.Match) -> str:
        spec = match.group(1)
        if ":-" in spec:
            var, default = spec.split(":-", 1)
            return os.environ.get(var.strip(), default)
        return os.environ.get(spec.strip(), match.group(0))

    return pattern.sub(_sub, value)


def _walk_resolve(obj: Any) -> Any:
    """Recursively resolve env refs in a nested dict/list."""
    if isinstance(obj, dict):
        return {k: _walk_resolve(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_walk_resolve(v) for v in obj]
    return _resolve_env_refs(obj)


def _apply_env_overrides(cfg: dict) -> dict:
    """
    Walk PIPELINE__* env vars and overwrite the matching config path.
    PIPELINE__INGESTION__REDIS_URL → cfg['ingestion']['redis_url']
    """
    for key, val in os.environ.items():
        if not key.startswith(_ENV_PREFIX):
            continue
        parts = key[len(_ENV_PREFIX):].lower().split("__")
        node = cfg
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = val
    return cfg


@lru_cache(maxsize=1)
def load_config(path: str | Path | None = None) -> dict:
    """
    Load and return the resolved pipeline configuration dict.
    Cached after first call — restart the process to reload.
    """
    cfg_path = Path(path) if path else _CONFIG_PATH
    with cfg_path.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)

    cfg = _walk_resolve(raw)
    cfg = _apply_env_overrides(cfg)
    return cfg


def get(section: str, key: str | None = None, default: Any = None) -> Any:
    """Convenience accessor.

    get("database", "url")  → cfg['database']['url']
    get("ingestion")        → cfg['ingestion']  (whole section)
    """
    cfg = load_config()
    node = cfg.get(section, {})
    if key is None:
        return node
    return node.get(key, default)

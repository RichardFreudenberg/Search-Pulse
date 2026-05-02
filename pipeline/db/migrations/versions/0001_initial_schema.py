"""Initial pipeline schema — all new tables only.

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-02
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # All tables are created via SQLAlchemy metadata (create_tables()).
    # This migration exists as a baseline marker.
    # Running `alembic upgrade head` on a fresh DB will call create_tables()
    # in pipeline.db.database, so this migration is a no-op when the API
    # starts for the first time.
    pass


def downgrade() -> None:
    # In production, downgrade drops nothing (use --sql to generate script manually).
    pass

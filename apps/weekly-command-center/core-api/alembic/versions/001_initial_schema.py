"""Initial schema: plans, accounts, users, weeks, tasks, deliverables, documents, folders, inbox_events, library cache

Revision ID: 001
Revises:
Create Date: 2026-01-15 00:00:00.000000

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "plans",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("price_cents", sa.Integer(), nullable=False),
        sa.Column("max_users", sa.Integer(), nullable=False),
        sa.Column("max_open_tasks", sa.Integer(), nullable=False),
        sa.Column("max_deliverables", sa.Integer(), nullable=False),
        sa.Column("stripe_price_id", sa.String(128), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("plan_id", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"], ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_accounts_slug", "accounts", ["slug"])

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_account_id", "users", ["account_id"])
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "weeks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("week_start", sa.String(10), nullable=False),
        sa.Column("week_end", sa.String(10), nullable=False),
        sa.Column("previous_week_id", sa.Integer(), nullable=True),
        sa.Column("narrative", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ),
        sa.ForeignKeyConstraint(["previous_week_id"], ["weeks.id"], ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("account_id", "week_start", name="uq_week_account_start"),
    )
    op.create_index("ix_weeks_account_id", "weeks", ["account_id"])

    op.create_table(
        "deliverables",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("project", sa.String(200), nullable=False),
        sa.Column("due_date", sa.String(10), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("pressure", sa.Numeric(4, 3), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_deliverables_account_id", "deliverables", ["account_id"])

    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("week_id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("deliverable_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("estimate_minutes", sa.Integer(), nullable=False),
        sa.Column("deadline", sa.String(32), nullable=True),
        sa.Column("tags", sa.String(500), nullable=False),
        sa.Column("carried_over_from", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ),
        sa.ForeignKeyConstraint(["deliverable_id"], ["deliverables.id"], ),
        sa.ForeignKeyConstraint(["parent_id"], ["tasks.id"], ),
        sa.ForeignKeyConstraint(["week_id"], ["weeks.id"], ),
        sa.ForeignKeyConstraint(["carried_over_from"], ["tasks.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tasks_account_id", "tasks", ["account_id"])
    op.create_index("ix_tasks_week_id", "tasks", ["week_id"])

    op.create_table(
        "folders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ),
        sa.ForeignKeyConstraint(["parent_id"], ["folders.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_folders_account_id", "folders", ["account_id"])

    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("folder_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("doc_type", sa.String(32), nullable=False),
        sa.Column("current_revision_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ),
        sa.ForeignKeyConstraint(["folder_id"], ["folders.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_documents_account_id", "documents", ["account_id"])

    op.create_table(
        "document_revisions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("author", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_document_revisions_document_id", "document_revisions", ["document_id"])

    op.create_table(
        "inbox_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("mentioned_date", sa.String(10), nullable=True),
        sa.Column("raw_snippet", sa.Text(), nullable=False),
        sa.Column("linked_deliverable_id", sa.Integer(), nullable=True),
        sa.Column("imported_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ),
        sa.ForeignKeyConstraint(["linked_deliverable_id"], ["deliverables.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inbox_events_account_id", "inbox_events", ["account_id"])

    op.create_table(
        "libraries_cache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("language", sa.String(32), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("version", sa.String(64), nullable=False),
        sa.Column("source_file", sa.String(300), nullable=False),
        sa.Column("scanned_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("libraries_cache")
    op.drop_table("inbox_events")
    op.drop_table("document_revisions")
    op.drop_table("documents")
    op.drop_table("folders")
    op.drop_table("tasks")
    op.drop_table("deliverables")
    op.drop_table("weeks")
    op.drop_table("users")
    op.drop_table("accounts")
    op.drop_table("plans")

"""ORM schema. Every tenant-owned table carries `account_id` so a single
Postgres (or SQLite) database can serve every customer with hard row-level
isolation enforced in application code (see `app/tenancy.py`) — no customer
query can ever omit the filter because the query-building helpers require it.
"""
from __future__ import annotations

import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _now() -> datetime.datetime:
    return datetime.datetime.utcnow()


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # 'free' | 'pro' | 'team'
    name: Mapped[str] = mapped_column(String(64))
    price_cents: Mapped[int] = mapped_column(Integer, default=0)
    max_users: Mapped[int] = mapped_column(Integer)
    max_open_tasks: Mapped[int] = mapped_column(Integer)
    max_deliverables: Mapped[int] = mapped_column(Integer)
    # Left null until a real Stripe account exists; billing.py checks for it
    # before attempting to create a Checkout session.
    stripe_price_id: Mapped[str | None] = mapped_column(String(128), nullable=True)


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    plan_id: Mapped[str] = mapped_column(ForeignKey("plans.id"), default="free")
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now)

    plan: Mapped[Plan] = relationship("Plan")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="owner")  # 'owner' | 'member'
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now)


class Week(Base):
    __tablename__ = "weeks"
    __table_args__ = (UniqueConstraint("account_id", "week_start", name="uq_week_account_start"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    week_start: Mapped[str] = mapped_column(String(10))
    week_end: Mapped[str] = mapped_column(String(10))
    previous_week_id: Mapped[int | None] = mapped_column(ForeignKey("weeks.id"), nullable=True)
    narrative: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now)


class Deliverable(Base):
    __tablename__ = "deliverables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    project: Mapped[str] = mapped_column(String(200), default="")
    due_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="open")
    pressure: Mapped[float] = mapped_column(Numeric(4, 3), default=0)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    week_id: Mapped[int] = mapped_column(ForeignKey("weeks.id"), index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    deliverable_id: Mapped[int | None] = mapped_column(ForeignKey("deliverables.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="todo")
    priority: Mapped[int] = mapped_column(Integer, default=3)
    estimate_minutes: Mapped[int] = mapped_column(Integer, default=0)
    deadline: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tags: Mapped[str] = mapped_column(String(500), default="")
    carried_over_from: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("folders.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    folder_id: Mapped[int | None] = mapped_column(ForeignKey("folders.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(300))
    doc_type: Mapped[str] = mapped_column(String(32), default="note")
    current_revision_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now)


class DocumentRevision(Base):
    __tablename__ = "document_revisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), index=True)
    revision_number: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text, default="")
    author: Mapped[str] = mapped_column(String(64), default="user")
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now)


class InboxEvent(Base):
    __tablename__ = "inbox_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    source: Mapped[str] = mapped_column(String(32), default="email")
    subject: Mapped[str] = mapped_column(String(500), default="")
    mentioned_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    raw_snippet: Mapped[str] = mapped_column(Text, default="")
    linked_deliverable_id: Mapped[int | None] = mapped_column(ForeignKey("deliverables.id"), nullable=True)
    imported_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now)


class LibraryCacheEntry(Base):
    """Not tenant data — this reflects the codebase's own dependencies, so
    it's shared across the whole platform rather than scoped per account."""
    __tablename__ = "libraries_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    language: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(200))
    version: Mapped[str] = mapped_column(String(64), default="")
    source_file: Mapped[str] = mapped_column(String(300))
    scanned_at: Mapped[datetime.datetime] = mapped_column(DateTime, default=_now)

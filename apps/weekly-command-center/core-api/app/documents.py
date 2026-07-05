"""Native documents/notes with recursive folders and append-only revisions,
scoped per account.

A document is never overwritten: `documents.current_revision_id` just points
at the newest row in `document_revisions`. The full lineage is always
retrievable — "nothing is static, everything is recursive" applied to the
file/notes layer.
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db_models import Document, DocumentRevision, Folder
from .schemas import DocumentCreate, DocumentRevise, FolderCreate


def create_folder(db: Session, account_id: int, payload: FolderCreate) -> Folder:
    folder = Folder(account_id=account_id, parent_id=payload.parent_id, name=payload.name)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


def list_folder_tree(db: Session, account_id: int, parent_id: int | None = None) -> list[dict]:
    stmt = select(Folder).where(Folder.account_id == account_id)
    stmt = stmt.where(Folder.parent_id.is_(None)) if parent_id is None else stmt.where(Folder.parent_id == parent_id)
    tree = []
    for folder in db.execute(stmt).scalars().all():
        tree.append({
            "id": folder.id, "parent_id": folder.parent_id, "name": folder.name,
            "created_at": folder.created_at.isoformat() if folder.created_at else None,
            "children": list_folder_tree(db, account_id, folder.id),
            "documents": list_documents(db, account_id, folder.id),
        })
    return tree


def create_document(db: Session, account_id: int, payload: DocumentCreate) -> dict:
    document = Document(account_id=account_id, folder_id=payload.folder_id, name=payload.name, doc_type=payload.doc_type)
    db.add(document)
    db.flush()

    revision = DocumentRevision(document_id=document.id, revision_number=1, content=payload.content, author="user")
    db.add(revision)
    db.flush()

    document.current_revision_id = revision.id
    db.commit()
    db.refresh(document)
    return get_document(db, account_id, document.id)


def revise_document(db: Session, account_id: int, doc_id: int, payload: DocumentRevise) -> dict | None:
    document = db.execute(
        select(Document).where(Document.id == doc_id, Document.account_id == account_id)
    ).scalar_one_or_none()
    if document is None:
        return None
    last_rev_num = db.execute(
        select(func.coalesce(func.max(DocumentRevision.revision_number), 0)).where(
            DocumentRevision.document_id == doc_id
        )
    ).scalar_one()

    revision = DocumentRevision(
        document_id=doc_id, revision_number=last_rev_num + 1, content=payload.content, author=payload.author,
    )
    db.add(revision)
    db.flush()
    document.current_revision_id = revision.id
    db.commit()
    return get_document(db, account_id, doc_id)


def get_document(db: Session, account_id: int, doc_id: int) -> dict | None:
    document = db.execute(
        select(Document).where(Document.id == doc_id, Document.account_id == account_id)
    ).scalar_one_or_none()
    if document is None:
        return None
    current = db.get(DocumentRevision, document.current_revision_id) if document.current_revision_id else None
    return {
        "id": document.id, "folder_id": document.folder_id, "name": document.name,
        "doc_type": document.doc_type, "current_revision_id": document.current_revision_id,
        "created_at": document.created_at.isoformat() if document.created_at else None,
        "content": current.content if current else "",
        "revision_number": current.revision_number if current else 0,
    }


def get_document_history(db: Session, account_id: int, doc_id: int) -> list[dict]:
    # account scoping enforced via a join back to documents
    rows = db.execute(
        select(DocumentRevision)
        .join(Document, Document.id == DocumentRevision.document_id)
        .where(DocumentRevision.document_id == doc_id, Document.account_id == account_id)
        .order_by(DocumentRevision.revision_number.desc())
    ).scalars().all()
    return [
        {
            "id": r.id, "revision_number": r.revision_number, "author": r.author,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "chars": len(r.content),
        }
        for r in rows
    ]


def list_documents(db: Session, account_id: int, folder_id: int | None) -> list[dict]:
    stmt = select(Document).where(Document.account_id == account_id)
    stmt = stmt.where(Document.folder_id.is_(None)) if folder_id is None else stmt.where(Document.folder_id == folder_id)
    return [{"id": d.id, "name": d.name, "doc_type": d.doc_type} for d in db.execute(stmt).scalars().all()]

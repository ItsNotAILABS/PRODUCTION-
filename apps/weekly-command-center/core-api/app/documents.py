"""Native documents/notes with recursive folders and append-only revisions.

A document is never overwritten: `documents.current_revision_id` just points
at the newest row in `document_revisions`. The full lineage is always
retrievable — "nothing is static, everything is recursive" applied to the
file/notes layer.
"""
from __future__ import annotations

from . import db
from .models import DocumentCreate, DocumentRevise, FolderCreate


def create_folder(payload: FolderCreate) -> dict:
    with db.tx() as c:
        cur = c.execute(
            "INSERT INTO folders (parent_id, name) VALUES (?, ?)",
            (payload.parent_id, payload.name),
        )
        folder_id = cur.lastrowid
    return dict(db.get_conn().execute("SELECT * FROM folders WHERE id = ?", (folder_id,)).fetchone())


def list_folder_tree(parent_id: int | None = None) -> list[dict]:
    conn = db.get_conn()
    if parent_id is None:
        rows = conn.execute("SELECT * FROM folders WHERE parent_id IS NULL").fetchall()
    else:
        rows = conn.execute("SELECT * FROM folders WHERE parent_id = ?", (parent_id,)).fetchall()
    tree = []
    for r in rows:
        node = dict(r)
        node["children"] = list_folder_tree(node["id"])
        node["documents"] = list_documents(node["id"])
        tree.append(node)
    return tree


def create_document(payload: DocumentCreate) -> dict:
    with db.tx() as c:
        cur = c.execute(
            "INSERT INTO documents (folder_id, name, doc_type) VALUES (?, ?, ?)",
            (payload.folder_id, payload.name, payload.doc_type),
        )
        doc_id = cur.lastrowid
        rev_cur = c.execute(
            "INSERT INTO document_revisions (document_id, revision_number, content, author) VALUES (?, 1, ?, 'user')",
            (doc_id, payload.content),
        )
        c.execute(
            "UPDATE documents SET current_revision_id = ? WHERE id = ?",
            (rev_cur.lastrowid, doc_id),
        )
    return get_document(doc_id)


def revise_document(doc_id: int, payload: DocumentRevise) -> dict | None:
    conn = db.get_conn()
    doc = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    if not doc:
        return None
    last_rev_num = conn.execute(
        "SELECT COALESCE(MAX(revision_number), 0) AS n FROM document_revisions WHERE document_id = ?",
        (doc_id,),
    ).fetchone()["n"]
    with db.tx() as c:
        cur = c.execute(
            "INSERT INTO document_revisions (document_id, revision_number, content, author) VALUES (?, ?, ?, ?)",
            (doc_id, last_rev_num + 1, payload.content, payload.author),
        )
        c.execute("UPDATE documents SET current_revision_id = ? WHERE id = ?", (cur.lastrowid, doc_id))
    return get_document(doc_id)


def get_document(doc_id: int) -> dict | None:
    conn = db.get_conn()
    doc = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    if not doc:
        return None
    doc = dict(doc)
    current = conn.execute(
        "SELECT * FROM document_revisions WHERE id = ?", (doc["current_revision_id"],)
    ).fetchone()
    doc["content"] = current["content"] if current else ""
    doc["revision_number"] = current["revision_number"] if current else 0
    return doc


def get_document_history(doc_id: int) -> list[dict]:
    rows = db.get_conn().execute(
        "SELECT id, revision_number, author, created_at, length(content) AS chars "
        "FROM document_revisions WHERE document_id = ? ORDER BY revision_number DESC",
        (doc_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def list_documents(folder_id: int | None) -> list[dict]:
    conn = db.get_conn()
    if folder_id is None:
        rows = conn.execute("SELECT id, name, doc_type FROM documents WHERE folder_id IS NULL").fetchall()
    else:
        rows = conn.execute("SELECT id, name, doc_type FROM documents WHERE folder_id = ?", (folder_id,)).fetchall()
    return [dict(r) for r in rows]

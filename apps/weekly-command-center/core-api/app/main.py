from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import (
    db,
    deliverables as deliverables_mod,
    documents as documents_mod,
    library_registry,
    tasks as tasks_mod,
    weeks as weeks_mod,
)
from .agents import inner_agent, outer_agent
from .calendars import today_in_all_calendars
from .clients import haskell_client, julia_client
from .integrations import email_context
from .models import (
    DeliverableCreate,
    DocumentCreate,
    DocumentRevise,
    FolderCreate,
    OptimizeRequest,
    ParseRequest,
    TaskCreate,
    TaskUpdate,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    inner_agent.start()
    yield
    inner_agent.stop()


app = FastAPI(title="Weekly Command Center", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


# --- Weeks / continuity -----------------------------------------------------

@app.get("/weeks/current")
def current_week():
    return weeks_mod.get_or_create_current_week()


@app.get("/weeks/{week_id}/thread")
def week_thread(week_id: int, depth: int = 12):
    return weeks_mod.get_thread(week_id, depth)


@app.get("/weeks/{week_id}/tasks")
def week_tasks(week_id: int):
    return tasks_mod.week_tree(week_id)


# --- Tasks (recursive) -------------------------------------------------------

@app.post("/tasks")
def create_task(payload: TaskCreate):
    week = weeks_mod.get_or_create_current_week()
    return tasks_mod.create_task(payload, default_week_id=week["id"])


@app.get("/tasks/{task_id}/tree")
def task_tree(task_id: int):
    tree = tasks_mod.get_tree(task_id)
    if tree is None:
        raise HTTPException(404, "task not found")
    return tree


@app.patch("/tasks/{task_id}")
def patch_task(task_id: int, payload: TaskUpdate):
    task = tasks_mod.update_task(task_id, payload)
    if task is None:
        raise HTTPException(404, "task not found")
    return task


@app.post("/tasks/parse")
def parse_task_line(payload: ParseRequest):
    return haskell_client.parse(payload.line)


@app.post("/weeks/{week_id}/optimize")
def optimize_week(week_id: int, payload: OptimizeRequest):
    open_tasks = [t for t in tasks_mod.list_tasks(week_id) if t["status"] != "done"]
    return julia_client.optimize(open_tasks, payload.daily_capacity_minutes)


# --- Deliverables -------------------------------------------------------------

@app.post("/deliverables")
def create_deliverable(payload: DeliverableCreate):
    return deliverables_mod.create_deliverable(payload)


@app.get("/deliverables")
def list_deliverables(status: str | None = None):
    return deliverables_mod.list_deliverables(status)


# --- Documents / folders (recursive, versioned) -------------------------------

@app.post("/folders")
def create_folder(payload: FolderCreate):
    return documents_mod.create_folder(payload)


@app.get("/folders/tree")
def folder_tree():
    return documents_mod.list_folder_tree(None)


@app.post("/documents")
def create_document(payload: DocumentCreate):
    return documents_mod.create_document(payload)


@app.get("/documents/{doc_id}")
def get_document(doc_id: int):
    doc = documents_mod.get_document(doc_id)
    if doc is None:
        raise HTTPException(404, "document not found")
    return doc


@app.post("/documents/{doc_id}/revise")
def revise_document(doc_id: int, payload: DocumentRevise):
    doc = documents_mod.revise_document(doc_id, payload)
    if doc is None:
        raise HTTPException(404, "document not found")
    return doc


@app.get("/documents/{doc_id}/history")
def document_history(doc_id: int):
    return documents_mod.get_document_history(doc_id)


# --- Calendars (ancient + ISO root layer) -------------------------------------

@app.get("/calendars/today")
def calendars_today():
    return vars(today_in_all_calendars())


# --- Digest (outer agent) + inbox context -------------------------------------

@app.get("/digest")
def digest(week_id: int | None = None):
    return outer_agent.build_digest(week_id)


@app.post("/inbox/scan")
def scan_inbox():
    return email_context.scan_inbox()


# --- Library registry ----------------------------------------------------------

@app.get("/libraries")
def libraries():
    return library_registry.scan()

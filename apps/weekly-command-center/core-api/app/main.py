from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import (
    auth,
    billing,
    deliverables as deliverables_mod,
    documents as documents_mod,
    library_registry,
    tasks as tasks_mod,
    weeks as weeks_mod,
)
from .agents import inner_agent, outer_agent
from .auth import get_current_account
from .calendars import today_in_all_calendars
from .clients import haskell_client, julia_client
from .database import get_db, init_db
from .db_models import Account
from .integrations import email_context
from .schemas import (
    DeliverableCreate,
    DocumentCreate,
    DocumentRevise,
    FolderCreate,
    OptimizeRequest,
    ParseRequest,
    TaskCreate,
    TaskUpdate,
)


_ENABLE_INNER_AGENT = os.environ.get("ENABLE_INNER_AGENT", "true").lower() == "true"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # In production (docker-compose.prod.yml) the web process runs with
    # multiple gunicorn workers; running the scheduler in every one of them
    # would fire each housekeeping job N times. There, ENABLE_INNER_AGENT is
    # set to false on the web service and a single dedicated `core-worker`
    # process (worker.py) runs the scheduler instead. Locally/dev
    # (run_local.sh, docker-compose.yml) it's a single process, so the
    # default of running it inline here is correct and simplest.
    if _ENABLE_INNER_AGENT:
        inner_agent.start()
    yield
    if _ENABLE_INNER_AGENT:
        inner_agent.stop()


app = FastAPI(title="Weekly Command Center", lifespan=lifespan)

# Locked down in production: set CORS_ORIGINS to a comma-separated allowlist
# (e.g. "https://app.yourdomain.com"). Wildcard is only for local dev.
_cors_origins = os.environ.get("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins.split(",") if _cors_origins != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(billing.router)


@app.get("/health")
def health():
    return {"status": "ok"}


# --- Weeks / continuity -----------------------------------------------------

@app.get("/weeks/current")
def current_week(account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    week = weeks_mod.get_or_create_current_week(db, account.id)
    return outer_agent.week_to_dict(week)


@app.get("/weeks/{week_id}/thread")
def week_thread(week_id: int, depth: int = 12, account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    return [outer_agent.week_to_dict(w) for w in weeks_mod.get_thread(db, account.id, week_id, depth)]


@app.get("/weeks/{week_id}/tasks")
def week_tasks(week_id: int, account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    return tasks_mod.week_tree(db, account.id, week_id)


# --- Tasks (recursive) -------------------------------------------------------

@app.post("/tasks")
def create_task(payload: TaskCreate, account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    week = weeks_mod.get_or_create_current_week(db, account.id)
    task = tasks_mod.create_task(db, account, payload, default_week_id=week.id)
    return tasks_mod.task_to_dict(task)


@app.get("/tasks/{task_id}/tree")
def task_tree(task_id: int, account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    tree = tasks_mod.get_tree(db, account.id, task_id)
    if tree is None:
        raise HTTPException(404, "task not found")
    return tree


@app.patch("/tasks/{task_id}")
def patch_task(task_id: int, payload: TaskUpdate, account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    task = tasks_mod.update_task(db, account.id, task_id, payload)
    if task is None:
        raise HTTPException(404, "task not found")
    return tasks_mod.task_to_dict(task)


@app.post("/tasks/parse")
def parse_task_line(payload: ParseRequest, account: Account = Depends(get_current_account)):
    return haskell_client.parse(payload.line)


@app.post("/weeks/{week_id}/optimize")
def optimize_week(week_id: int, payload: OptimizeRequest, account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    open_tasks = [tasks_mod.task_to_dict(t) for t in tasks_mod.list_tasks(db, account.id, week_id) if t.status != "done"]
    return julia_client.optimize(open_tasks, payload.daily_capacity_minutes)


# --- Deliverables -------------------------------------------------------------

@app.post("/deliverables")
def create_deliverable(payload: DeliverableCreate, account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    d = deliverables_mod.create_deliverable(db, account, payload)
    return outer_agent.deliverable_to_dict(d)


@app.get("/deliverables")
def list_deliverables(status: str | None = None, account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    return [outer_agent.deliverable_to_dict(d) for d in deliverables_mod.list_deliverables(db, account.id, status)]


# --- Documents / folders (recursive, versioned) -------------------------------

@app.post("/folders")
def create_folder(payload: FolderCreate, account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    f = documents_mod.create_folder(db, account.id, payload)
    return {"id": f.id, "parent_id": f.parent_id, "name": f.name, "created_at": f.created_at.isoformat()}


@app.get("/folders/tree")
def folder_tree(account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    return documents_mod.list_folder_tree(db, account.id)


@app.post("/documents")
def create_document(payload: DocumentCreate, account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    return documents_mod.create_document(db, account.id, payload)


@app.get("/documents/{doc_id}")
def get_document(doc_id: int, account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    doc = documents_mod.get_document(db, account.id, doc_id)
    if doc is None:
        raise HTTPException(404, "document not found")
    return doc


@app.post("/documents/{doc_id}/revise")
def revise_document(doc_id: int, payload: DocumentRevise, account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    doc = documents_mod.revise_document(db, account.id, doc_id, payload)
    if doc is None:
        raise HTTPException(404, "document not found")
    return doc


@app.get("/documents/{doc_id}/history")
def document_history(doc_id: int, account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    return documents_mod.get_document_history(db, account.id, doc_id)


# --- Calendars (ancient + ISO root layer) -------------------------------------

@app.get("/calendars/today")
def calendars_today():
    return vars(today_in_all_calendars())


# --- Digest (outer agent) + inbox context -------------------------------------

@app.get("/digest")
def digest(week_id: int | None = None, account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    return outer_agent.build_digest(db, account.id, week_id)


@app.post("/inbox/scan")
def scan_inbox(account: Account = Depends(get_current_account), db: Session = Depends(get_db)):
    return email_context.scan_inbox(db, account.id)


# --- Library registry (platform-wide, not tenant data) ------------------------

@app.get("/libraries")
def libraries():
    return library_registry.scan()

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    parent_id: Optional[int] = None
    deliverable_id: Optional[int] = None
    priority: int = 3
    estimate_minutes: int = 0
    deadline: Optional[str] = None
    tags: str = ""
    week_id: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[int] = None
    estimate_minutes: Optional[int] = None
    deadline: Optional[str] = None
    tags: Optional[str] = None


class DeliverableCreate(BaseModel):
    title: str
    project: str = ""
    due_date: Optional[str] = None


class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None


class DocumentCreate(BaseModel):
    name: str
    folder_id: Optional[int] = None
    doc_type: str = "note"
    content: str = ""


class DocumentRevise(BaseModel):
    content: str
    author: str = "user"


class ParseRequest(BaseModel):
    line: str


class OptimizeRequest(BaseModel):
    week_id: Optional[int] = None
    daily_capacity_minutes: int = 360

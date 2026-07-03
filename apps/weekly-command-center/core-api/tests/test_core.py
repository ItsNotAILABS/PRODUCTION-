from datetime import date, timedelta

from app import deliverables, documents, library_registry, tasks, weeks
from app.calendars import julian_day_number, mayan_long_count, today_in_all_calendars, week_bounds
from app.models import (
    DeliverableCreate,
    DocumentCreate,
    DocumentRevise,
    FolderCreate,
    TaskCreate,
    TaskUpdate,
)


# --- calendars ---------------------------------------------------------------

def test_julian_day_number_known_epoch():
    # 2000-01-01 is a commonly cited reference: JDN 2451545
    assert julian_day_number(date(2000, 1, 1)) == 2451545


def test_mayan_creation_date_is_baktun_zero():
    creation = mayan_long_count(584283)
    assert creation["long_count"] == "0.0.0.0.0"


def test_today_in_all_calendars_is_internally_consistent():
    result = today_in_all_calendars(date(2026, 7, 3))
    assert result.gregorian == "2026-07-03"
    assert result.julian_day == julian_day_number(date(2026, 7, 3))


def test_week_bounds_monday_to_sunday():
    # 2026-07-03 is a Friday
    start, end = week_bounds(date(2026, 7, 3))
    assert start == date(2026, 6, 29)
    assert end == date(2026, 7, 5)
    assert start.isoweekday() == 1
    assert end.isoweekday() == 7


# --- weekly continuity --------------------------------------------------------

def test_week_creation_is_idempotent():
    w1 = weeks.get_or_create_current_week(date(2026, 7, 3))
    w2 = weeks.get_or_create_current_week(date(2026, 7, 3))
    assert w1["id"] == w2["id"]


def test_week_rollover_carries_open_tasks_and_chains_thread():
    week1 = weeks.get_or_create_current_week(date(2026, 6, 29))
    tasks.create_task(TaskCreate(title="unfinished", week_id=week1["id"]), default_week_id=week1["id"])
    done_task = tasks.create_task(TaskCreate(title="finished", week_id=week1["id"]), default_week_id=week1["id"])
    tasks.update_task(done_task["id"], TaskUpdate(status="done"))

    week2 = weeks.get_or_create_current_week(date(2026, 7, 6))
    assert week2["previous_week_id"] == week1["id"]

    week2_tasks = tasks.list_all_tasks_in_week(week2["id"])
    assert any(t["title"] == "unfinished" for t in week2_tasks)
    assert not any(t["title"] == "finished" for t in week2_tasks)

    thread = weeks.get_thread(week2["id"])
    assert [w["id"] for w in thread] == [week2["id"], week1["id"]]


# --- recursive tasks ----------------------------------------------------------

def test_task_tree_is_recursive_to_arbitrary_depth():
    week = weeks.get_or_create_current_week(date(2026, 7, 3))
    root = tasks.create_task(TaskCreate(title="root"), default_week_id=week["id"])
    child = tasks.create_task(TaskCreate(title="child", parent_id=root["id"]), default_week_id=week["id"])
    tasks.create_task(TaskCreate(title="grandchild", parent_id=child["id"]), default_week_id=week["id"])

    tree = tasks.get_tree(root["id"])
    assert tree["title"] == "root"
    assert tree["subtasks"][0]["title"] == "child"
    assert tree["subtasks"][0]["subtasks"][0]["title"] == "grandchild"


def test_list_all_tasks_in_week_includes_subtasks():
    week = weeks.get_or_create_current_week(date(2026, 7, 3))
    root = tasks.create_task(TaskCreate(title="root"), default_week_id=week["id"])
    tasks.create_task(TaskCreate(title="child", parent_id=root["id"]), default_week_id=week["id"])

    all_tasks = tasks.list_all_tasks_in_week(week["id"])
    assert {t["title"] for t in all_tasks} == {"root", "child"}


# --- deliverables / pressure ----------------------------------------------------

def test_pressure_rises_as_deadline_approaches(monkeypatch):
    near = deliverables.create_deliverable(DeliverableCreate(title="near", due_date="2026-07-04"))
    far = deliverables.create_deliverable(DeliverableCreate(title="far", due_date="2026-08-15"))

    class FixedDate(date):
        @classmethod
        def today(cls):
            return date(2026, 7, 3)

    monkeypatch.setattr(deliverables, "date", FixedDate)
    deliverables.recompute_pressure()

    near_row = deliverables.get_deliverable(near["id"])
    far_row = deliverables.get_deliverable(far["id"])
    assert near_row["pressure"] > far_row["pressure"]


# --- documents: append-only revisions ------------------------------------------

def test_document_revisions_never_overwrite():
    doc = documents.create_document(DocumentCreate(name="notes", content="v1"))
    documents.revise_document(doc["id"], DocumentRevise(content="v2"))
    documents.revise_document(doc["id"], DocumentRevise(content="v3"))

    current = documents.get_document(doc["id"])
    assert current["content"] == "v3"
    assert current["revision_number"] == 3

    history = documents.get_document_history(doc["id"])
    assert [h["revision_number"] for h in history] == [3, 2, 1]


def test_folder_tree_is_recursive():
    parent = documents.create_folder(FolderCreate(name="Projects"))
    child = documents.create_folder(FolderCreate(name="Acme", parent_id=parent["id"]))
    documents.create_document(DocumentCreate(name="brief", folder_id=child["id"], content="hi"))

    tree = documents.list_folder_tree()
    projects = next(f for f in tree if f["name"] == "Projects")
    assert projects["children"][0]["name"] == "Acme"
    assert projects["children"][0]["documents"][0]["name"] == "brief"


# --- library registry -----------------------------------------------------------

def test_library_registry_scans_real_manifests():
    entries = library_registry.scan()
    languages = {e["language"] for e in entries}
    assert "python" in languages
    assert "node" in languages
    assert "julia" in languages
    assert "haskell" in languages
    haskell_names = {e["name"] for e in entries if e["language"] == "haskell"}
    assert "default-language" not in haskell_names
    assert "ghc-options" not in haskell_names
    assert "scotty" in haskell_names

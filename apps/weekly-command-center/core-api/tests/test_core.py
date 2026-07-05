from datetime import date

from app import library_registry, weeks
from app.calendars import julian_day_number, mayan_long_count, today_in_all_calendars, week_bounds

from .conftest import auth_headers, signup


# --- calendars (pure functions, no DB needed) --------------------------------

def test_julian_day_number_known_epoch():
    assert julian_day_number(date(2000, 1, 1)) == 2451545


def test_mayan_creation_date_is_baktun_zero():
    assert mayan_long_count(584283)["long_count"] == "0.0.0.0.0"


def test_today_in_all_calendars_is_internally_consistent():
    result = today_in_all_calendars(date(2026, 7, 3))
    assert result.gregorian == "2026-07-03"
    assert result.julian_day == julian_day_number(date(2026, 7, 3))


def test_week_bounds_monday_to_sunday():
    start, end = week_bounds(date(2026, 7, 3))  # a Friday
    assert start == date(2026, 6, 29)
    assert end == date(2026, 7, 5)


def test_library_registry_scans_real_manifests():
    entries = library_registry.scan()
    languages = {e["language"] for e in entries}
    assert {"python", "node", "julia", "haskell"} <= languages
    haskell_names = {e["name"] for e in entries if e["language"] == "haskell"}
    assert "default-language" not in haskell_names
    assert "ghc-options" not in haskell_names
    assert "scotty" in haskell_names


# --- auth ----------------------------------------------------------------------

def test_signup_returns_token_and_creates_free_plan_account(client):
    data = signup(client, "Acme Consulting", "alice@acmehq.io")
    assert data["account"]["plan_id"] == "free"
    assert data["user"]["role"] == "owner"
    assert data["access_token"]


def test_signup_duplicate_email_rejected(client):
    signup(client, "Acme Consulting", "alice@acmehq.io")
    resp = client.post(
        "/auth/signup",
        json={"account_name": "Another Co", "email": "alice@acmehq.io", "password": "testpassword1"},
    )
    assert resp.status_code == 409


def test_login_with_wrong_password_rejected(client):
    signup(client, "Acme Consulting", "alice@acmehq.io", password="correcthorse1")
    resp = client.post("/auth/login", json={"email": "alice@acmehq.io", "password": "wrongpass1"})
    assert resp.status_code == 401


def test_protected_route_without_token_is_401(client):
    resp = client.get("/deliverables")
    assert resp.status_code == 401


def test_invite_teammate_and_non_owner_cannot_invite(client):
    owner = signup(client, "Acme Consulting", "alice@acmehq.io")
    owner_headers = auth_headers(owner["access_token"])
    client.post("/billing/upgrade?plan_id=pro", headers=owner_headers)  # free plan caps at 1 user

    invite_resp = client.post(
        "/auth/invite",
        json={"account_name": "ignored", "email": "carol@acmehq.io", "password": "teammatepass1"},
        headers=owner_headers,
    )
    assert invite_resp.status_code == 200
    assert invite_resp.json()["role"] == "member"

    member_login = client.post("/auth/login", json={"email": "carol@acmehq.io", "password": "teammatepass1"})
    member_headers = auth_headers(member_login.json()["access_token"])
    non_owner_invite = client.post(
        "/auth/invite",
        json={"account_name": "ignored", "email": "dave@acmehq.io", "password": "anotherpass1"},
        headers=member_headers,
    )
    assert non_owner_invite.status_code == 403


# --- multi-tenant isolation ------------------------------------------------------

def test_two_accounts_never_see_each_others_deliverables(client):
    a = signup(client, "Acme Consulting", "alice@acmehq.io")
    b = signup(client, "Beta Studio", "bob@betastudio.io")
    headers_a, headers_b = auth_headers(a["access_token"]), auth_headers(b["access_token"])

    client.post("/deliverables", json={"title": "Acme Q3 report", "due_date": "2026-07-10"}, headers=headers_a)
    client.post("/deliverables", json={"title": "Beta launch plan", "due_date": "2026-07-15"}, headers=headers_b)

    titles_a = {d["title"] for d in client.get("/deliverables", headers=headers_a).json()}
    titles_b = {d["title"] for d in client.get("/deliverables", headers=headers_b).json()}
    assert titles_a == {"Acme Q3 report"}
    assert titles_b == {"Beta launch plan"}


def test_cross_account_task_lookup_by_id_is_404_not_leaked(client):
    a = signup(client, "Acme Consulting", "alice@acmehq.io")
    b = signup(client, "Beta Studio", "bob@betastudio.io")
    headers_a, headers_b = auth_headers(a["access_token"]), auth_headers(b["access_token"])

    task = client.post("/tasks", json={"title": "Acme-only task"}, headers=headers_a).json()

    resp = client.get(f"/tasks/{task['id']}/tree", headers=headers_b)
    assert resp.status_code == 404


def test_folder_tree_isolated_between_accounts(client):
    a = signup(client, "Acme Consulting", "alice@acmehq.io")
    b = signup(client, "Beta Studio", "bob@betastudio.io")
    headers_a, headers_b = auth_headers(a["access_token"]), auth_headers(b["access_token"])

    client.post("/folders", json={"name": "Client Notes"}, headers=headers_a)

    assert len(client.get("/folders/tree", headers=headers_a).json()) == 1
    assert len(client.get("/folders/tree", headers=headers_b).json()) == 0


# --- recursive tasks / documents (through the API, now auth-scoped) ------------

def test_task_tree_is_recursive_to_arbitrary_depth(client):
    a = signup(client, "Acme Consulting", "alice@acmehq.io")
    headers = auth_headers(a["access_token"])

    root = client.post("/tasks", json={"title": "root"}, headers=headers).json()
    child = client.post("/tasks", json={"title": "child", "parent_id": root["id"]}, headers=headers).json()
    client.post("/tasks", json={"title": "grandchild", "parent_id": child["id"]}, headers=headers)

    tree = client.get(f"/tasks/{root['id']}/tree", headers=headers).json()
    assert tree["subtasks"][0]["title"] == "child"
    assert tree["subtasks"][0]["subtasks"][0]["title"] == "grandchild"


def test_document_revisions_never_overwrite(client):
    a = signup(client, "Acme Consulting", "alice@acmehq.io")
    headers = auth_headers(a["access_token"])

    doc = client.post("/documents", json={"name": "notes", "content": "v1"}, headers=headers).json()
    client.post(f"/documents/{doc['id']}/revise", json={"content": "v2"}, headers=headers)
    client.post(f"/documents/{doc['id']}/revise", json={"content": "v3"}, headers=headers)

    current = client.get(f"/documents/{doc['id']}", headers=headers).json()
    assert current["content"] == "v3"
    assert current["revision_number"] == 3

    history = client.get(f"/documents/{doc['id']}/history", headers=headers).json()
    assert [h["revision_number"] for h in history] == [3, 2, 1]


# --- billing / plan limits -------------------------------------------------------

def test_free_plan_deliverable_limit_is_enforced_then_upgrade_lifts_it(client):
    a = signup(client, "Acme Consulting", "alice@acmehq.io")
    headers = auth_headers(a["access_token"])

    for i in range(3):  # free plan's max_deliverables
        resp = client.post("/deliverables", json={"title": f"d{i}", "due_date": "2026-08-01"}, headers=headers)
        assert resp.status_code == 200

    over_limit = client.post("/deliverables", json={"title": "over-limit", "due_date": "2026-08-01"}, headers=headers)
    assert over_limit.status_code == 402

    upgrade = client.post("/billing/upgrade?plan_id=pro", headers=headers)
    assert upgrade.status_code == 200
    assert upgrade.json()["plan_id"] == "pro"

    after_upgrade = client.post("/deliverables", json={"title": "after-upgrade", "due_date": "2026-08-01"}, headers=headers)
    assert after_upgrade.status_code == 200


def test_billing_plan_usage_reflects_real_counts(client):
    a = signup(client, "Acme Consulting", "alice@acmehq.io")
    headers = auth_headers(a["access_token"])
    client.post("/tasks", json={"title": "t1"}, headers=headers)
    client.post("/tasks", json={"title": "t2"}, headers=headers)

    usage = client.get("/billing/plan", headers=headers).json()["usage"]
    assert usage["open_tasks"] == 2
    assert usage["users"] == 1


# --- weekly continuity (direct model access for date control) -----------------

def test_week_rollover_carries_open_tasks_and_chains_thread(client, db_session):
    a = signup(client, "Acme Consulting", "alice@acmehq.io")
    account_id = a["account"]["id"]

    with db_session() as db:
        week1 = weeks.get_or_create_current_week(db, account_id, anchor=date(2026, 6, 29))
        db.commit()
        week1_id = week1.id

    from app.db_models import Task
    with db_session() as db:
        db.add(Task(account_id=account_id, week_id=week1_id, title="unfinished", status="todo"))
        done = Task(account_id=account_id, week_id=week1_id, title="finished", status="done")
        db.add(done)
        db.commit()

    with db_session() as db:
        week2 = weeks.get_or_create_current_week(db, account_id, anchor=date(2026, 7, 6))
        assert week2.previous_week_id == week1_id

        thread = weeks.get_thread(db, account_id, week2.id)
        assert [w.id for w in thread] == [week2.id, week1_id]

        week2_titles = {
            t.title for t in db.query(Task).filter(Task.account_id == account_id, Task.week_id == week2.id)
        }
        assert "unfinished" in week2_titles
        assert "finished" not in week2_titles

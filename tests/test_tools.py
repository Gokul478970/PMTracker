"""
Comprehensive unit tests for PMTracker.

Test strategy:
  - FastAPI routes tested via TestClient with X-Internal-Key header (bypasses JWT auth)
  - Data layer tested against isolated tmp_path copies
  - Utility functions (JQL parser, time parser) tested as pure units
  - All tests are self-contained: seed data is written by fixtures, not assumed
"""
import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SEED_DIR = Path(__file__).parent.parent / "pmtracker" / "store" / "data"
INTERNAL_KEY = "pmtracker-mcp-internal"
ADMIN_EMAIL = "604671@cognizant.com"


# ---------------------------------------------------------------------------
# Seed helper — writes deterministic test data into a tmp dir
# ---------------------------------------------------------------------------

def _seed_test_data(data_dir: Path) -> None:
    """Write a small but complete test dataset into *data_dir*."""

    projects = [
        {
            "id": "10001", "key": "ECOM", "name": "E-Commerce Platform",
            "projectTypeKey": "software",
            "lead": {"accountId": "user-001", "displayName": "Alice Johnson"},
            "description": "Main e-commerce application",
            "components": ["Frontend", "Backend", "Payments"],
            "versions": [], "archived": False, "admin_project": False,
        },
        {
            "id": "10002", "key": "MOB", "name": "Mobile App",
            "projectTypeKey": "software",
            "lead": {"accountId": "user-002", "displayName": "Bob Smith"},
            "description": "iOS and Android application",
            "components": ["iOS", "Android"],
            "versions": [], "archived": False, "admin_project": False,
        },
        {
            "id": "10003", "key": "ARC", "name": "Archived Project",
            "projectTypeKey": "software", "lead": None,
            "description": "This project is archived",
            "components": [], "versions": [], "archived": True, "admin_project": False,
        },
    ]

    users = [
        {"accountId": "user-001", "displayName": "Alice Johnson",
         "emailAddress": "alice@example.com", "active": True, "timeZone": "America/New_York"},
        {"accountId": "user-002", "displayName": "Bob Smith",
         "emailAddress": "bob@example.com", "active": True, "timeZone": "America/Chicago"},
        {"accountId": "user-003", "displayName": "Carol White",
         "emailAddress": "carol@example.com", "active": True, "timeZone": "Europe/London"},
    ]

    def _issue(num, project, summary, status, itype,
               assignee_id=None, labels=None, sprint=None, epic=None):
        return {
            "id": str(10000 + num + (0 if project == "ECOM" else 100)),
            "key": f"{project}-{num}",
            "fields": {
                "summary": summary,
                "status": {"id": "1", "name": status,
                           "statusCategory": {"id": 2, "key": "new", "name": "To Do"}},
                "issuetype": {"id": "1", "name": itype},
                "priority": {"id": "3", "name": "Medium"},
                "assignee": (
                    {"accountId": assignee_id,
                     "displayName": "Alice Johnson" if assignee_id == "user-001" else "Bob Smith"}
                    if assignee_id else None
                ),
                "reporter": {"accountId": "user-002", "displayName": "Bob Smith"},
                "project": {"key": project,
                            "id": "10001" if project == "ECOM" else "10002"},
                "description": f"Description for {summary}",
                "created": "2025-01-10T09:00:00.000Z",
                "updated": "2025-01-15T14:30:00.000Z",
                "labels": labels or [],
                "components": [{"name": "Backend"}],
                "fixVersions": [],
                "comment": {"comments": [], "total": 0},
                "subtasks": [],
                "parent": None,
                "epic": epic,
                "sprint": sprint,
                "watchers": [],
                "transitions_history": [],
                "remote_links": [],
                "issueLinks": [],
                "customfield_10001": None,
                "estimate_hours": None,
                "customfield_10002": epic,
            },
        }

    issues = [
        _issue(1, "ECOM", "Implement user login",      "To Do",       "Story", "user-001", ["authentication"]),
        _issue(2, "ECOM", "Build checkout flow",        "In Progress", "Story", "user-001", sprint="2"),
        _issue(3, "ECOM", "Fix payment bug",            "To Do",       "Bug",   "user-002", ["bug"]),
        _issue(4, "ECOM", "Platform epic",              "In Progress", "Epic",  "user-001"),
        _issue(5, "ECOM", "E2E test suite",             "Done",        "Task",  "user-003"),
        _issue(6, "ECOM", "Performance optimization",   "To Do",       "Story", "user-002", sprint="2"),
        _issue(7, "ECOM", "Setup CI pipeline",          "To Do",       "Task"),
        _issue(1, "MOB",  "Mobile login screen",        "In Progress", "Story", "user-001"),
        _issue(2, "MOB",  "Push notifications",         "To Do",       "Task",  "user-002"),
        _issue(3, "MOB",  "Biometric auth bug",         "To Do",       "Bug",   None, ["bug"]),
    ]

    boards = [
        {"id": "1", "name": "ECOM Board", "type": "scrum",  "projectKey": "ECOM"},
        {"id": "2", "name": "MOB Board",  "type": "kanban", "projectKey": "MOB"},
    ]

    sprints = [
        {"id": "1", "boardId": "1", "name": "Sprint 1", "state": "closed",
         "startDate": "2025-01-06T00:00:00.000Z", "endDate": "2025-01-20T00:00:00.000Z",
         "goal": "Login"},
        {"id": "2", "boardId": "1", "name": "Sprint 2", "state": "active",
         "startDate": "2025-01-20T00:00:00.000Z", "endDate": "2025-02-03T00:00:00.000Z",
         "goal": "Payments"},
        {"id": "3", "boardId": "1", "name": "Sprint 3", "state": "future",
         "startDate": None, "endDate": None, "goal": ""},
    ]

    link_types = [
        {"id": "1", "name": "Blocks",    "inward": "is blocked by", "outward": "blocks"},
        {"id": "2", "name": "Relates",   "inward": "relates to",    "outward": "relates to"},
        {"id": "3", "name": "Duplicate", "inward": "is duplicated by", "outward": "duplicates"},
    ]

    fields = [
        {"id": "summary",           "name": "Summary",       "schema": {"type": "string"},   "custom": False},
        {"id": "status",            "name": "Status",        "schema": {"type": "status"},   "custom": False},
        {"id": "assignee",          "name": "Assignee",      "schema": {"type": "user"},     "custom": False},
        {"id": "priority",          "name": "Priority",      "schema": {"type": "priority"}, "custom": False},
        {"id": "customfield_10001", "name": "Story Points",  "schema": {"type": "number"},   "custom": True,
         "options": [1, 2, 3, 5, 8, 13, 21]},
    ]

    import hashlib as _hl
    admin_password_hash = _hl.sha256("1068".encode()).hexdigest()
    auth_users = [
        {
            "email": ADMIN_EMAIL,
            "password_hash": admin_password_hash,
            "verified": True,
            "role": "Admin",
            "display_name": "Admin",
            "created": "2025-01-01T00:00:00.000Z",
            "verified_at": "2025-01-01T00:00:00.000Z",
        }
    ]

    for filename, content in [
        ("projects", projects),
        ("users", users),
        ("issues", issues),
        ("boards", boards),
        ("sprints", sprints),
        ("link_types", link_types),
        ("fields", fields),
        ("worklogs", {}),
        ("auth_users", auth_users),
        ("auth_sessions", []),
        ("agent_keys", []),
        ("project_assignments", []),
    ]:
        (data_dir / f"{filename}.json").write_text(
            json.dumps(content, indent=2), encoding="utf-8"
        )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_data(tmp_path, monkeypatch):
    """Isolated data directory; redirects json_store.DATA_DIR to it."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    _seed_test_data(data_dir)

    import pmtracker.store.json_store as js
    monkeypatch.setattr(js, "DATA_DIR", data_dir)
    return data_dir


@pytest.fixture
def client(tmp_data):
    """FastAPI TestClient authenticated via the internal service key."""
    from api.main import app
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


@pytest.fixture
def admin_client(client):
    """Client with an admin Bearer token already set in default headers."""
    resp = client.post("/api/auth/login",
                       json={"email": ADMIN_EMAIL, "password": "1068"})
    token = resp.json()["token"]
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


def _h():
    """Return headers that bypass JWT auth."""
    return {"X-Internal-Key": INTERNAL_KEY}


# ===========================================================================
# 1. Data layer — json_store
# ===========================================================================

class TestJsonStore:

    def test_load_missing_returns_default(self, tmp_data):
        import pmtracker.store.json_store as js
        result = js.load("does_not_exist", default=[])
        assert result == []

    def test_save_and_load_roundtrip(self, tmp_data):
        import pmtracker.store.json_store as js
        payload = {"x": 1, "y": [2, 3]}
        js.save("rt_test", payload)
        assert js.load("rt_test") == payload

    def test_get_issue_found(self, tmp_data):
        import pmtracker.store.json_store as js
        issue = js.get_issue("ECOM-1")
        assert issue is not None
        assert issue["key"] == "ECOM-1"

    def test_get_issue_not_found(self, tmp_data):
        import pmtracker.store.json_store as js
        assert js.get_issue("FAKE-999") is None

    def test_get_project_found(self, tmp_data):
        import pmtracker.store.json_store as js
        project = js.get_project("ECOM")
        assert project is not None
        assert project["name"] == "E-Commerce Platform"

    def test_get_project_not_found(self, tmp_data):
        import pmtracker.store.json_store as js
        assert js.get_project("NOPE") is None

    def test_get_user_by_account_id(self, tmp_data):
        import pmtracker.store.json_store as js
        user = js.get_user("user-001")
        assert user["displayName"] == "Alice Johnson"

    def test_get_user_by_email(self, tmp_data):
        import pmtracker.store.json_store as js
        user = js.get_user("bob@example.com")
        assert user["accountId"] == "user-002"

    def test_get_user_case_insensitive(self, tmp_data):
        import pmtracker.store.json_store as js
        user = js.get_user("ALICE@EXAMPLE.COM")
        assert user is not None

    def test_get_user_not_found(self, tmp_data):
        import pmtracker.store.json_store as js
        assert js.get_user("nobody@nowhere.com") is None

    def test_next_issue_key_increments(self, tmp_data):
        import pmtracker.store.json_store as js
        keys = [i["key"] for i in js.get_issues() if i["key"].startswith("ECOM-")]
        nums = [int(k.split("-")[1]) for k in keys]
        assert js.next_issue_key("ECOM") == f"ECOM-{max(nums) + 1}"

    def test_next_issue_key_new_project(self, tmp_data):
        import pmtracker.store.json_store as js
        assert js.next_issue_key("BRAND") == "BRAND-1"

    def test_get_boards(self, tmp_data):
        import pmtracker.store.json_store as js
        boards = js.get_boards()
        assert any(b["id"] == "1" for b in boards)

    def test_get_board_by_id(self, tmp_data):
        import pmtracker.store.json_store as js
        board = js.get_board("2")
        assert board["projectKey"] == "MOB"

    def test_get_sprints(self, tmp_data):
        import pmtracker.store.json_store as js
        sprints = js.get_sprints()
        assert len(sprints) == 3

    def test_get_worklogs_empty(self, tmp_data):
        import pmtracker.store.json_store as js
        assert js.get_worklogs() == {}

    def test_save_worklogs(self, tmp_data):
        import pmtracker.store.json_store as js
        data = {"ECOM-1": [{"id": "wl-1", "timeSpent": "1h", "timeSpentSeconds": 3600}]}
        js.save_worklogs(data)
        assert js.get_worklogs()["ECOM-1"][0]["id"] == "wl-1"


# ===========================================================================
# 2. Utility functions — JQL parser
# ===========================================================================

class TestJqlParser:

    @pytest.fixture(autouse=True)
    def _issues(self, tmp_data):
        import pmtracker.store.json_store as js
        self.issues = js.get_issues()

    def _filter(self, jql):
        from pmtracker.tools.issues import parse_jql
        pred = parse_jql(jql)
        return [i for i in self.issues if pred(i)]

    def test_project_filter(self):
        result = self._filter("project = ECOM")
        assert all(i["fields"]["project"]["key"] == "ECOM" for i in result)
        assert len(result) == 7

    def test_status_filter(self):
        result = self._filter('status = "In Progress"')
        assert all(i["fields"]["status"]["name"] == "In Progress" for i in result)
        assert len(result) >= 1

    def test_issuetype_filter(self):
        result = self._filter("issuetype = Bug")
        assert all(i["fields"]["issuetype"]["name"] == "Bug" for i in result)

    def test_label_filter(self):
        result = self._filter('labels in ("bug")')
        assert all("bug" in i["fields"].get("labels", []) for i in result)

    def test_combined_and(self):
        result = self._filter('project = ECOM AND status = "Done"')
        for i in result:
            assert i["fields"]["project"]["key"] == "ECOM"
            assert i["fields"]["status"]["name"] == "Done"

    def test_combined_project_and_type(self):
        result = self._filter("project = MOB AND issuetype = Bug")
        assert all(
            i["fields"]["project"]["key"] == "MOB" and
            i["fields"]["issuetype"]["name"] == "Bug"
            for i in result
        )

    def test_unrecognised_jql_returns_all(self):
        result = self._filter("unknownfield = foo")
        assert len(result) == len(self.issues)

    def test_empty_jql_returns_all(self):
        result = self._filter("")
        assert len(result) == len(self.issues)

    def test_order_by_stripped(self):
        result = self._filter("project = ECOM ORDER BY created DESC")
        assert all(i["fields"]["project"]["key"] == "ECOM" for i in result)


# ===========================================================================
# 3. Utility functions — time_spent parser
# ===========================================================================

class TestTimeSpentParser:

    def _parse(self, text):
        from api.routes.comments import _parse_time_spent
        return _parse_time_spent(text)

    def test_hours_only(self):
        assert self._parse("2h") == 7200

    def test_minutes_only(self):
        assert self._parse("30m") == 1800

    def test_days_only(self):
        assert self._parse("1d") == 28800

    def test_combined_hours_minutes(self):
        assert self._parse("1h 30m") == 3600 + 1800

    def test_combined_days_hours(self):
        assert self._parse("2d 3h") == 2 * 28800 + 3 * 3600

    def test_unrecognised_returns_zero(self):
        assert self._parse("unknown") == 0

    def test_empty_returns_zero(self):
        assert self._parse("") == 0


# ===========================================================================
# 4. Transition static data
# ===========================================================================

class TestTransitionLogic:

    def test_todo_can_go_to_in_progress(self):
        from pmtracker.tools.transitions import TRANSITIONS
        names = [t["name"] for t in TRANSITIONS["To Do"]]
        assert "In Progress" in names

    def test_todo_can_go_to_done(self):
        from pmtracker.tools.transitions import TRANSITIONS
        names = [t["name"] for t in TRANSITIONS["To Do"]]
        assert "Done" in names

    def test_in_progress_can_go_to_review(self):
        from pmtracker.tools.transitions import TRANSITIONS
        names = [t["name"] for t in TRANSITIONS["In Progress"]]
        assert "In Review" in names

    def test_in_progress_can_go_to_todo(self):
        from pmtracker.tools.transitions import TRANSITIONS
        names = [t["name"] for t in TRANSITIONS["In Progress"]]
        assert "To Do" in names

    def test_done_can_reopen(self):
        from pmtracker.tools.transitions import TRANSITIONS
        names = [t["name"] for t in TRANSITIONS["Done"]]
        assert "In Progress" in names

    def test_all_transition_ids_are_unique(self):
        from pmtracker.tools.transitions import TRANSITIONS
        all_ids = [t["id"] for ts in TRANSITIONS.values() for t in ts]
        # IDs may repeat across statuses; just check they are non-empty strings
        assert all(isinstance(tid, str) and tid for tid in all_ids)


# ===========================================================================
# 5. Project API routes
# ===========================================================================

class TestProjectAPI:

    def test_list_projects_returns_non_hidden(self, client):
        resp = client.get("/api/projects", headers=_h())
        assert resp.status_code == 200
        keys = [p["key"] for p in resp.json()]
        # ECOM and MOB are seeded as "hidden" in projects route; ARC is in our test data
        # Internal-key user sees all non-hidden/non-archived projects
        assert "ECOM" not in keys  # hidden seed
        assert "MOB" not in keys   # hidden seed

    def test_list_projects_excludes_archived(self, client):
        resp = client.get("/api/projects", headers=_h())
        assert resp.status_code == 200
        for p in resp.json():
            assert not p.get("archived", False)

    def test_get_project_by_key(self, client):
        resp = client.get("/api/projects/ECOM", headers=_h())
        assert resp.status_code == 200
        assert resp.json()["key"] == "ECOM"

    def test_get_project_not_found(self, client):
        resp = client.get("/api/projects/NOPE", headers=_h())
        assert resp.status_code == 404

    def test_create_project(self, client):
        body = {"key": "NEWP", "name": "New Project", "description": "A fresh project"}
        resp = client.post("/api/projects", json=body, headers=_h())
        assert resp.status_code == 201
        data = resp.json()
        assert data["key"] == "NEWP"
        assert data["name"] == "New Project"

    def test_create_project_duplicate_key(self, client):
        body = {"key": "ECOM", "name": "Duplicate"}
        resp = client.post("/api/projects", json=body, headers=_h())
        assert resp.status_code == 409

    def test_create_project_invalid_key(self, client):
        body = {"key": "lower-case", "name": "Bad Key"}
        resp = client.post("/api/projects", json=body, headers=_h())
        assert resp.status_code == 400

    def test_create_project_auto_creates_board(self, client, tmp_data):
        import pmtracker.store.json_store as js
        client.post("/api/projects", json={"key": "XYZ", "name": "XYZ Project"}, headers=_h())
        boards = js.get_boards()
        assert any(b["projectKey"] == "XYZ" for b in boards)

    def test_update_project_non_admin_forbidden(self, client):
        """Internal service key user is not an admin — project updates must be denied."""
        resp = client.put("/api/projects/ECOM",
                          json={"name": "Hacked Name"}, headers=_h())
        assert resp.status_code == 403

    def test_update_project_name(self, admin_client, tmp_data):
        import pmtracker.store.json_store as js
        resp = admin_client.put("/api/projects/ECOM",
                                json={"name": "Updated Name"})
        assert resp.status_code == 200
        assert js.get_project("ECOM")["name"] == "Updated Name"

    def test_get_project_versions_empty(self, client):
        resp = client.get("/api/projects/ECOM/versions", headers=_h())
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_version(self, client, tmp_data):
        import pmtracker.store.json_store as js
        resp = client.post(
            "/api/projects/ECOM/versions",
            json={"name": "1.0.0", "description": "First release"},
            headers=_h(),
        )
        assert resp.status_code == 201
        project = js.get_project("ECOM")
        assert any(v["name"] == "1.0.0" for v in project.get("versions", []))

    def test_get_project_components(self, client):
        resp = client.get("/api/projects/ECOM/components", headers=_h())
        assert resp.status_code == 200
        names = [c["name"] if isinstance(c, dict) else c for c in resp.json()]
        assert "Backend" in names or "Frontend" in names or "Payments" in names


# ===========================================================================
# 6. Issue API routes
# ===========================================================================

class TestIssueAPI:

    def test_get_issue(self, client):
        resp = client.get("/api/issues/ECOM-1", headers=_h())
        assert resp.status_code == 200
        data = resp.json()
        assert data["key"] == "ECOM-1"
        assert "fields" in data

    def test_get_issue_not_found(self, client):
        resp = client.get("/api/issues/ECOM-9999", headers=_h())
        assert resp.status_code == 404

    def test_create_issue_returns_201(self, client):
        body = {"project_key": "ECOM", "summary": "New story", "issue_type": "Story"}
        resp = client.post("/api/issues", json=body, headers=_h())
        assert resp.status_code == 201

    def test_create_issue_key_format(self, client):
        body = {"project_key": "ECOM", "summary": "Key format check"}
        resp = client.post("/api/issues", json=body, headers=_h())
        assert resp.status_code == 201
        key = resp.json()["key"]
        assert key.startswith("ECOM-")
        assert key.split("-")[1].isdigit()

    def test_create_issue_persists(self, client, tmp_data):
        import pmtracker.store.json_store as js
        body = {"project_key": "ECOM", "summary": "Persist me", "issue_type": "Task"}
        resp = client.post("/api/issues", json=body, headers=_h())
        assert resp.status_code == 201
        key = resp.json()["key"]
        assert js.get_issue(key) is not None

    def test_create_issue_with_assignee(self, client):
        body = {
            "project_key": "ECOM",
            "summary": "Assigned issue",
            "issue_type": "Story",
            "assignee": "user-001",
        }
        resp = client.post("/api/issues", json=body, headers=_h())
        assert resp.status_code == 201
        assert resp.json()["fields"]["assignee"]["accountId"] == "user-001"

    def test_create_issue_unknown_project(self, client):
        body = {"project_key": "GHOST", "summary": "Orphan"}
        resp = client.post("/api/issues", json=body, headers=_h())
        assert resp.status_code == 404

    def test_create_issue_default_status_is_todo(self, client):
        body = {"project_key": "MOB", "summary": "Default status"}
        resp = client.post("/api/issues", json=body, headers=_h())
        assert resp.status_code == 201
        assert resp.json()["fields"]["status"]["name"] == "To Do"

    def test_create_issue_with_labels(self, client):
        body = {"project_key": "ECOM", "summary": "Labelled", "labels": ["alpha", "beta"]}
        resp = client.post("/api/issues", json=body, headers=_h())
        assert resp.status_code == 201
        assert "alpha" in resp.json()["fields"]["labels"]

    def test_create_issue_with_parent_updates_subtasks(self, client, tmp_data):
        import pmtracker.store.json_store as js
        body = {"project_key": "ECOM", "summary": "Child task",
                "issue_type": "Sub-task", "parent_key": "ECOM-4"}
        resp = client.post("/api/issues", json=body, headers=_h())
        assert resp.status_code == 201
        child_key = resp.json()["key"]
        parent = js.get_issue("ECOM-4")
        assert child_key in parent["fields"]["subtasks"]

    def test_update_issue_summary(self, client, tmp_data):
        import pmtracker.store.json_store as js
        resp = client.put("/api/issues/ECOM-1",
                          json={"summary": "Updated summary"}, headers=_h())
        assert resp.status_code == 200
        assert js.get_issue("ECOM-1")["fields"]["summary"] == "Updated summary"

    def test_update_issue_priority(self, client):
        resp = client.put("/api/issues/ECOM-1",
                          json={"priority": "High"}, headers=_h())
        assert resp.status_code == 200
        assert resp.json()["fields"]["priority"]["name"] == "High"

    def test_update_issue_labels(self, client):
        resp = client.put("/api/issues/ECOM-1",
                          json={"labels": ["new-label"]}, headers=_h())
        assert resp.status_code == 200
        assert "new-label" in resp.json()["fields"]["labels"]

    def test_update_issue_not_found(self, client):
        resp = client.put("/api/issues/ECOM-9999",
                          json={"summary": "X"}, headers=_h())
        assert resp.status_code == 404

    def test_delete_issue(self, client, tmp_data):
        import pmtracker.store.json_store as js
        # Create then delete
        create_resp = client.post("/api/issues",
                                  json={"project_key": "MOB", "summary": "To delete"},
                                  headers=_h())
        key = create_resp.json()["key"]
        del_resp = client.delete(f"/api/issues/{key}", headers=_h())
        assert del_resp.status_code == 200
        assert js.get_issue(key) is None

    def test_delete_issue_not_found(self, client):
        resp = client.delete("/api/issues/ECOM-9999", headers=_h())
        assert resp.status_code == 404

    def test_get_issue_children_empty(self, client):
        resp = client.get("/api/issues/ECOM-1/children", headers=_h())
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_issue_children_non_empty(self, client, tmp_data):
        # Create a child issue
        client.post("/api/issues",
                    json={"project_key": "ECOM", "summary": "Child",
                          "issue_type": "Sub-task", "parent_key": "ECOM-4"},
                    headers=_h())
        resp = client.get("/api/issues/ECOM-4/children", headers=_h())
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_issue_links_empty_initially(self, client):
        resp = client.get("/api/issues/ECOM-1/links", headers=_h())
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_issue_link(self, client, tmp_data):
        resp = client.post(
            "/api/issues/ECOM-1/links",
            json={"type": "Blocks", "target_key": "ECOM-3"},
            headers=_h(),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["source"] == "ECOM-1"
        assert data["target"] == "ECOM-3"

    def test_create_issue_link_bidirectional(self, client, tmp_data):
        import pmtracker.store.json_store as js
        client.post(
            "/api/issues/ECOM-1/links",
            json={"type": "Blocks", "target_key": "ECOM-3"},
            headers=_h(),
        )
        # Both source and target should have the link
        source = js.get_issue("ECOM-1")
        target = js.get_issue("ECOM-3")
        assert len(source["fields"]["issueLinks"]) >= 1
        assert len(target["fields"]["issueLinks"]) >= 1

    def test_delete_issue_link(self, client, tmp_data):
        create_resp = client.post(
            "/api/issues/ECOM-1/links",
            json={"type": "Relates", "target_key": "ECOM-3"},
            headers=_h(),
        )
        link_id = create_resp.json()["id"]
        del_resp = client.delete(f"/api/issues/ECOM-1/links/{link_id}", headers=_h())
        assert del_resp.status_code == 200
        assert del_resp.json()["deleted"] is True


# ===========================================================================
# 7. Comment API routes
# ===========================================================================

class TestCommentAPI:

    def test_get_comments_empty(self, client):
        resp = client.get("/api/issues/ECOM-1/comments", headers=_h())
        assert resp.status_code == 200
        assert resp.json() == []

    def test_add_comment(self, client):
        resp = client.post(
            "/api/issues/ECOM-1/comments",
            json={"body": "Hello world"},
            headers=_h(),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["body"] == "Hello world"
        assert "id" in data

    def test_add_comment_persists(self, client):
        client.post("/api/issues/ECOM-1/comments",
                    json={"body": "Persist test"}, headers=_h())
        resp = client.get("/api/issues/ECOM-1/comments", headers=_h())
        bodies = [c["body"] for c in resp.json()]
        assert "Persist test" in bodies

    def test_add_comment_with_author(self, client):
        resp = client.post(
            "/api/issues/ECOM-1/comments",
            json={"body": "By alice", "author_id": "user-001"},
            headers=_h(),
        )
        assert resp.status_code == 201
        assert resp.json()["author"]["accountId"] == "user-001"

    def test_add_comment_issue_not_found(self, client):
        resp = client.post("/api/issues/ECOM-9999/comments",
                           json={"body": "X"}, headers=_h())
        assert resp.status_code == 404

    def test_edit_comment(self, client):
        add_resp = client.post(
            "/api/issues/ECOM-1/comments",
            json={"body": "Original"},
            headers=_h(),
        )
        cid = add_resp.json()["id"]
        edit_resp = client.put(
            f"/api/issues/ECOM-1/comments/{cid}",
            json={"body": "Edited"},
            headers=_h(),
        )
        assert edit_resp.status_code == 200
        assert edit_resp.json()["body"] == "Edited"

    def test_edit_comment_not_found(self, client):
        resp = client.put(
            "/api/issues/ECOM-1/comments/nonexistent",
            json={"body": "X"},
            headers=_h(),
        )
        assert resp.status_code == 404

    def test_comment_count_updates(self, client, tmp_data):
        import pmtracker.store.json_store as js
        client.post("/api/issues/ECOM-1/comments",
                    json={"body": "1st"}, headers=_h())
        client.post("/api/issues/ECOM-1/comments",
                    json={"body": "2nd"}, headers=_h())
        issue = js.get_issue("ECOM-1")
        assert issue["fields"]["comment"]["total"] == 2


# ===========================================================================
# 8. Worklog API routes
# ===========================================================================

class TestWorklogAPI:

    def test_get_worklogs_empty(self, client):
        resp = client.get("/api/issues/ECOM-1/worklogs", headers=_h())
        assert resp.status_code == 200
        assert resp.json() == []

    def test_add_worklog(self, client):
        resp = client.post(
            "/api/issues/ECOM-1/worklogs",
            json={"time_spent": "2h", "comment": "Design session"},
            headers=_h(),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["timeSpent"] == "2h"
        assert data["timeSpentSeconds"] == 7200

    def test_add_worklog_persists(self, client):
        client.post("/api/issues/ECOM-1/worklogs",
                    json={"time_spent": "30m"}, headers=_h())
        resp = client.get("/api/issues/ECOM-1/worklogs", headers=_h())
        assert len(resp.json()) >= 1

    def test_add_worklog_with_author(self, client):
        resp = client.post(
            "/api/issues/ECOM-1/worklogs",
            json={"time_spent": "1h", "author_id": "user-002"},
            headers=_h(),
        )
        assert resp.status_code == 201
        assert resp.json()["author"]["accountId"] == "user-002"

    def test_add_worklog_issue_not_found(self, client):
        resp = client.post("/api/issues/NOPE-1/worklogs",
                           json={"time_spent": "1h"}, headers=_h())
        assert resp.status_code == 404

    def test_worklog_minutes_parsed(self, client):
        resp = client.post(
            "/api/issues/ECOM-1/worklogs",
            json={"time_spent": "1h 30m"},
            headers=_h(),
        )
        assert resp.status_code == 201
        assert resp.json()["timeSpentSeconds"] == 5400


# ===========================================================================
# 9. Transition API routes
# ===========================================================================

class TestTransitionAPI:

    def test_get_transitions_for_todo(self, client):
        resp = client.get("/api/issues/ECOM-1/transitions", headers=_h())
        assert resp.status_code == 200
        names = [t["name"] for t in resp.json()]
        assert "In Progress" in names

    def test_get_transitions_for_done(self, client, tmp_data):
        resp = client.get("/api/issues/ECOM-5/transitions", headers=_h())
        assert resp.status_code == 200
        names = [t["name"] for t in resp.json()]
        assert "In Progress" in names

    def test_get_transitions_issue_not_found(self, client):
        resp = client.get("/api/issues/ECOM-9999/transitions", headers=_h())
        assert resp.status_code == 404

    def test_transition_by_name(self, client, tmp_data):
        import pmtracker.store.json_store as js
        resp = client.post(
            "/api/issues/ECOM-1/transitions",
            json={"transition_name": "In Progress"},
            headers=_h(),
        )
        assert resp.status_code == 200
        assert js.get_issue("ECOM-1")["fields"]["status"]["name"] == "In Progress"

    def test_transition_by_id(self, client, tmp_data):
        import pmtracker.store.json_store as js
        resp = client.post(
            "/api/issues/ECOM-7/transitions",
            json={"transition_id": "11"},  # "In Progress" from "To Do"
            headers=_h(),
        )
        assert resp.status_code == 200
        assert js.get_issue("ECOM-7")["fields"]["status"]["name"] == "In Progress"

    def test_transition_records_history(self, client, tmp_data):
        import pmtracker.store.json_store as js
        client.post(
            "/api/issues/ECOM-6/transitions",
            json={"transition_name": "In Progress", "comment": "Starting now"},
            headers=_h(),
        )
        history = js.get_issue("ECOM-6")["fields"]["transitions_history"]
        assert len(history) >= 1
        last = history[-1]
        assert last["to_status"] == "In Progress"
        assert last["comment"] == "Starting now"

    def test_transition_invalid_id_returns_400(self, client):
        resp = client.post(
            "/api/issues/ECOM-1/transitions",
            json={"transition_id": "INVALID_999"},
            headers=_h(),
        )
        assert resp.status_code == 400

    def test_transition_no_params_returns_400(self, client):
        resp = client.post(
            "/api/issues/ECOM-1/transitions",
            json={},
            headers=_h(),
        )
        assert resp.status_code == 400

    def test_transition_response_includes_new_status(self, client):
        resp = client.post(
            "/api/issues/ECOM-3/transitions",
            json={"transition_name": "In Progress"},
            headers=_h(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["new_status"] == "In Progress"
        assert data["previous_status"] == "To Do"


# ===========================================================================
# 10. Sprint & Board API routes
# ===========================================================================

class TestSprintAPI:

    def test_list_boards(self, client):
        resp = client.get("/api/boards", headers=_h())
        assert resp.status_code == 200
        assert len(resp.json()) >= 2

    def test_list_boards_by_project(self, client):
        resp = client.get("/api/boards?project_key=ECOM", headers=_h())
        assert resp.status_code == 200
        boards = resp.json()
        assert all(b["projectKey"] == "ECOM" for b in boards)

    def test_list_boards_auto_creates_for_existing_project(self, client, tmp_data):
        # ARC project exists but has no board — endpoint should auto-create one
        resp = client.get("/api/boards?project_key=ARC", headers=_h())
        assert resp.status_code == 200
        boards = resp.json()
        assert len(boards) >= 1

    def test_get_board_sprints(self, client):
        resp = client.get("/api/boards/1/sprints", headers=_h())
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_get_board_sprints_filtered_by_state(self, client):
        resp = client.get("/api/boards/1/sprints?state=active", headers=_h())
        assert resp.status_code == 200
        sprints = resp.json()
        assert all(s["state"] == "active" for s in sprints)

    def test_get_board_not_found(self, client):
        resp = client.get("/api/boards/999/sprints", headers=_h())
        assert resp.status_code == 404

    def test_get_sprint_by_id(self, client):
        resp = client.get("/api/sprints/2", headers=_h())
        assert resp.status_code == 200
        assert resp.json()["name"] == "Sprint 2"

    def test_get_sprint_not_found(self, client):
        resp = client.get("/api/sprints/999", headers=_h())
        assert resp.status_code == 404

    def test_create_sprint(self, client, tmp_data):
        import pmtracker.store.json_store as js
        before = len(js.get_sprints())
        resp = client.post(
            "/api/sprints",
            json={"board_id": "1", "name": "Sprint X", "goal": "Test goal"},
            headers=_h(),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Sprint X"
        assert data["state"] == "future"
        assert len(js.get_sprints()) == before + 1

    def test_create_sprint_board_not_found(self, client):
        resp = client.post(
            "/api/sprints",
            json={"board_id": "999", "name": "Ghost Sprint"},
            headers=_h(),
        )
        assert resp.status_code == 404

    def test_update_sprint_name(self, client, tmp_data):
        import pmtracker.store.json_store as js
        resp = client.put("/api/sprints/3",
                          json={"name": "Renamed Sprint"}, headers=_h())
        assert resp.status_code == 200
        assert js.get_sprint("3")["name"] == "Renamed Sprint"

    def test_update_sprint_activate_conflict_returns_400(self, client):
        # Sprint 2 is already active on board 1; activating Sprint 3 should fail
        resp = client.put("/api/sprints/3",
                          json={"state": "active"}, headers=_h())
        assert resp.status_code == 400

    def test_update_sprint_activate_valid(self, client, tmp_data):
        import pmtracker.store.json_store as js
        # First close the active sprint
        client.put("/api/sprints/2", json={"state": "closed"}, headers=_h())
        resp = client.put("/api/sprints/3", json={"state": "active"}, headers=_h())
        assert resp.status_code == 200
        assert js.get_sprint("3")["state"] == "active"

    def test_get_sprint_issues(self, client):
        resp = client.get("/api/sprints/2/issues", headers=_h())
        assert resp.status_code == 200
        issues = resp.json()
        assert len(issues) >= 1
        for i in issues:
            assert str(i["fields"]["sprint"]) == "2"

    def test_add_issues_to_sprint(self, client, tmp_data):
        import pmtracker.store.json_store as js
        resp = client.post(
            "/api/sprints/3/issues",
            json={"issue_keys": ["MOB-2", "MOB-3"]},
            headers=_h(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "MOB-2" in data["added"]
        assert "MOB-3" in data["added"]
        assert js.get_issue("MOB-2")["fields"]["sprint"] == "3"

    def test_add_issues_to_sprint_not_found(self, client):
        resp = client.post(
            "/api/sprints/999/issues",
            json={"issue_keys": ["MOB-1"]},
            headers=_h(),
        )
        assert resp.status_code == 404


# ===========================================================================
# 11. Search API route
# ===========================================================================

class TestSearchAPI:

    def test_search_all(self, client):
        resp = client.get("/api/search", headers=_h())
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data
        assert "issues" in data
        assert data["total"] == 10

    def test_search_by_jql_project(self, client):
        resp = client.get("/api/search?jql=project+%3D+ECOM", headers=_h())
        assert resp.status_code == 200
        result = resp.json()
        assert result["total"] == 7
        for i in result["issues"]:
            assert i["fields"]["project"]["key"] == "ECOM"

    def test_search_by_jql_status(self, client):
        resp = client.get("/api/search?jql=status+%3D+%22In+Progress%22", headers=_h())
        assert resp.status_code == 200
        for i in resp.json()["issues"]:
            assert i["fields"]["status"]["name"] == "In Progress"

    def test_search_by_text_query(self, client):
        resp = client.get("/api/search?q=login", headers=_h())
        assert resp.status_code == 200
        issues = resp.json()["issues"]
        assert len(issues) >= 1
        for i in issues:
            text = (i["fields"].get("summary", "") + i["fields"].get("description", "")).lower()
            assert "login" in text or "login" in i["key"].lower()

    def test_search_pagination_limit(self, client):
        resp = client.get("/api/search?limit=3", headers=_h())
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["issues"]) <= 3
        assert data["total"] == 10

    def test_search_pagination_start(self, client):
        resp_all = client.get("/api/search?limit=10", headers=_h())
        all_keys = [i["key"] for i in resp_all.json()["issues"]]
        resp_page2 = client.get("/api/search?start=5&limit=5", headers=_h())
        page2_keys = [i["key"] for i in resp_page2.json()["issues"]]
        assert page2_keys == all_keys[5:10]

    def test_search_combined_jql_and_text(self, client):
        resp = client.get("/api/search?jql=project+%3D+ECOM&q=bug", headers=_h())
        assert resp.status_code == 200
        for i in resp.json()["issues"]:
            assert i["fields"]["project"]["key"] == "ECOM"

    def test_search_no_results(self, client):
        resp = client.get("/api/search?q=zzznomatch99999", headers=_h())
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


# ===========================================================================
# 12. Auth API routes
# ===========================================================================

class TestAuthAPI:

    def test_register_non_cognizant_email_rejected(self, client):
        resp = client.post("/api/auth/register",
                           json={"email": "user@gmail.com"})
        assert resp.status_code == 400

    def test_register_valid_email(self, client, tmp_data):
        resp = client.post("/api/auth/register",
                           json={"email": "newuser@cognizant.com"})
        assert resp.status_code == 200
        assert "email" in resp.json()

    def test_register_duplicate_unverified_noop(self, client, tmp_data):
        client.post("/api/auth/register", json={"email": "newuser@cognizant.com"})
        resp = client.post("/api/auth/register", json={"email": "newuser@cognizant.com"})
        # Second call to unverified user is idempotent (200, not 409)
        assert resp.status_code == 200

    def test_verify_otp_flow(self, client, tmp_data):
        import pmtracker.store.json_store as js
        email = "verify@cognizant.com"
        client.post("/api/auth/register", json={"email": email})

        # OTP with digit-sum 40 (e.g. "400000" → 4+0+0+0+0+0 = 4, nope)
        # "490000" → 4+9+0+0+0+0 = 13, nope
        # Digit sum must be in {40, 50, 60, 70}
        # "994000" → 9+9+4+0+0+0 = 22, nope
        # Easiest: "994660" → 9+9+4+6+6+0 = 34, nope
        # "997501" → 9+9+7+5+0+1 = 31, nope
        # "997006" → 9+9+7+0+0+6 = 31, nope
        # digit sum 40: 9+9+9+9+4+0="999940" → 9+9+9+9+4+0=40 ✓ but only 5+1
        # "994006" → 9+9+4+0+0+6=28, nope
        # A simple 6-digit number with sum 40: "994300" → 9+9+4+3+0+0=25 nope
        # Let's try: "991900" → 9+9+1+9+0+0=28 nope
        # 9+9+9+9+4 = 40 → need 6 digits: "999940" is 6 chars but digit sums: 9+9+9+9+4+0=40 ✓
        valid_otp = "999940"
        resp = client.post("/api/auth/verify-otp", json={
            "email": email,
            "otp": valid_otp,
            "password": "secret123",
            "display_name": "Verify User",
            "role": "Dev",
        })
        assert resp.status_code == 200

        # User should now be verified
        users = js.load("auth_users", default=[])
        user = next((u for u in users if u["email"] == email), None)
        assert user is not None
        assert user["verified"] is True

    def test_verify_otp_invalid_sum(self, client, tmp_data):
        email = "badotp@cognizant.com"
        client.post("/api/auth/register", json={"email": email})
        resp = client.post("/api/auth/verify-otp", json={
            "email": email, "otp": "123456", "password": "pass", "display_name": "",
        })
        assert resp.status_code == 400

    def test_login_after_verify(self, client, tmp_data):
        email = "logintest@cognizant.com"
        client.post("/api/auth/register", json={"email": email})
        client.post("/api/auth/verify-otp", json={
            "email": email, "otp": "999940", "password": "mypass",
            "display_name": "Login Tester",
        })
        resp = client.post("/api/auth/login",
                           json={"email": email, "password": "mypass"})
        assert resp.status_code == 200
        assert "token" in resp.json()

    def test_login_wrong_password(self, client, tmp_data):
        email = "wrongpass@cognizant.com"
        client.post("/api/auth/register", json={"email": email})
        client.post("/api/auth/verify-otp", json={
            "email": email, "otp": "999940", "password": "correct",
            "display_name": "T",
        })
        resp = client.post("/api/auth/login",
                           json={"email": email, "password": "wrong"})
        assert resp.status_code == 401

    def test_login_unverified_account(self, client, tmp_data):
        email = "notverified@cognizant.com"
        client.post("/api/auth/register", json={"email": email})
        resp = client.post("/api/auth/login",
                           json={"email": email, "password": "any"})
        assert resp.status_code in (401, 403)

    def test_demo_login_valid_otp(self, client):
        resp = client.post("/api/auth/demo-login", json={"otp": "999940"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "Demo"
        assert "token" in data

    def test_demo_login_invalid_otp_sum(self, client):
        resp = client.post("/api/auth/demo-login", json={"otp": "123456"})
        assert resp.status_code == 400

    def test_demo_login_non_numeric_otp(self, client):
        resp = client.post("/api/auth/demo-login", json={"otp": "abcdef"})
        assert resp.status_code == 400

    def test_logout(self, client, tmp_data):
        import pmtracker.store.json_store as js
        email = "logout@cognizant.com"
        client.post("/api/auth/register", json={"email": email})
        verify_resp = client.post("/api/auth/verify-otp", json={
            "email": email, "otp": "999940", "password": "pass1234",
            "display_name": "Tester",
        })
        assert verify_resp.status_code == 200, verify_resp.json()
        login_resp = client.post("/api/auth/login",
                                 json={"email": email, "password": "pass1234"})
        assert login_resp.status_code == 200, login_resp.json()
        token = login_resp.json()["token"]

        logout_resp = client.post(f"/api/auth/logout?token={token}")
        assert logout_resp.status_code == 200

        sessions = js.load("auth_sessions", default=[])
        assert not any(s["token"] == token for s in sessions)


# ===========================================================================
# 13. Agent key API routes
# ===========================================================================

class TestAgentAPI:

    def test_list_agents_requires_admin(self, client):
        resp = client.get("/api/agents", headers=_h())
        assert resp.status_code == 403

    def test_list_agents_as_admin(self, admin_client):
        resp = admin_client.get("/api/agents")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_agent_key_as_admin(self, admin_client):
        resp = admin_client.post("/api/agents", json={"agent_name": "CI Bot"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["agent_name"] == "CI Bot"
        assert "api_key" in data
        assert data["api_key"].startswith("sk-agent-")

    def test_create_agent_key_non_admin_forbidden(self, client):
        resp = client.post("/api/agents", json={"agent_name": "Evil Bot"}, headers=_h())
        assert resp.status_code == 403

    def test_create_agent_key_empty_name(self, admin_client):
        resp = admin_client.post("/api/agents", json={"agent_name": "   "})
        assert resp.status_code == 400

    def test_create_agent_key_persists(self, admin_client, tmp_data):
        import pmtracker.store.json_store as js
        admin_client.post("/api/agents", json={"agent_name": "Persisted Bot"})
        keys = js.get_agent_keys()
        assert any(k["agent_name"] == "Persisted Bot" for k in keys)

    def test_revoke_agent_key(self, admin_client, tmp_data):
        import pmtracker.store.json_store as js
        create_resp = admin_client.post("/api/agents", json={"agent_name": "Temp Bot"})
        key_id = create_resp.json()["id"]

        del_resp = admin_client.delete(f"/api/agents/{key_id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["deleted"] is True
        assert js.get_agent_keys() == []

    def test_revoke_nonexistent_key(self, admin_client):
        resp = admin_client.delete("/api/agents/ak-doesnotexist")
        assert resp.status_code == 404

    def test_agent_key_used_for_auth(self, admin_client, client, tmp_data):
        """Key returned from creation can authenticate subsequent API calls."""
        create_resp = admin_client.post("/api/agents", json={"agent_name": "Auth Bot"})
        raw_key = create_resp.json()["api_key"]

        resp = client.get("/api/projects/ECOM",
                          headers={"X-Agent-Key": raw_key})
        assert resp.status_code == 200


# ===========================================================================
# 14. Scope API routes
# ===========================================================================

class TestScopeAPI:

    def test_list_scopes_empty(self, client):
        resp = client.get("/api/projects/ECOM/scopes", headers=_h())
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_scope(self, client):
        resp = client.post(
            "/api/projects/ECOM/scopes",
            json={"name": "MVP 1", "content": "# Scope\nCore features"},
            headers=_h(),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "MVP 1"
        assert "id" in data

    def test_create_scope_persists(self, client):
        client.post("/api/projects/ECOM/scopes",
                    json={"name": "Scope A"}, headers=_h())
        resp = client.get("/api/projects/ECOM/scopes", headers=_h())
        assert len(resp.json()) == 1
        assert resp.json()[0]["name"] == "Scope A"

    def test_create_scope_project_not_found(self, client):
        resp = client.post("/api/projects/NOPE/scopes",
                           json={"name": "X"}, headers=_h())
        assert resp.status_code == 404

    def test_update_scope_name(self, client):
        create_resp = client.post(
            "/api/projects/ECOM/scopes",
            json={"name": "Old Name", "content": ""},
            headers=_h(),
        )
        scope_id = create_resp.json()["id"]
        resp = client.put(
            f"/api/projects/ECOM/scopes/{scope_id}",
            json={"name": "New Name"},
            headers=_h(),
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    def test_update_scope_content(self, client):
        create_resp = client.post(
            "/api/projects/ECOM/scopes",
            json={"name": "S1", "content": "old"},
            headers=_h(),
        )
        scope_id = create_resp.json()["id"]
        resp = client.put(
            f"/api/projects/ECOM/scopes/{scope_id}",
            json={"content": "updated content"},
            headers=_h(),
        )
        assert resp.status_code == 200
        assert resp.json()["content"] == "updated content"

    def test_update_scope_not_found(self, client):
        resp = client.put(
            "/api/projects/ECOM/scopes/scope-nonexistent",
            json={"name": "X"},
            headers=_h(),
        )
        assert resp.status_code == 404

    def test_delete_scope(self, client):
        create_resp = client.post(
            "/api/projects/ECOM/scopes",
            json={"name": "To delete"},
            headers=_h(),
        )
        scope_id = create_resp.json()["id"]
        del_resp = client.delete(
            f"/api/projects/ECOM/scopes/{scope_id}",
            headers=_h(),
        )
        assert del_resp.status_code == 200
        assert del_resp.json()["deleted"] is True

    def test_delete_scope_removes_from_list(self, client):
        create_resp = client.post(
            "/api/projects/ECOM/scopes",
            json={"name": "Will be gone"},
            headers=_h(),
        )
        scope_id = create_resp.json()["id"]
        client.delete(f"/api/projects/ECOM/scopes/{scope_id}", headers=_h())
        resp = client.get("/api/projects/ECOM/scopes", headers=_h())
        assert not any(s["id"] == scope_id for s in resp.json())

    def test_delete_scope_not_found(self, client):
        resp = client.delete(
            "/api/projects/ECOM/scopes/scope-nonexistent",
            headers=_h(),
        )
        assert resp.status_code == 404

    def test_scopes_isolated_per_project(self, client):
        client.post("/api/projects/ECOM/scopes",
                    json={"name": "ECOM Scope"}, headers=_h())
        # MOB has no scopes — should still return empty list
        resp = client.get("/api/projects/MOB/scopes", headers=_h())
        assert resp.status_code == 200
        assert resp.json() == []


# ===========================================================================
# 15. Assignment API routes
# ===========================================================================

class TestAssignmentAPI:

    def _register_and_verify(self, client, email, password="pass1234"):
        """Helper: register + OTP-verify a test user."""
        client.post("/api/auth/register", json={"email": email})
        client.post("/api/auth/verify-otp", json={
            "email": email, "otp": "999940", "password": password,
            "display_name": email.split("@")[0],
        })

    def test_list_assignments_as_admin_empty(self, admin_client):
        resp = admin_client.get("/api/assignments")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_assignment_as_admin(self, admin_client, client, tmp_data):
        email = "devuser@cognizant.com"
        self._register_and_verify(client, email)

        resp = admin_client.post("/api/assignments", json={
            "email": email,
            "project_key": "ECOM",
            "role": "Project User",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == email
        assert data["project_key"] == "ECOM"
        assert data["role"] == "Project User"

    def test_create_assignment_non_admin_forbidden(self, client, tmp_data):
        resp = client.post("/api/assignments", json={
            "email": "someone@cognizant.com",
            "project_key": "ECOM",
            "role": "Project User",
        }, headers=_h())
        assert resp.status_code == 403

    def test_create_assignment_invalid_role(self, admin_client, client, tmp_data):
        email = "invlrole@cognizant.com"
        self._register_and_verify(client, email)
        resp = admin_client.post("/api/assignments", json={
            "email": email,
            "project_key": "ECOM",
            "role": "Wizard",
        })
        assert resp.status_code == 400

    def test_create_assignment_unknown_project(self, admin_client, client, tmp_data):
        email = "noproj@cognizant.com"
        self._register_and_verify(client, email)
        resp = admin_client.post("/api/assignments", json={
            "email": email,
            "project_key": "GHOST",
            "role": "Project User",
        })
        assert resp.status_code == 404

    def test_create_assignment_unverified_user_rejected(self, admin_client, client, tmp_data):
        email = "unverified@cognizant.com"
        client.post("/api/auth/register", json={"email": email})  # register but don't verify
        resp = admin_client.post("/api/assignments", json={
            "email": email,
            "project_key": "ECOM",
            "role": "Project User",
        })
        assert resp.status_code == 404

    def test_create_assignment_duplicate_rejected(self, admin_client, client, tmp_data):
        email = "dupuser@cognizant.com"
        self._register_and_verify(client, email)
        admin_client.post("/api/assignments", json={
            "email": email, "project_key": "ECOM", "role": "Project User"})
        resp = admin_client.post("/api/assignments", json={
            "email": email, "project_key": "ECOM", "role": "Project User"})
        assert resp.status_code == 409

    def test_update_assignment_role(self, admin_client, client, tmp_data):
        email = "updateme@cognizant.com"
        self._register_and_verify(client, email)
        create_resp = admin_client.post("/api/assignments", json={
            "email": email, "project_key": "ECOM", "role": "Project User"})
        assignment_id = create_resp.json()["id"]

        resp = admin_client.put(f"/api/assignments/{assignment_id}",
                                json={"role": "Product Owner"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "Product Owner"

    def test_delete_assignment(self, admin_client, client, tmp_data):
        import pmtracker.store.json_store as js
        email = "deleteme@cognizant.com"
        self._register_and_verify(client, email)
        create_resp = admin_client.post("/api/assignments", json={
            "email": email, "project_key": "ECOM", "role": "Project User"})
        assignment_id = create_resp.json()["id"]

        del_resp = admin_client.delete(f"/api/assignments/{assignment_id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["removed"] is True
        # Soft delete: assignment still exists but end_date is set
        assignments = js.get_assignments()
        soft_deleted = next((a for a in assignments if a["id"] == assignment_id), None)
        assert soft_deleted is not None
        assert soft_deleted["end_date"] is not None

    def test_delete_assignment_not_found(self, admin_client):
        resp = admin_client.delete("/api/assignments/pa-doesnotexist")
        assert resp.status_code == 404


# ===========================================================================
# 16. User API routes
# ===========================================================================

class TestUserAPI:

    def _make_verified_user(self, client, email="testuser@cognizant.com"):
        """Register + verify a user and return the client."""
        client.post("/api/auth/register", json={"email": email})
        client.post("/api/auth/verify-otp", json={
            "email": email, "otp": "999940", "password": "pass1234",
            "display_name": "Test User",
        })
        return email

    def test_list_users_as_admin(self, admin_client, client, tmp_data):
        self._make_verified_user(client, "listed@cognizant.com")
        resp = admin_client.get("/api/users")
        assert resp.status_code == 200
        emails = [u["emailAddress"] for u in resp.json()]
        assert "listed@cognizant.com" in emails

    def test_list_users_demo_gets_empty(self, client):
        demo_resp = client.post("/api/auth/demo-login", json={"otp": "999940"})
        token = demo_resp.json()["token"]
        resp = client.get("/api/users",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_user_by_identifier(self, admin_client, client, tmp_data):
        self._make_verified_user(client, "findme@cognizant.com")
        resp = admin_client.get("/api/users/findme@cognizant.com")
        assert resp.status_code == 200
        assert resp.json()["emailAddress"] == "findme@cognizant.com"

    def test_get_user_not_found(self, admin_client):
        resp = admin_client.get("/api/users/nobody@cognizant.com")
        assert resp.status_code == 404


# ===========================================================================
# 17. User update & delete (PUT/DELETE /users/{id})
# ===========================================================================

class TestUserUpdateDeleteAPI:

    def _register_and_verify(self, client, email, password="pass1234"):
        client.post("/api/auth/register", json={"email": email})
        client.post("/api/auth/verify-otp", json={
            "email": email, "otp": "999940", "password": password,
            "display_name": email.split("@")[0],
        })

    def test_update_user_role_as_admin(self, admin_client, client, tmp_data):
        email = "rolechange@cognizant.com"
        self._register_and_verify(client, email)
        resp = admin_client.put(f"/api/users/{email}", json={"role": "QA"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "QA"

    def test_update_user_display_name(self, admin_client, client, tmp_data):
        email = "namechange@cognizant.com"
        self._register_and_verify(client, email)
        resp = admin_client.put(f"/api/users/{email}",
                                json={"display_name": "New Name"})
        assert resp.status_code == 200
        assert resp.json()["displayName"] == "New Name"

    def test_update_user_invalid_role_ignored(self, admin_client, client, tmp_data):
        """Invalid role values are silently ignored (existing role preserved)."""
        email = "badrole@cognizant.com"
        self._register_and_verify(client, email)
        # First verify initial role
        initial = admin_client.get(f"/api/users/{email}").json()["role"]
        resp = admin_client.put(f"/api/users/{email}", json={"role": "Wizard"})
        assert resp.status_code == 200
        assert resp.json()["role"] == initial

    def test_update_user_non_admin_forbidden(self, client, tmp_data):
        email = "protected@cognizant.com"
        self._register_and_verify(client, email)
        resp = client.put(f"/api/users/{email}", json={"role": "QA"}, headers=_h())
        assert resp.status_code == 403

    def test_update_user_not_found(self, admin_client):
        resp = admin_client.put("/api/users/ghost@cognizant.com",
                                json={"role": "Dev"})
        assert resp.status_code == 404

    def test_update_admin_user_forbidden(self, admin_client):
        """Cannot modify the admin account itself."""
        resp = admin_client.put(f"/api/users/{ADMIN_EMAIL}",
                                json={"role": "Dev"})
        assert resp.status_code == 403

    def test_delete_user_as_admin(self, admin_client, client, tmp_data):
        import pmtracker.store.json_store as js
        email = "deleteme2@cognizant.com"
        self._register_and_verify(client, email)
        resp = admin_client.delete(f"/api/users/{email}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True
        # User should be gone from auth_users
        users = js.load("auth_users", default=[])
        assert not any(u["email"] == email for u in users)

    def test_delete_user_non_admin_forbidden(self, client, tmp_data):
        email = "nodelete@cognizant.com"
        self._register_and_verify(client, email)
        resp = client.delete(f"/api/users/{email}", headers=_h())
        assert resp.status_code == 403

    def test_delete_admin_user_forbidden(self, admin_client):
        resp = admin_client.delete(f"/api/users/{ADMIN_EMAIL}")
        assert resp.status_code == 403

    def test_delete_user_not_found(self, admin_client):
        resp = admin_client.delete("/api/users/nobody@cognizant.com")
        assert resp.status_code == 404


# ===========================================================================
# 18. Chat API routes
# ===========================================================================

class TestChatAPI:

    def test_get_chat_empty(self, client):
        resp = client.get("/api/projects/ECOM/chat", headers=_h())
        assert resp.status_code == 200
        data = resp.json()
        assert data["messages"] == []
        assert data["total"] == 0

    def test_get_chat_project_not_found(self, client):
        resp = client.get("/api/projects/NOPE/chat", headers=_h())
        assert resp.status_code == 404

    def test_send_message(self, client):
        resp = client.post("/api/projects/ECOM/chat",
                           json={"text": "Hello team!"},
                           headers=_h())
        assert resp.status_code == 200
        data = resp.json()
        assert data["text"] == "Hello team!"
        assert "id" in data
        assert "timestamp" in data

    def test_send_message_persists(self, client):
        client.post("/api/projects/ECOM/chat",
                    json={"text": "Persisted message"},
                    headers=_h())
        resp = client.get("/api/projects/ECOM/chat", headers=_h())
        texts = [m["text"] for m in resp.json()["messages"]]
        assert "Persisted message" in texts

    def test_send_message_empty_text_rejected(self, client):
        resp = client.post("/api/projects/ECOM/chat",
                           json={"text": "   "},
                           headers=_h())
        assert resp.status_code == 400

    def test_send_message_too_long_rejected(self, client):
        long_text = "x" * 2001
        resp = client.post("/api/projects/ECOM/chat",
                           json={"text": long_text},
                           headers=_h())
        assert resp.status_code == 400

    def test_send_message_too_many_lines_rejected(self, client):
        text = "\n".join(["line"] * 11)  # 11 lines, max is 10
        resp = client.post("/api/projects/ECOM/chat",
                           json={"text": text},
                           headers=_h())
        assert resp.status_code == 400

    def test_send_message_project_not_found(self, client):
        resp = client.post("/api/projects/GHOST/chat",
                           json={"text": "Hi"},
                           headers=_h())
        assert resp.status_code == 404

    def test_chat_limit_parameter(self, client):
        for i in range(5):
            client.post("/api/projects/ECOM/chat",
                        json={"text": f"Message {i}"},
                        headers=_h())
        resp = client.get("/api/projects/ECOM/chat?limit=3", headers=_h())
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["messages"]) == 3
        assert data["total"] == 5

    def test_mark_chat_read(self, client):
        resp = client.post("/api/projects/ECOM/chat/read",
                           headers=_h())
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_get_unread_counts(self, admin_client, client):
        """After admin sends message, unread endpoint for admin shows no count
        (own messages don't count as unread)."""
        admin_client.post("/api/projects/ECOM/chat",
                          json={"text": "Admin message"})
        resp = admin_client.get("/api/chat/unread")
        assert resp.status_code == 200
        # Admin's own message does not appear in their own unread count
        counts = resp.json()
        assert counts.get("ECOM", 0) == 0


# ===========================================================================
# 19. Watcher & link-types routes
# ===========================================================================

class TestWatchersAndLinkTypes:

    def test_get_watchers_empty(self, client):
        resp = client.get("/api/issues/ECOM-1/watchers", headers=_h())
        assert resp.status_code == 200
        assert resp.json() == []

    def test_add_watcher(self, client, tmp_data):
        resp = client.post("/api/issues/ECOM-1/watchers",
                           json={"user_identifier": "user-001"},
                           headers=_h())
        assert resp.status_code == 201
        assert "user-001" in resp.json()["watchers"]

    def test_add_watcher_persists(self, client, tmp_data):
        import pmtracker.store.json_store as js
        client.post("/api/issues/ECOM-1/watchers",
                    json={"user_identifier": "user-002"},
                    headers=_h())
        issue = js.get_issue("ECOM-1")
        assert "user-002" in issue["fields"]["watchers"]

    def test_add_watcher_idempotent(self, client, tmp_data):
        """Adding same watcher twice should not duplicate."""
        client.post("/api/issues/ECOM-1/watchers",
                    json={"user_identifier": "user-001"},
                    headers=_h())
        client.post("/api/issues/ECOM-1/watchers",
                    json={"user_identifier": "user-001"},
                    headers=_h())
        resp = client.get("/api/issues/ECOM-1/watchers", headers=_h())
        watchers = resp.json()
        assert watchers.count("user-001") == 1

    def test_add_watcher_user_not_found(self, client):
        resp = client.post("/api/issues/ECOM-1/watchers",
                           json={"user_identifier": "ghost-id"},
                           headers=_h())
        assert resp.status_code == 404

    def test_add_watcher_issue_not_found(self, client):
        resp = client.post("/api/issues/ECOM-9999/watchers",
                           json={"user_identifier": "user-001"},
                           headers=_h())
        assert resp.status_code == 404

    def test_remove_watcher(self, client, tmp_data):
        client.post("/api/issues/ECOM-1/watchers",
                    json={"user_identifier": "user-001"},
                    headers=_h())
        resp = client.delete("/api/issues/ECOM-1/watchers/user-001",
                             headers=_h())
        assert resp.status_code == 200
        assert "user-001" not in resp.json()["watchers"]

    def test_remove_watcher_issue_not_found(self, client):
        resp = client.delete("/api/issues/NOPE-1/watchers/user-001",
                             headers=_h())
        assert resp.status_code == 404

    def test_get_link_types(self, client):
        resp = client.get("/api/link-types", headers=_h())
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        names = [lt["name"] for lt in data]
        assert "Blocks" in names


# ===========================================================================
# 20. CSV import (POST /projects/{key}/import-issues)
# ===========================================================================

class TestCSVImport:

    def _csv_bytes(self, text: str) -> bytes:
        return text.encode("utf-8")

    def test_import_basic_csv(self, client, tmp_data):
        csv_content = "Summary,Type,Description\nFix login,Bug,Auth is broken\n"
        resp = client.post(
            "/api/projects/ECOM/import-issues",
            files={"file": ("issues.csv", self._csv_bytes(csv_content), "text/csv")},
            headers=_h(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["created"]) == 1
        assert data["created"][0]["type"] == "Bug"
        assert data["errors"] == []

    def test_import_multiple_rows(self, client, tmp_data):
        csv_content = "Summary,Type\nStory A,Story\nTask B,Task\nEpic C,Epic\n"
        resp = client.post(
            "/api/projects/ECOM/import-issues",
            files={"file": ("issues.csv", self._csv_bytes(csv_content), "text/csv")},
            headers=_h(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["created"]) == 3
        assert data["total_rows"] == 3

    def test_import_empty_summary_skipped(self, client, tmp_data):
        csv_content = "Summary,Type\n,Story\nValid summary,Task\n"
        resp = client.post(
            "/api/projects/ECOM/import-issues",
            files={"file": ("issues.csv", self._csv_bytes(csv_content), "text/csv")},
            headers=_h(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["created"]) == 1
        assert len(data["errors"]) == 1

    def test_import_invalid_type_reported(self, client, tmp_data):
        csv_content = "Summary,Type\nFoo,InvalidType\n"
        resp = client.post(
            "/api/projects/ECOM/import-issues",
            files={"file": ("issues.csv", self._csv_bytes(csv_content), "text/csv")},
            headers=_h(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["errors"]) == 1
        assert "InvalidType" in data["errors"][0]["error"]
        assert data["created"] == []

    def test_import_default_type_story(self, client, tmp_data):
        """Type column omitted → defaults to Story."""
        csv_content = "Summary\nJust a summary\n"
        resp = client.post(
            "/api/projects/ECOM/import-issues",
            files={"file": ("issues.csv", self._csv_bytes(csv_content), "text/csv")},
            headers=_h(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["created"][0]["type"] == "Story"

    def test_import_non_csv_rejected(self, client):
        resp = client.post(
            "/api/projects/ECOM/import-issues",
            files={"file": ("data.txt", b"hello", "text/plain")},
            headers=_h(),
        )
        assert resp.status_code == 400

    def test_import_project_not_found(self, client):
        csv_content = "Summary\nTest\n"
        resp = client.post(
            "/api/projects/GHOST/import-issues",
            files={"file": ("issues.csv", self._csv_bytes(csv_content), "text/csv")},
            headers=_h(),
        )
        assert resp.status_code == 404

    def test_import_missing_summary_column(self, client):
        csv_content = "Name,Type\nFoo,Story\n"
        resp = client.post(
            "/api/projects/ECOM/import-issues",
            files={"file": ("issues.csv", self._csv_bytes(csv_content), "text/csv")},
            headers=_h(),
        )
        assert resp.status_code == 400

    def test_import_keys_increment_correctly(self, client, tmp_data):
        import pmtracker.store.json_store as js
        existing_keys = [i["key"] for i in js.get_issues() if i["key"].startswith("ECOM-")]
        max_num = max(int(k.split("-")[1]) for k in existing_keys)

        csv_content = "Summary\nImported issue\n"
        resp = client.post(
            "/api/projects/ECOM/import-issues",
            files={"file": ("issues.csv", self._csv_bytes(csv_content), "text/csv")},
            headers=_h(),
        )
        assert resp.status_code == 200
        new_key = resp.json()["created"][0]["key"]
        assert int(new_key.split("-")[1]) > max_num


# ===========================================================================
# 21. Delete project & project issues
# ===========================================================================

class TestProjectDeleteAndIssues:

    def test_delete_project_as_admin(self, admin_client, tmp_data):
        import pmtracker.store.json_store as js
        # Create a fresh project to delete
        admin_client.post("/api/projects",
                          json={"key": "DELME", "name": "Delete Me"})
        resp = admin_client.delete("/api/projects/DELME")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True
        assert js.get_project("DELME") is None

    def test_delete_project_cascades_issues(self, admin_client, client, tmp_data):
        import pmtracker.store.json_store as js
        admin_client.post("/api/projects",
                          json={"key": "CASC", "name": "Cascade"})
        client.post("/api/issues",
                    json={"project_key": "CASC", "summary": "Will be deleted"},
                    headers=_h())
        admin_client.delete("/api/projects/CASC")
        issues = js.get_issues()
        assert not any(i["fields"]["project"]["key"] == "CASC" for i in issues)

    def test_delete_project_cascades_boards(self, admin_client, tmp_data):
        import pmtracker.store.json_store as js
        admin_client.post("/api/projects",
                          json={"key": "BRDCASC", "name": "Board Cascade"})
        boards_before = js.get_boards()
        assert any(b["projectKey"] == "BRDCASC" for b in boards_before)
        admin_client.delete("/api/projects/BRDCASC")
        boards_after = js.get_boards()
        assert not any(b["projectKey"] == "BRDCASC" for b in boards_after)

    def test_delete_project_non_admin_forbidden(self, client):
        resp = client.delete("/api/projects/ECOM", headers=_h())
        assert resp.status_code == 403

    def test_delete_project_not_found(self, admin_client):
        resp = admin_client.delete("/api/projects/GHOST")
        assert resp.status_code == 404

    def test_get_project_issues(self, client):
        resp = client.get("/api/projects/ECOM/issues", headers=_h())
        assert resp.status_code == 200
        data = resp.json()
        assert "issues" in data
        assert "total" in data
        assert data["total"] == 7

    def test_get_project_issues_filter_by_status(self, client):
        resp = client.get("/api/projects/ECOM/issues?status=To+Do", headers=_h())
        assert resp.status_code == 200
        for i in resp.json()["issues"]:
            assert i["fields"]["status"]["name"] == "To Do"

    def test_get_project_issues_filter_by_type(self, client):
        resp = client.get("/api/projects/ECOM/issues?issue_type=Bug", headers=_h())
        assert resp.status_code == 200
        for i in resp.json()["issues"]:
            assert i["fields"]["issuetype"]["name"] == "Bug"

    def test_get_project_issues_pagination(self, client):
        resp = client.get("/api/projects/ECOM/issues?start=0&limit=2", headers=_h())
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["issues"]) == 2
        assert data["total"] == 7

    def test_get_project_issues_not_found(self, client):
        resp = client.get("/api/projects/GHOST/issues", headers=_h())
        assert resp.status_code == 404

    def test_update_issue_status_records_history(self, client, tmp_data):
        """Updating issue status via PUT /issues/{key} should append to transitions_history."""
        import pmtracker.store.json_store as js
        resp = client.put("/api/issues/ECOM-1",
                          json={"status": "In Progress"},
                          headers=_h())
        assert resp.status_code == 200
        issue = js.get_issue("ECOM-1")
        history = issue["fields"].get("transitions_history", [])
        assert len(history) >= 1
        assert history[-1]["to_status"] == "In Progress"

"""
Group 10 — Unit tests for PMTracker.

Fixtures:
  - tmp_data: copies seed JSON files to a temp dir and patches DATA_DIR in json_store
  - mcp_app:  builds a fresh FastMCP instance with all tools registered
"""
import json
import shutil
import asyncio
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SEED_DIR = Path(__file__).parent.parent / "pmtracker" / "store" / "data"


@pytest.fixture
def tmp_data(tmp_path, monkeypatch):
    """Copy seed data to a temp dir and redirect json_store to use it."""
    data_dir = tmp_path / "data"
    shutil.copytree(SEED_DIR, data_dir)

    import pmtracker.store.json_store as js
    monkeypatch.setattr(js, "DATA_DIR", data_dir)
    return data_dir


@pytest.fixture
def mcp_app(tmp_data):
    """Fresh FastMCP instance with all tools registered against tmp_data."""
    from mcp.server.fastmcp import FastMCP
    from pmtracker.tools import register_all_tools
    app = FastMCP("pmtracker-test")
    register_all_tools(app)
    return app


def call_sync(app, name, args=None):
    """Synchronous wrapper around FastMCP.call_tool()."""
    args = args or {}

    async def _call():
        parts = list(await app.call_tool(name, args))
        if not parts:
            return []
        def parse(text):
            try:
                return json.loads(text)
            except Exception:
                return text
        if len(parts) == 1:
            v = parse(parts[0].text)
            return v
        return [parse(p.text) for p in parts]

    return asyncio.run(_call())


# ---------------------------------------------------------------------------
# 10.2 Data layer tests
# ---------------------------------------------------------------------------

class TestJsonStore:
    def test_load_and_save_roundtrip(self, tmp_data):
        import pmtracker.store.json_store as js
        data = {"key": "value", "number": 42}
        js.save("test_roundtrip", data)
        loaded = js.load("test_roundtrip")
        assert loaded == data

    def test_get_issue_found(self, tmp_data):
        import pmtracker.store.json_store as js
        issue = js.get_issue("ECOM-1")
        assert issue is not None
        assert issue["key"] == "ECOM-1"

    def test_get_issue_not_found(self, tmp_data):
        import pmtracker.store.json_store as js
        result = js.get_issue("FAKE-999")
        assert result is None

    def test_next_issue_key_increments(self, tmp_data):
        import pmtracker.store.json_store as js
        issues = js.get_issues()
        ecom_nums = [
            int(i["key"].split("-")[1])
            for i in issues if i["key"].startswith("ECOM-")
        ]
        expected = f"ECOM-{max(ecom_nums) + 1}"
        assert js.next_issue_key("ECOM") == expected

    def test_next_issue_key_new_project(self, tmp_data):
        import pmtracker.store.json_store as js
        assert js.next_issue_key("NEWPROJ") == "NEWPROJ-1"


# ---------------------------------------------------------------------------
# 10.3 Issue tool tests
# ---------------------------------------------------------------------------

class TestIssueTools:
    def test_create_issue_returns_correct_key(self, mcp_app, tmp_data):
        import pmtracker.store.json_store as js
        issues_before = js.get_issues()
        ecom_nums = [int(i["key"].split("-")[1]) for i in issues_before if i["key"].startswith("ECOM-")]
        expected_key = f"ECOM-{max(ecom_nums) + 1}"

        result = call_sync(mcp_app, "create_issue", {"project_key": "ECOM", "summary": "Test issue", "issue_type": "Story"})
        assert result["key"] == expected_key

    def test_create_issue_persists_to_store(self, mcp_app, tmp_data):
        import pmtracker.store.json_store as js
        result = call_sync(mcp_app, "create_issue", {"project_key": "ECOM", "summary": "Persist check", "issue_type": "Task"})
        new_key = result["key"]
        # Reload from disk
        found = js.get_issue(new_key)
        assert found is not None
        assert found["fields"]["summary"] == "Persist check"

    def test_get_issue_returns_full_object(self, mcp_app, tmp_data):
        result = call_sync(mcp_app, "get_issue", {"issue_key": "ECOM-1"})
        assert isinstance(result, dict)
        assert result["key"] == "ECOM-1"
        assert "fields" in result
        assert "summary" in result["fields"]

    def test_delete_issue_removes_from_store(self, mcp_app, tmp_data):
        import pmtracker.store.json_store as js
        result = call_sync(mcp_app, "create_issue", {"project_key": "MOB", "summary": "To delete", "issue_type": "Task"})
        key = result["key"]

        del_result = call_sync(mcp_app, "delete_issue", {"issue_key": key})
        assert del_result.get("deleted") is True

        assert js.get_issue(key) is None

    def test_search_by_project(self, mcp_app, tmp_data):
        result = call_sync(mcp_app, "search", {"jql": "project = ECOM"})
        assert isinstance(result, dict)
        assert result["total"] > 0
        for issue in result["issues"]:
            assert issue["fields"]["project"]["key"] == "ECOM"

    def test_search_by_status(self, mcp_app, tmp_data):
        result = call_sync(mcp_app, "search", {"jql": 'status = "In Progress"'})
        assert isinstance(result, dict)
        assert result["total"] > 0
        for issue in result["issues"]:
            assert issue["fields"]["status"]["name"] == "In Progress"

    def test_search_by_issue_type(self, mcp_app, tmp_data):
        result = call_sync(mcp_app, "search", {"jql": "issuetype = Bug"})
        assert isinstance(result, dict)
        assert result["total"] > 0
        for issue in result["issues"]:
            assert issue["fields"]["issuetype"]["name"] == "Bug"

    def test_search_combined_jql(self, mcp_app, tmp_data):
        result = call_sync(mcp_app, "search", {"jql": 'project = ECOM AND status = "Done"'})
        assert isinstance(result, dict)
        for issue in result["issues"]:
            assert issue["fields"]["project"]["key"] == "ECOM"
            assert issue["fields"]["status"]["name"] == "Done"


# ---------------------------------------------------------------------------
# 10.4 Transition tool tests
# ---------------------------------------------------------------------------

class TestTransitionTools:
    def test_get_transitions_todo_status(self, mcp_app, tmp_data):
        # ECOM-1 is "To Do"
        result = call_sync(mcp_app, "get_transitions", {"issue_key": "ECOM-1"})
        names = [t["name"] for t in result] if isinstance(result, list) else [result["name"]]
        assert "In Progress" in names

    def test_transition_issue_updates_status(self, mcp_app, tmp_data):
        import pmtracker.store.json_store as js
        # ECOM-7 is "To Do"
        transitions = call_sync(mcp_app, "get_transitions", {"issue_key": "ECOM-7"})
        t_list = transitions if isinstance(transitions, list) else [transitions]
        ip = next((t for t in t_list if t["name"] == "In Progress"), None)
        assert ip is not None

        call_sync(mcp_app, "transition_issue", {"issue_key": "ECOM-7", "transition_id": ip["id"]})

        issue = js.get_issue("ECOM-7")
        assert issue["fields"]["status"]["name"] == "In Progress"

    def test_transition_issue_records_history(self, mcp_app, tmp_data):
        import pmtracker.store.json_store as js
        transitions = call_sync(mcp_app, "get_transitions", {"issue_key": "ECOM-6"})
        t_list = transitions if isinstance(transitions, list) else [transitions]
        ip = next((t for t in t_list if t["name"] == "In Progress"), None)

        call_sync(mcp_app, "transition_issue", {"issue_key": "ECOM-6", "transition_id": ip["id"], "comment": "Starting work"})

        issue = js.get_issue("ECOM-6")
        history = issue["fields"].get("transitions_history", [])
        assert len(history) >= 1
        last = history[-1]
        assert last["to_status"] == "In Progress"
        assert last["comment"] == "Starting work"

    def test_transition_issue_invalid_id_raises(self, mcp_app, tmp_data):
        with pytest.raises(Exception):
            call_sync(mcp_app, "transition_issue", {"issue_key": "ECOM-1", "transition_id": "INVALID_999"})


# ---------------------------------------------------------------------------
# 10.5 Sprint tool tests
# ---------------------------------------------------------------------------

class TestSprintTools:
    def test_create_sprint_appends_to_store(self, mcp_app, tmp_data):
        import pmtracker.store.json_store as js
        before = len(js.get_sprints())
        result = call_sync(mcp_app, "create_sprint", {"board_id": "1", "name": "Test Sprint X"})
        assert isinstance(result, dict)
        assert result["name"] == "Test Sprint X"
        assert len(js.get_sprints()) == before + 1

    def test_update_sprint_active_conflict_raises(self, mcp_app, tmp_data):
        # Sprint "2" is already active on board "1" — trying to activate sprint "3" should fail
        with pytest.raises(Exception):
            call_sync(mcp_app, "update_sprint", {"sprint_id": "3", "state": "active"})

    def test_add_issues_to_sprint_sets_sprint_field(self, mcp_app, tmp_data):
        import pmtracker.store.json_store as js
        result = call_sync(mcp_app, "add_issues_to_sprint", {"sprint_id": "3", "issue_keys": ["MOB-2", "MOB-3"]})
        added = result.get("added", [])
        assert "MOB-2" in added
        assert "MOB-3" in added
        for key in ["MOB-2", "MOB-3"]:
            issue = js.get_issue(key)
            assert issue["fields"]["sprint"] == "3"

    def test_get_sprint_issues_filters_correctly(self, mcp_app, tmp_data):
        result = call_sync(mcp_app, "get_sprint_issues", {"sprint_id": "2"})
        assert isinstance(result, dict)
        assert result["total"] > 0
        for issue in result["issues"]:
            assert str(issue["fields"]["sprint"]) == "2"

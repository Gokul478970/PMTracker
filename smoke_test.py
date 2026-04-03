"""Group 9 smoke tests - run all 9.x scenarios programmatically via FastMCP.call_tool()."""
import asyncio
import json
import sys

from mcp.server.fastmcp import FastMCP
from pmtracker.tools import register_all_tools

mcp = FastMCP("pmtracker-smoke")
register_all_tools(mcp)

PASS = []
FAIL = []


async def call(name, args=None):
    args = args or {}
    parts = list(await mcp.call_tool(name, args))
    if not parts:
        return []

    def parse(text):
        try:
            return json.loads(text)
        except Exception:
            return text

    if len(parts) == 1:
        v = parse(parts[0].text)
        if isinstance(v, list):
            return v
        return v
    return [parse(p.text) for p in parts]


def check(label, condition, detail=""):
    if condition:
        PASS.append(label)
        print(f"  PASS  {label}")
    else:
        FAIL.append(label)
        print(f"  FAIL  {label}  {detail}")


async def main():
    # Setup: reset versions so the test is idempotent
    from pmtracker.store import json_store as _store
    _projs = _store.get_projects()
    for _p in _projs:
        _p["versions"] = []
    _store.save_projects(_projs)

    # ------------------------------------------------------------------ 9.1
    print("\n=== 9.1 Projects ===")
    projects = await call("get_all_projects")
    check("get_all_projects returns 2", isinstance(projects, list) and len(projects) == 2)

    versions = await call("get_project_versions", {"project_key": "ECOM"})
    v_before = len(versions) if isinstance(versions, list) else (1 if versions else 0)
    check("ECOM versions initially empty", v_before == 0)

    v = await call("create_version", {"project_key": "ECOM", "name": "v1.0",
                                      "start_date": "2025-03-01", "release_date": "2025-03-31"})
    check("create_version returns dict with name", isinstance(v, dict) and v.get("name") == "v1.0")

    versions2 = await call("get_project_versions", {"project_key": "ECOM"})
    v2_count = len(versions2) if isinstance(versions2, list) else (1 if versions2 else 0)
    check("ECOM versions now has 1", v2_count == v_before + 1)

    # ------------------------------------------------------------------ 9.2
    print("\n=== 9.2 Users ===")
    alice = await call("get_user_profile", {"user_identifier": "alice@example.com"})
    check("get_user_profile Alice", isinstance(alice, dict) and alice.get("displayName") == "Alice Johnson")

    watchers = await call("get_issue_watchers", {"issue_key": "ECOM-1"})
    initial_len = len(watchers) if isinstance(watchers, list) else 0
    await call("add_watcher", {"issue_key": "ECOM-1", "user_identifier": "alice@example.com"})
    watchers2 = await call("get_issue_watchers", {"issue_key": "ECOM-1"})
    w2_count = len(watchers2) if isinstance(watchers2, list) else (1 if watchers2 else 0)
    check("add_watcher adds user", w2_count == initial_len + 1)

    # ------------------------------------------------------------------ 9.3
    print("\n=== 9.3 Issue reads ===")
    issue = await call("get_issue", {"issue_key": "ECOM-1"})
    check("get_issue ECOM-1", isinstance(issue, dict) and issue.get("key") == "ECOM-1")

    result = await call("get_project_issues", {"project_key": "ECOM"})
    check("get_project_issues has issues", isinstance(result, dict) and result.get("total", 0) > 0)

    result2 = await call("search", {"jql": 'project = ECOM AND status = "In Progress"'})
    check("search In Progress issues", isinstance(result2, dict) and result2.get("total", 0) > 0)
    for i in result2.get("issues", []):
        check(f"  {i['key']} status=InProgress", i["fields"]["status"]["name"] == "In Progress")

    result3 = await call("search", {"jql": "issuetype = Bug"})
    check("search Bug issues", isinstance(result3, dict) and result3.get("total", 0) > 0)
    for i in result3.get("issues", []):
        check(f"  {i['key']} is Bug", i["fields"]["issuetype"]["name"] == "Bug")

    # ------------------------------------------------------------------ 9.4
    print("\n=== 9.4 Issue writes ===")
    new_issue = await call("create_issue", {"project_key": "ECOM", "summary": "New test story",
                                            "issue_type": "Story"})
    new_key = new_issue.get("key", "")
    check("create_issue returns ECOM key", new_key.startswith("ECOM-"))

    fetched = await call("get_issue", {"issue_key": new_key})
    check("created issue is fetchable", isinstance(fetched, dict) and fetched.get("key") == new_key)

    updated = await call("update_issue", {"issue_key": new_key, "priority": "Low"})
    check("update_issue priority Low", isinstance(updated, dict) and updated["fields"]["priority"]["name"] == "Low")

    deleted = await call("delete_issue", {"issue_key": new_key})
    check("delete_issue returns deleted=True", isinstance(deleted, dict) and deleted.get("deleted") is True)

    try:
        await call("get_issue", {"issue_key": new_key})
        check("get_issue after delete raises", False, "expected ValueError")
    except Exception:
        check("get_issue after delete raises", True)

    # ------------------------------------------------------------------ 9.5
    print("\n=== 9.5 Comments & worklogs ===")
    cmt = await call("add_comment", {"issue_key": "ECOM-1", "comment": "This is a test comment"})
    check("add_comment returns dict with body", isinstance(cmt, dict) and cmt.get("body") == "This is a test comment")

    issue_after = await call("get_issue", {"issue_key": "ECOM-1"})
    comments = issue_after["fields"]["comment"]["comments"]
    check("comment appears in get_issue", any(c["body"] == "This is a test comment" for c in comments))

    wl = await call("add_worklog", {"issue_key": "ECOM-1", "time_spent": "1h 30m", "comment": "Debugging session"})
    check("add_worklog 1h30m = 5400s", isinstance(wl, dict) and wl.get("timeSpentSeconds") == 5400)

    worklogs = await call("get_worklog", {"issue_key": "ECOM-1"})
    check("get_worklog returns dict", isinstance(worklogs, dict) and worklogs.get("total", 0) >= 1)

    # ------------------------------------------------------------------ 9.6
    print("\n=== 9.6 Transitions ===")
    transitions = await call("get_transitions", {"issue_key": "ECOM-1"})
    check("get_transitions non-empty list", isinstance(transitions, list) and len(transitions) > 0)

    if transitions:
        t_id = transitions[0]["id"]
        result_t = await call("transition_issue", {"issue_key": "ECOM-1", "transition_id": t_id})
        check("transition_issue returns dict", isinstance(result_t, dict) and "new_status" in result_t)

    dates = await call("get_issue_dates", {"issue_key": "ECOM-1"})
    check("get_issue_dates has created", isinstance(dates, dict) and "created" in dates)

    changelogs = await call("batch_get_changelogs", {"issue_keys": ["ECOM-1", "ECOM-2"]})
    check("batch_get_changelogs has ECOM-1", isinstance(changelogs, dict) and "ECOM-1" in changelogs)

    # ------------------------------------------------------------------ 9.7
    print("\n=== 9.7 Sprints & boards ===")
    boards = await call("get_agile_boards")
    check("get_agile_boards total=2", isinstance(boards, dict) and boards.get("total") == 2)

    boards_f = await call("get_agile_boards", {"name": "ECOM"})
    check("get_agile_boards filter name=ECOM total=1", isinstance(boards_f, dict) and boards_f.get("total") == 1)

    sprints = await call("get_sprints_from_board", {"board_id": "1"})
    check("board 1 has >=3 sprints", isinstance(sprints, dict) and sprints.get("total", 0) >= 3)

    active = await call("get_sprints_from_board", {"board_id": "1", "state": "active"})
    check("board 1 active sprint = 1", isinstance(active, dict) and active.get("total") == 1)

    sp2_issues = await call("get_sprint_issues", {"sprint_id": "2"})
    check("sprint 2 has issues", isinstance(sp2_issues, dict) and sp2_issues.get("total", 0) > 0)

    new_sprint = await call("create_sprint", {"board_id": "1", "name": "Sprint 4",
                                              "start_date": "2025-02-03T00:00:00.000Z",
                                              "end_date": "2025-02-17T00:00:00.000Z",
                                              "goal": "Q1 wrap-up"})
    check("create_sprint name=Sprint 4", isinstance(new_sprint, dict) and new_sprint.get("name") == "Sprint 4")
    new_sprint_id = new_sprint.get("id")

    add_r = await call("add_issues_to_sprint", {"sprint_id": new_sprint_id, "issue_keys": ["ECOM-3", "ECOM-6"]})
    check("add_issues_to_sprint adds 2", isinstance(add_r, dict) and len(add_r.get("added", [])) == 2)

    # ------------------------------------------------------------------ 9.8
    print("\n=== 9.8 Linking ===")
    link_types = await call("get_link_types")
    check("get_link_types returns 4", isinstance(link_types, list) and len(link_types) == 4)

    epic_r = await call("link_to_epic", {"issue_key": "ECOM-5", "epic_key": "ECOM-1"})
    check("link_to_epic linked=True", isinstance(epic_r, dict) and epic_r.get("linked") is True)

    link_r = await call("create_issue_link", {"link_type": "Blocks",
                                              "inward_issue_key": "ECOM-3",
                                              "outward_issue_key": "ECOM-4"})
    check("create_issue_link has id", isinstance(link_r, dict) and "id" in link_r)
    link_id = link_r.get("id")

    ecom3 = await call("get_issue", {"issue_key": "ECOM-3"})
    check("ECOM-3 has issueLinks", len(ecom3["fields"].get("issueLinks", [])) > 0)

    if link_id:
        rm = await call("remove_issue_link", {"link_id": link_id})
        check("remove_issue_link deleted=True", isinstance(rm, dict) and rm.get("deleted") is True)

    # ------------------------------------------------------------------ 9.9
    print("\n=== 9.9 Fields & attachments ===")
    flds = await call("search_fields", {"keyword": "story"})
    check("search_fields story returns results", bool(flds))

    all_flds = await call("search_fields", {"keyword": ""})
    check("search_fields empty keyword returns fields", isinstance(all_flds, list) and len(all_flds) > 0)

    sp_opts = await call("get_field_options", {"field_id": "customfield_10001"})
    check("story points options=[1,2,3,5,8,13,21]", sp_opts == [1, 2, 3, 5, 8, 13, 21])

    ep_opts = await call("get_field_options", {"field_id": "customfield_10002"})
    check("epic link options non-empty", isinstance(ep_opts, list) and len(ep_opts) > 0)

    att = await call("download_attachments", {"issue_key": "ECOM-1"})
    check("download_attachments attachments=[]", isinstance(att, dict) and att.get("attachments") == [])

    # ------------------------------------------------------------------ Summary
    total = len(PASS) + len(FAIL)
    print(f"\n{'='*55}")
    print(f"PASSED: {len(PASS)} / {total}")
    if FAIL:
        print(f"FAILED: {len(FAIL)}")
        for f in FAIL:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("ALL SMOKE TESTS PASSED")


asyncio.run(main())

import re
import csv
import io
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from pydantic import BaseModel

from pmtracker.store import json_store
from pmtracker.tools.transitions import STATUS_OBJECTS, TRANSITIONS

router = APIRouter(tags=["issues"])


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


_PRIORITY_MAP = {"Highest": "1", "High": "2", "Medium": "3", "Low": "4", "Lowest": "5"}


class IssueCreate(BaseModel):
    project_key: str
    summary: str
    issue_type: str = "Story"
    description: str = ""
    assignee: str | None = None
    priority: str = "Medium"
    labels: list[str] = []
    components: list[str] = []
    epic_link: str | None = None
    sprint_id: str | None = None
    story_points: int | None = None
    estimate_hours: float | None = None
    parent_key: str | None = None
    fix_versions: list[str] = []


class IssueUpdate(BaseModel):
    summary: str | None = None
    description: str | None = None
    assignee: str | None = None
    priority: str | None = None
    labels: list[str] | None = None
    components: list[str] | None = None
    epic_link: str | None = None
    sprint_id: str | None = None
    story_points: int | None = None
    estimate_hours: float | None = None
    status: str | None = None
    parent_key: str | None = None
    fix_versions: list[str] | None = None
    issue_type: str | None = None


class IssueLinkCreate(BaseModel):
    type: str  # "Blocks", "Relates", "Duplicate"
    target_key: str


@router.get("/issues/{key}")
def get_issue(key: str):
    issue = json_store.get_issue(key)
    if not issue:
        raise HTTPException(404, f"Issue '{key}' not found.")
    return issue


@router.get("/issues/{key}/children")
def get_child_issues(key: str):
    issue = json_store.get_issue(key)
    if not issue:
        raise HTTPException(404, f"Issue '{key}' not found.")
    child_keys = issue["fields"].get("subtasks", [])
    if not child_keys:
        return []
    all_issues = json_store.get_issues()
    return [i for i in all_issues if i["key"] in child_keys]


@router.post("/issues", status_code=201)
def create_issue(body: IssueCreate):
    project_key = body.project_key.upper()
    project = json_store.get_project(project_key)
    if not project:
        raise HTTPException(404, f"Project '{project_key}' not found.")

    issues = json_store.get_issues()
    new_key = json_store.next_issue_key(project_key)
    new_id = str(10000 + len(issues) + 1)
    now = _now()

    assignee_obj = None
    if body.assignee:
        user = json_store.get_user(body.assignee)
        if user:
            assignee_obj = {"accountId": user["accountId"], "displayName": user["displayName"]}

    status_new = {
        "id": "1",
        "name": "To Do",
        "statusCategory": {"id": 2, "key": "new", "name": "To Do"},
    }

    issue = {
        "id": new_id,
        "key": new_key,
        "fields": {
            "summary": body.summary,
            "status": status_new,
            "issuetype": {"id": "2", "name": body.issue_type},
            "priority": {"id": _PRIORITY_MAP.get(body.priority, "3"), "name": body.priority},
            "assignee": assignee_obj,
            "reporter": None,
            "project": {"key": project_key, "id": project.get("id", "")},
            "description": body.description,
            "created": now,
            "updated": now,
            "labels": body.labels,
            "components": [{"name": c} for c in body.components],
            "fixVersions": [{"name": v} for v in body.fix_versions],
            "comment": {"comments": [], "total": 0},
            "subtasks": [],
            "parent": body.parent_key,
            "epic": body.epic_link,
            "sprint": body.sprint_id,
            "watchers": [],
            "transitions_history": [],
            "remote_links": [],
            "issueLinks": [],
            "customfield_10001": body.story_points,
            "estimate_hours": body.estimate_hours,
            "customfield_10002": body.epic_link,
        },
    }

    if body.parent_key:
        for existing in issues:
            if existing["key"] == body.parent_key:
                existing["fields"].setdefault("subtasks", [])
                if new_key not in existing["fields"]["subtasks"]:
                    existing["fields"]["subtasks"].append(new_key)
                break

    issues.append(issue)
    json_store.save_issues(issues)
    return issue


@router.put("/issues/{key}")
def update_issue(key: str, body: IssueUpdate):
    issues = json_store.get_issues()
    issue = next((i for i in issues if i["key"] == key), None)
    if not issue:
        raise HTTPException(404, f"Issue '{key}' not found.")
    f = issue["fields"]

    if body.summary is not None:
        f["summary"] = body.summary
    if body.description is not None:
        f["description"] = body.description
    if body.assignee is not None:
        if body.assignee == "":
            f["assignee"] = None
        else:
            user = json_store.get_user(body.assignee)
            if user:
                f["assignee"] = {"accountId": user["accountId"], "displayName": user["displayName"]}
    if body.priority is not None:
        f["priority"] = {"id": _PRIORITY_MAP.get(body.priority, "3"), "name": body.priority}
    if body.labels is not None:
        f["labels"] = body.labels
    if body.components is not None:
        f["components"] = [{"name": c} for c in body.components]
    if body.story_points is not None:
        f["customfield_10001"] = body.story_points
    if body.estimate_hours is not None:
        f["estimate_hours"] = body.estimate_hours
    if body.sprint_id is not None:
        f["sprint"] = body.sprint_id if body.sprint_id else None
    if body.epic_link is not None:
        f["epic"] = body.epic_link if body.epic_link else None
        f["customfield_10002"] = body.epic_link if body.epic_link else None
    if body.fix_versions is not None:
        f["fixVersions"] = [{"name": v} for v in body.fix_versions]
    if body.parent_key is not None:
        old_parent = f.get("parent")
        f["parent"] = body.parent_key if body.parent_key else None
        # Update subtasks on old parent
        if old_parent and old_parent != body.parent_key:
            for iss in issues:
                if iss["key"] == old_parent:
                    subs = iss["fields"].get("subtasks", [])
                    if key in subs:
                        subs.remove(key)
                    break
        # Update subtasks on new parent
        if body.parent_key:
            for iss in issues:
                if iss["key"] == body.parent_key:
                    iss["fields"].setdefault("subtasks", [])
                    if key not in iss["fields"]["subtasks"]:
                        iss["fields"]["subtasks"].append(key)
                    break

    if body.issue_type is not None:
        f["issuetype"] = {"id": f.get("issuetype", {}).get("id", "2"), "name": body.issue_type}

    # Handle status transition (allow any status for drag-drop)
    if body.status is not None:
        current_status = f.get("status", {}).get("name", "To Do")
        if body.status != current_status and body.status in STATUS_OBJECTS:
            now = _now()
            f["status"] = STATUS_OBJECTS[body.status]
            f.setdefault("transitions_history", []).append({
                "from_status": current_status,
                "to_status": body.status,
                "timestamp": now,
                "comment": None,
            })

    f["updated"] = _now()
    json_store.save_issues(issues)
    return issue


@router.delete("/issues/{key}")
def delete_issue(key: str):
    issues = json_store.get_issues()
    original = len(issues)
    issues = [i for i in issues if i["key"] != key]
    if len(issues) == original:
        raise HTTPException(404, f"Issue '{key}' not found.")
    json_store.save_issues(issues)
    return {"deleted": True, "issue_key": key}


@router.get("/issues/{key}/links")
def get_issue_links(key: str):
    issue = json_store.get_issue(key)
    if not issue:
        raise HTTPException(404, f"Issue '{key}' not found.")
    return issue["fields"].get("issueLinks", [])


@router.post("/issues/{key}/links", status_code=201)
def create_issue_link(key: str, body: IssueLinkCreate):
    issues = json_store.get_issues()
    source = next((i for i in issues if i["key"] == key), None)
    if not source:
        raise HTTPException(404, f"Issue '{key}' not found.")
    target = next((i for i in issues if i["key"] == body.target_key), None)
    if not target:
        raise HTTPException(404, f"Target issue '{body.target_key}' not found.")

    link_id = f"link-{uuid.uuid4().hex[:8]}"
    link_types = json_store.get_link_types()
    lt = next((l for l in link_types if l["name"].lower() == body.type.lower()), None)
    if not lt:
        lt = {"name": body.type, "inward": f"is {body.type.lower()}ed by", "outward": f"{body.type.lower()}s"}

    # Add outward link to source issue
    source["fields"].setdefault("issueLinks", []).append({
        "id": link_id,
        "type": lt,
        "direction": "outward",
        "outwardIssue": {"key": body.target_key, "fields": {"summary": target["fields"]["summary"]}},
    })
    # Add inward link to target issue
    target["fields"].setdefault("issueLinks", []).append({
        "id": link_id,
        "type": lt,
        "direction": "inward",
        "inwardIssue": {"key": key, "fields": {"summary": source["fields"]["summary"]}},
    })

    json_store.save_issues(issues)
    return {"id": link_id, "type": lt["name"], "source": key, "target": body.target_key}


@router.delete("/issues/{key}/links/{link_id}")
def delete_issue_link(key: str, link_id: str):
    issues = json_store.get_issues()
    # Remove link from all issues that reference it
    found = False
    for iss in issues:
        links = iss["fields"].get("issueLinks", [])
        before = len(links)
        iss["fields"]["issueLinks"] = [l for l in links if l.get("id") != link_id]
        if len(iss["fields"]["issueLinks"]) < before:
            found = True
    if not found:
        raise HTTPException(404, f"Link '{link_id}' not found.")
    json_store.save_issues(issues)
    return {"deleted": True, "link_id": link_id}


VALID_IMPORT_TYPES = {"Epic", "Feature", "Story", "Task", "Bug"}


@router.post("/projects/{project_key}/import-issues")
async def import_issues_csv(project_key: str, file: UploadFile = File(...)):
    """Import issues from a CSV file. Columns: Summary (required), Type, Description."""
    project = json_store.get_project(project_key.upper())
    if not project:
        raise HTTPException(404, f"Project '{project_key}' not found.")

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Only CSV files are supported. Please upload a .csv file.")

    try:
        raw = await file.read()
        text = raw.decode("utf-8-sig")  # handles BOM from Excel
    except UnicodeDecodeError:
        raise HTTPException(400, "Could not read file. Please save as UTF-8 CSV.")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(400, "CSV file appears to be empty or has no header row.")

    # Normalize header names (case-insensitive, strip whitespace)
    header_map = {}
    for h in reader.fieldnames:
        norm = h.strip().lower()
        header_map[norm] = h

    if "summary" not in header_map:
        raise HTTPException(
            400,
            f"CSV must have a 'Summary' column. Found columns: {', '.join(reader.fieldnames)}",
        )

    results = {"created": [], "errors": [], "total_rows": 0}
    issues = json_store.get_issues()
    now = _now()

    for row_num, row in enumerate(reader, start=2):  # row 1 is header
        results["total_rows"] += 1
        summary_col = header_map["summary"]
        summary = (row.get(summary_col) or "").strip()

        if not summary:
            results["errors"].append({"row": row_num, "error": "Summary is empty"})
            continue

        # Type
        type_col = header_map.get("type")
        issue_type = "Story"
        if type_col:
            raw_type = (row.get(type_col) or "").strip()
            if raw_type:
                # Case-insensitive match
                matched = next((t for t in VALID_IMPORT_TYPES if t.lower() == raw_type.lower()), None)
                if matched:
                    issue_type = matched
                else:
                    results["errors"].append({
                        "row": row_num,
                        "error": f"Invalid type '{raw_type}'. Valid: {', '.join(sorted(VALID_IMPORT_TYPES))}",
                    })
                    continue

        # Description
        desc_col = header_map.get("description")
        description = ""
        if desc_col:
            description = (row.get(desc_col) or "").strip()

        # Create issue
        new_key = json_store.next_issue_key(project_key.upper())
        new_id = str(10000 + len(issues) + 1)

        issue = {
            "id": new_id,
            "key": new_key,
            "fields": {
                "summary": summary,
                "status": {"id": "1", "name": "To Do", "statusCategory": {"id": 2, "key": "new", "name": "To Do"}},
                "issuetype": {"id": "2", "name": issue_type},
                "priority": {"id": "3", "name": "Medium"},
                "assignee": None,
                "reporter": None,
                "project": {"key": project_key.upper(), "id": project.get("id", "")},
                "description": description,
                "created": now,
                "updated": now,
                "labels": [],
                "components": [],
                "fixVersions": [],
                "comment": {"comments": [], "total": 0},
                "subtasks": [],
                "parent": None,
                "epic": None,
                "sprint": None,
                "watchers": [],
                "transitions_history": [],
                "remote_links": [],
                "issueLinks": [],
                "customfield_10001": None,
                "estimate_hours": None,
                "customfield_10002": None,
            },
        }

        issues.append(issue)
        results["created"].append({"row": row_num, "key": new_key, "summary": summary, "type": issue_type})

    if results["created"]:
        json_store.save_issues(issues)

    return results

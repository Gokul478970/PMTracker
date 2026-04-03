import re
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pmtracker.store import json_store

router = APIRouter(tags=["comments"])


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


class CommentCreate(BaseModel):
    body: str
    author_id: str | None = None


class CommentEdit(BaseModel):
    body: str


@router.get("/issues/{key}/comments")
def get_comments(key: str):
    issue = json_store.get_issue(key)
    if not issue:
        raise HTTPException(404, f"Issue '{key}' not found.")
    return issue["fields"].get("comment", {}).get("comments", [])


@router.post("/issues/{key}/comments", status_code=201)
def add_comment(key: str, body: CommentCreate):
    issues = json_store.get_issues()
    issue = next((i for i in issues if i["key"] == key), None)
    if not issue:
        raise HTTPException(404, f"Issue '{key}' not found.")

    author_obj = None
    if body.author_id:
        user = json_store.get_user(body.author_id)
        if user:
            author_obj = {"accountId": user["accountId"], "displayName": user["displayName"]}

    now = _now()
    comment_obj = {
        "id": f"cmt-{uuid.uuid4().hex[:5]}",
        "body": body.body,
        "author": author_obj,
        "created": now,
        "updated": now,
    }
    issue["fields"].setdefault("comment", {"comments": [], "total": 0})
    issue["fields"]["comment"]["comments"].append(comment_obj)
    issue["fields"]["comment"]["total"] = len(issue["fields"]["comment"]["comments"])
    issue["fields"]["updated"] = now
    json_store.save_issues(issues)
    return comment_obj


@router.put("/issues/{key}/comments/{comment_id}")
def edit_comment(key: str, comment_id: str, body: CommentEdit):
    issues = json_store.get_issues()
    issue = next((i for i in issues if i["key"] == key), None)
    if not issue:
        raise HTTPException(404, f"Issue '{key}' not found.")

    comments = issue["fields"].get("comment", {}).get("comments", [])
    target = next((c for c in comments if c["id"] == comment_id), None)
    if not target:
        raise HTTPException(404, f"Comment '{comment_id}' not found.")

    now = _now()
    target["body"] = body.body
    target["updated"] = now
    issue["fields"]["updated"] = now
    json_store.save_issues(issues)
    return target


# --- Worklogs ---

def _parse_time_spent(ts: str) -> int:
    """Parse '2h 30m', '1d', '45m' etc to seconds."""
    seconds = 0
    for amount, unit in re.findall(r"(\d+)\s*([dhm])", ts.lower()):
        n = int(amount)
        if unit == "d":
            seconds += n * 28800
        elif unit == "h":
            seconds += n * 3600
        elif unit == "m":
            seconds += n * 60
    return seconds or 0


class WorklogCreate(BaseModel):
    time_spent: str
    comment: str | None = None
    author_id: str | None = None
    started: str | None = None


@router.get("/issues/{key}/worklogs")
def get_worklogs(key: str):
    issue = json_store.get_issue(key)
    if not issue:
        raise HTTPException(404, f"Issue '{key}' not found.")
    worklogs = json_store.get_worklogs()
    return worklogs.get(key, [])


@router.post("/issues/{key}/worklogs", status_code=201)
def add_worklog(key: str, body: WorklogCreate):
    issue = json_store.get_issue(key)
    if not issue:
        raise HTTPException(404, f"Issue '{key}' not found.")

    author_obj = None
    if body.author_id:
        user = json_store.get_user(body.author_id)
        if user:
            author_obj = {"accountId": user["accountId"], "displayName": user["displayName"]}

    now = _now()
    entry = {
        "id": f"wl-{uuid.uuid4().hex[:5]}",
        "author": author_obj,
        "timeSpent": body.time_spent,
        "timeSpentSeconds": _parse_time_spent(body.time_spent),
        "started": body.started or now,
        "comment": body.comment or "",
    }

    worklogs = json_store.get_worklogs()
    worklogs.setdefault(key, []).append(entry)
    json_store.save_worklogs(worklogs)
    return entry


# --- Watchers ---

@router.get("/issues/{key}/watchers")
def get_watchers(key: str):
    issue = json_store.get_issue(key)
    if not issue:
        raise HTTPException(404, f"Issue '{key}' not found.")
    return issue["fields"].get("watchers", [])


class WatcherAdd(BaseModel):
    user_identifier: str


@router.post("/issues/{key}/watchers", status_code=201)
def add_watcher(key: str, body: WatcherAdd):
    issues = json_store.get_issues()
    issue = next((i for i in issues if i["key"] == key), None)
    if not issue:
        raise HTTPException(404, f"Issue '{key}' not found.")

    user = json_store.get_user(body.user_identifier)
    if not user:
        raise HTTPException(404, f"User '{body.user_identifier}' not found.")

    watchers = issue["fields"].setdefault("watchers", [])
    if user["accountId"] not in watchers:
        watchers.append(user["accountId"])
        json_store.save_issues(issues)
    return {"issue_key": key, "watchers": watchers}


@router.delete("/issues/{key}/watchers/{account_id}")
def remove_watcher(key: str, account_id: str):
    issues = json_store.get_issues()
    issue = next((i for i in issues if i["key"] == key), None)
    if not issue:
        raise HTTPException(404, f"Issue '{key}' not found.")

    watchers = issue["fields"].get("watchers", [])
    if account_id in watchers:
        watchers.remove(account_id)
        json_store.save_issues(issues)
    return {"issue_key": key, "watchers": watchers}


# --- Link Types ---

@router.get("/link-types")
def get_link_types():
    return json_store.get_link_types()

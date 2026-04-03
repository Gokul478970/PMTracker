from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pmtracker.store import json_store
from pmtracker.tools.transitions import STATUS_OBJECTS, TRANSITIONS

router = APIRouter(tags=["transitions"])


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


class TransitionRequest(BaseModel):
    transition_name: str | None = None
    transition_id: str | None = None
    comment: str | None = None


@router.get("/issues/{key}/transitions")
def get_transitions(key: str):
    issue = json_store.get_issue(key)
    if not issue:
        raise HTTPException(404, f"Issue '{key}' not found.")
    current = issue["fields"].get("status", {}).get("name", "To Do")
    return TRANSITIONS.get(current, [])


@router.post("/issues/{key}/transitions")
def transition_issue(key: str, body: TransitionRequest):
    issues = json_store.get_issues()
    issue = next((i for i in issues if i["key"] == key), None)
    if not issue:
        raise HTTPException(404, f"Issue '{key}' not found.")

    if not body.transition_name and not body.transition_id:
        raise HTTPException(400, "Provide at least one of: transition_name, transition_id.")

    current = issue["fields"].get("status", {}).get("name", "To Do")
    available = TRANSITIONS.get(current, [])
    target = None
    if body.transition_id:
        target = next((t for t in available if t["id"] == body.transition_id), None)
    if target is None and body.transition_name:
        target = next((t for t in available if t["name"].lower() == body.transition_name.lower()), None)
    if not target:
        label = body.transition_id or body.transition_name
        raise HTTPException(400, f"Transition '{label}' not valid from '{current}'.")

    new_status_name = target["name"]
    now = _now()
    issue["fields"]["status"] = STATUS_OBJECTS[new_status_name]
    issue["fields"].setdefault("transitions_history", []).append({
        "from_status": current,
        "to_status": new_status_name,
        "timestamp": now,
        "comment": body.comment,
    })
    issue["fields"]["updated"] = now
    json_store.save_issues(issues)
    return {"issue_key": key, "previous_status": current, "new_status": new_status_name}

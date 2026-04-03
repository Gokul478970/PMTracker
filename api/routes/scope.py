import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pmtracker.store import json_store

router = APIRouter(tags=["scope"])


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


class ScopeCreate(BaseModel):
    name: str  # e.g. "MVP 1"
    content: str = ""


class ScopeUpdate(BaseModel):
    name: str | None = None
    content: str | None = None


def _get_scopes() -> dict:
    return json_store.load("scopes", default={})


def _save_scopes(scopes: dict):
    json_store.save("scopes", scopes)


@router.get("/projects/{key}/scopes")
def list_scopes(key: str):
    project = json_store.get_project(key.upper())
    if not project:
        raise HTTPException(404, f"Project '{key}' not found.")
    scopes = _get_scopes()
    return scopes.get(key.upper(), [])


@router.post("/projects/{key}/scopes", status_code=201)
def create_scope(key: str, body: ScopeCreate):
    project = json_store.get_project(key.upper())
    if not project:
        raise HTTPException(404, f"Project '{key}' not found.")
    scopes = _get_scopes()
    project_scopes = scopes.setdefault(key.upper(), [])

    scope = {
        "id": f"scope-{uuid.uuid4().hex[:8]}",
        "name": body.name,
        "content": body.content,
        "created": _now(),
        "updated": _now(),
    }
    project_scopes.append(scope)
    _save_scopes(scopes)
    return scope


@router.put("/projects/{key}/scopes/{scope_id}")
def update_scope(key: str, scope_id: str, body: ScopeUpdate):
    scopes = _get_scopes()
    project_scopes = scopes.get(key.upper(), [])
    scope = next((s for s in project_scopes if s["id"] == scope_id), None)
    if not scope:
        raise HTTPException(404, f"Scope '{scope_id}' not found.")

    if body.name is not None:
        scope["name"] = body.name
    if body.content is not None:
        scope["content"] = body.content
    scope["updated"] = _now()

    _save_scopes(scopes)
    return scope


@router.delete("/projects/{key}/scopes/{scope_id}")
def delete_scope(key: str, scope_id: str):
    scopes = _get_scopes()
    project_scopes = scopes.get(key.upper(), [])
    original = len(project_scopes)
    scopes[key.upper()] = [s for s in project_scopes if s["id"] != scope_id]
    if len(scopes[key.upper()]) == original:
        raise HTTPException(404, f"Scope '{scope_id}' not found.")
    _save_scopes(scopes)
    return {"deleted": True, "scope_id": scope_id}

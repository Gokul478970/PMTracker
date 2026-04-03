import hashlib
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from pmtracker.store import json_store
from api.routes.auth import is_admin

router = APIRouter(tags=["agents"])


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


class AgentKeyCreate(BaseModel):
    agent_name: str


@router.get("/agents")
def list_agent_keys(request: Request):
    email = getattr(request.state, "user_email", "")
    if not is_admin(email):
        raise HTTPException(403, "Only admins can manage agent keys.")
    return json_store.get_agent_keys()


@router.post("/agents", status_code=201)
def create_agent_key(body: AgentKeyCreate, request: Request):
    email = getattr(request.state, "user_email", "")
    if not is_admin(email):
        raise HTTPException(403, "Only admins can create agent keys.")

    agent_name = body.agent_name.strip()
    if not agent_name:
        raise HTTPException(400, "agent_name is required.")

    # Generate a secure random API key
    raw_key = f"sk-agent-{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:15] + "..."

    record = {
        "id": f"ak-{uuid.uuid4().hex[:8]}",
        "agent_name": agent_name,
        "key_hash": key_hash,
        "key_prefix": key_prefix,
        "created_by": email,
        "created": _now(),
        "last_used": None,
        "active": True,
    }

    keys = json_store.get_agent_keys()
    keys.append(record)
    json_store.save_agent_keys(keys)

    # Return the plaintext key only this once
    return {**record, "api_key": raw_key}


@router.delete("/agents/{key_id}")
def revoke_agent_key(key_id: str, request: Request):
    email = getattr(request.state, "user_email", "")
    if not is_admin(email):
        raise HTTPException(403, "Only admins can revoke agent keys.")

    keys = json_store.get_agent_keys()
    found = next((k for k in keys if k["id"] == key_id), None)
    if not found:
        raise HTTPException(404, "Agent key not found.")

    keys = [k for k in keys if k["id"] != key_id]
    json_store.save_agent_keys(keys)
    return {"deleted": True, "id": key_id}

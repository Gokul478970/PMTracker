import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from pmtracker.store import json_store
from api.routes.users import _get_all_users
from api.routes.assignments import get_user_project_keys
from api.routes.auth import is_admin

router = APIRouter(tags=["chat"])

MAX_LINES = 10


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _chat_filename(project_key: str) -> str:
    return f"chat_{project_key}"


def _load_chat(project_key: str) -> list:
    return json_store.load(_chat_filename(project_key), default=[])


def _save_chat(project_key: str, messages: list) -> None:
    json_store.save(_chat_filename(project_key), messages)


def _load_read_markers() -> dict:
    """Load read markers: { "email::project_key": "timestamp" }"""
    return json_store.load("chat_read_markers", default={})


def _save_read_markers(markers: dict) -> None:
    json_store.save("chat_read_markers", markers)


def _resolve_sender_name(email: str) -> str:
    """Look up display name from merged users list."""
    email_lower = email.lower()
    for u in _get_all_users():
        if u.get("emailAddress", "").lower() == email_lower:
            return u.get("displayName", email.split("@")[0])
    return email.split("@")[0]


class ChatMessageRequest(BaseModel):
    text: str


@router.get("/projects/{project_key}/chat")
def get_chat(project_key: str, limit: int = 50):
    project = json_store.get_project(project_key)
    if not project:
        raise HTTPException(404, f"Project '{project_key}' not found.")

    messages = _load_chat(project_key)
    total = len(messages)

    # Return newest messages (last N), keeping chronological order
    if limit and limit < total:
        messages = messages[-limit:]

    return {"messages": messages, "total": total}


@router.post("/projects/{project_key}/chat")
def send_chat(project_key: str, body: ChatMessageRequest, request: Request):
    project = json_store.get_project(project_key)
    if not project:
        raise HTTPException(404, f"Project '{project_key}' not found.")

    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Message text cannot be empty.")
    if len(text) > 2000:
        raise HTTPException(400, "Message text cannot exceed 2000 characters.")

    # Enforce 10-line limit
    line_count = text.count('\n') + 1
    if line_count > MAX_LINES:
        raise HTTPException(400, f"Messages cannot exceed {MAX_LINES} lines. Please keep it concise.")

    sender_email = getattr(request.state, "user_email", "unknown@example.com")
    sender_name = _resolve_sender_name(sender_email)

    message = {
        "id": f"msg-{uuid.uuid4().hex[:8]}",
        "sender_email": sender_email,
        "sender_name": sender_name,
        "text": text,
        "timestamp": _now(),
    }

    messages = _load_chat(project_key)
    messages.append(message)
    _save_chat(project_key, messages)

    return message


@router.post("/projects/{project_key}/chat/read")
def mark_chat_read(project_key: str, request: Request):
    """Mark all messages in this project chat as read for the current user."""
    sender_email = getattr(request.state, "user_email", "")
    markers = _load_read_markers()
    markers[f"{sender_email}::{project_key}"] = _now()
    _save_read_markers(markers)
    return {"ok": True}


@router.get("/chat/unread")
def get_unread_counts(request: Request):
    """Return unread message counts per project for the current user."""
    email = getattr(request.state, "user_email", "")
    markers = _load_read_markers()

    # Get projects this user can see
    if is_admin(email):
        projects = json_store.get_projects()
        project_keys = [p["key"] for p in projects]
    else:
        project_keys = get_user_project_keys(email)

    counts = {}
    for pk in project_keys:
        last_read = markers.get(f"{email}::{pk}", "")
        messages = _load_chat(pk)
        if not messages:
            continue
        unread = 0
        for msg in messages:
            if msg["sender_email"] == email:
                continue  # Don't count own messages
            if not last_read or msg["timestamp"] > last_read:
                unread += 1
        if unread > 0:
            counts[pk] = unread

    return counts

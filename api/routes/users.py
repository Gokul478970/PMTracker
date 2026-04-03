from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from pmtracker.store import json_store
from api.routes.auth import is_admin, is_demo, ADMIN_EMAIL
from api.routes.assignments import get_user_project_keys

router = APIRouter(tags=["users"])


def _auth_user_to_user(au: dict) -> dict:
    """Convert an auth_users.json entry to the same shape as users.json entries."""
    email = au["email"]
    prefix = email.split("@")[0]
    return {
        "accountId": f"auth-{prefix}",
        "displayName": au.get("display_name") or prefix,
        "emailAddress": email,
        "active": True,
        "timeZone": "UTC",
        "role": au.get("role", "Admin" if email == ADMIN_EMAIL else "Dev"),
    }


_HIDDEN_SEED_IDS = {"user-001", "user-002", "user-003"}


def _get_all_users() -> list[dict]:
    """Return verified auth users only (seed users are hidden)."""
    auth_users = json_store.load("auth_users", default=[])
    return [_auth_user_to_user(au) for au in auth_users if au.get("verified")]


def _find_user(identifier: str) -> dict | None:
    """Find a user by accountId, email, or displayName in both sources."""
    user = json_store.get_user(identifier)
    if user:
        return user

    auth_users = json_store.load("auth_users", default=[])
    identifier_lower = identifier.lower()
    for au in auth_users:
        if not au.get("verified"):
            continue
        converted = _auth_user_to_user(au)
        if (
            converted["accountId"] == identifier
            or converted["emailAddress"].lower() == identifier_lower
            or converted["displayName"].lower() == identifier_lower
        ):
            return converted
    return None


@router.get("/users")
def list_users(request: Request):
    email = getattr(request.state, "user_email", "")
    all_users = _get_all_users()

    # Demo user sees empty list
    if is_demo(email):
        return []

    # Admin and Project Admin see all users
    if is_admin(email):
        return all_users

    assignments = json_store.get_assignments()
    # Check if caller is a Project Admin for any project
    is_any_project_admin = any(
        a["email"] == email and a["role"] == "Project Admin" and not a.get("end_date")
        for a in assignments
    )
    if is_any_project_admin:
        return all_users

    # Normal user: only see users who share at least one project
    my_projects = set(get_user_project_keys(email))
    if not my_projects:
        # No projects assigned — only see themselves
        return [u for u in all_users if u["emailAddress"] == email]

    # Find emails of users assigned to the same projects
    co_member_emails = {email}  # always include self
    for a in assignments:
        if a["project_key"] in my_projects and not a.get("end_date"):
            co_member_emails.add(a["email"])
    # Also include admin (always visible)
    co_member_emails.add(ADMIN_EMAIL)

    return [u for u in all_users if u["emailAddress"] in co_member_emails]


@router.get("/users/{identifier}")
def get_user(identifier: str):
    user = _find_user(identifier)
    if not user:
        raise HTTPException(404, f"User '{identifier}' not found.")
    return user


class UserUpdate(BaseModel):
    role: str | None = None
    display_name: str | None = None


@router.put("/users/{identifier}")
def update_user(identifier: str, body: UserUpdate, request: Request):
    """Admin-only: update a user's global role or display name."""
    caller_email = getattr(request.state, "user_email", "")
    if not is_admin(caller_email):
        raise HTTPException(403, "Only admins can update users.")

    auth_users = json_store.load("auth_users", default=[])
    identifier_lower = identifier.lower()
    target = None
    for au in auth_users:
        if not au.get("verified"):
            continue
        if au["email"].lower() == identifier_lower or f"auth-{au['email'].split('@')[0]}" == identifier:
            target = au
            break

    if not target:
        raise HTTPException(404, f"User '{identifier}' not found.")

    if target["email"] == ADMIN_EMAIL:
        raise HTTPException(403, "Cannot modify the admin user.")

    VALID_ROLES = {"Dev", "QA", "PM", "PO"}
    if body.role and body.role in VALID_ROLES:
        target["role"] = body.role

    if body.display_name and body.display_name.strip():
        target["display_name"] = body.display_name.strip()

    json_store.save("auth_users", auth_users)
    return _auth_user_to_user(target)


@router.delete("/users/{identifier}")
def delete_user(identifier: str, request: Request):
    email = getattr(request.state, "user_email", "")
    if not is_admin(email):
        raise HTTPException(403, "Only admins can delete users.")

    auth_users = json_store.load("auth_users", default=[])
    identifier_lower = identifier.lower()
    original = len(auth_users)

    # Don't allow deleting admin
    target = next(
        (au for au in auth_users if au["email"].lower() == identifier_lower
         or (f"auth-{au['email'].split('@')[0]}") == identifier),
        None,
    )
    if target and target["email"] == ADMIN_EMAIL:
        raise HTTPException(403, "Cannot delete the admin user.")

    auth_users = [
        au for au in auth_users
        if au["email"].lower() != identifier_lower
        and f"auth-{au['email'].split('@')[0]}" != identifier
    ]
    if len(auth_users) == original:
        raise HTTPException(404, f"User '{identifier}' not found.")
    json_store.save("auth_users", auth_users)
    # Also remove their sessions
    sessions = json_store.load("auth_sessions", default=[])
    if target:
        sessions = [s for s in sessions if s.get("email") != target["email"]]
        json_store.save("auth_sessions", sessions)
    return {"deleted": True, "identifier": identifier}

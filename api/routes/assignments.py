import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from pmtracker.store import json_store
from api.routes.auth import is_admin, ADMIN_EMAIL

router = APIRouter(tags=["assignments"])

VALID_PROJECT_ROLES = {"Project Admin", "Project User", "Product Owner"}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def get_user_project_keys(email: str) -> list[str]:
    """Return active project keys for a user."""
    assignments = json_store.get_assignments()
    return list({
        a["project_key"]
        for a in assignments
        if a["email"] == email and not a.get("end_date")
    })


def is_project_admin(email: str, project_key: str) -> bool:
    """Check if user is a Project Admin for the given project."""
    assignments = json_store.get_assignments()
    return any(
        a["email"] == email
        and a["project_key"] == project_key
        and a["role"] == "Project Admin"
        and not a.get("end_date")
        for a in assignments
    )


def can_manage_project(email: str, project_key: str) -> bool:
    """True if user is admin or project admin for this project."""
    return is_admin(email) or is_project_admin(email, project_key)


# --- Models ---

class AssignmentCreate(BaseModel):
    email: str
    project_key: str
    role: str = "Project User"


class AssignmentUpdate(BaseModel):
    role: str | None = None
    end_date: str | None = None


# --- Endpoints ---

@router.get("/assignments")
def list_assignments(request: Request, project_key: str = None):
    email = getattr(request.state, "user_email", "")
    assignments = json_store.get_assignments()

    # Filter out ended assignments by default? No — show all so admins can see history.
    if project_key:
        assignments = [a for a in assignments if a["project_key"] == project_key]

    if is_admin(email):
        return assignments

    # Project admins see assignments for their managed projects + their own
    managed_keys = set()
    own_assignments = []
    for a in json_store.get_assignments():
        if a["email"] == email and not a.get("end_date"):
            if a["role"] == "Project Admin":
                managed_keys.add(a["project_key"])
            own_assignments.append(a)

    if managed_keys:
        return [
            a for a in assignments
            if a["project_key"] in managed_keys or a["email"] == email
        ]

    # Regular users see only their own
    return [a for a in assignments if a["email"] == email]


@router.post("/assignments", status_code=201)
def create_assignment(body: AssignmentCreate, request: Request):
    caller_email = getattr(request.state, "user_email", "")
    target_email = body.email.strip().lower()
    project_key = body.project_key.strip().upper()
    role = body.role.strip()

    if role not in VALID_PROJECT_ROLES:
        raise HTTPException(400, f"Invalid role. Must be one of: {', '.join(VALID_PROJECT_ROLES)}")

    # Check permission
    if not is_admin(caller_email) and not is_project_admin(caller_email, project_key):
        raise HTTPException(403, "Only admins or project admins can assign users to projects.")

    # Project admins cannot assign the "Project Admin" role
    if not is_admin(caller_email) and role == "Project Admin":
        raise HTTPException(403, "Only admins can assign the Project Admin role.")

    # Validate project exists
    project = json_store.get_project(project_key)
    if not project:
        raise HTTPException(404, f"Project '{project_key}' not found.")

    # Validate user exists and is verified
    auth_users = json_store.load("auth_users", default=[])
    target_user = next((u for u in auth_users if u["email"] == target_email and u.get("verified")), None)
    if not target_user:
        raise HTTPException(404, f"User '{target_email}' not found or not verified.")

    # Skip if target is admin (they see everything already)
    if target_email == ADMIN_EMAIL or target_user.get("role") == "Admin":
        raise HTTPException(400, "Admin users already have access to all projects.")

    # Check for duplicate active assignment
    assignments = json_store.get_assignments()
    existing = next(
        (a for a in assignments
         if a["email"] == target_email
         and a["project_key"] == project_key
         and not a.get("end_date")),
        None,
    )
    if existing:
        raise HTTPException(409, f"User '{target_email}' already has an active assignment to '{project_key}'.")

    assignment = {
        "id": f"pa-{uuid.uuid4().hex[:8]}",
        "email": target_email,
        "project_key": project_key,
        "role": role,
        "assigned_by": caller_email,
        "assigned_at": _now(),
        "end_date": None,
    }
    assignments.append(assignment)
    json_store.save_assignments(assignments)
    return assignment


@router.put("/assignments/{assignment_id}")
def update_assignment(assignment_id: str, body: AssignmentUpdate, request: Request):
    caller_email = getattr(request.state, "user_email", "")
    assignments = json_store.get_assignments()
    assignment = next((a for a in assignments if a["id"] == assignment_id), None)
    if not assignment:
        raise HTTPException(404, f"Assignment '{assignment_id}' not found.")

    # Permission check
    if not can_manage_project(caller_email, assignment["project_key"]):
        raise HTTPException(403, "You don't have permission to modify this assignment.")

    # Project admins cannot promote to Project Admin
    if body.role == "Project Admin" and not is_admin(caller_email):
        raise HTTPException(403, "Only admins can assign the Project Admin role.")

    if body.role and body.role in VALID_PROJECT_ROLES:
        assignment["role"] = body.role
    if body.end_date is not None:
        assignment["end_date"] = body.end_date

    json_store.save_assignments(assignments)
    return assignment


@router.delete("/assignments/{assignment_id}")
def remove_assignment(assignment_id: str, request: Request):
    caller_email = getattr(request.state, "user_email", "")
    assignments = json_store.get_assignments()
    assignment = next((a for a in assignments if a["id"] == assignment_id), None)
    if not assignment:
        raise HTTPException(404, f"Assignment '{assignment_id}' not found.")

    if not can_manage_project(caller_email, assignment["project_key"]):
        raise HTTPException(403, "You don't have permission to remove this assignment.")

    # Soft delete: set end_date
    assignment["end_date"] = _now()
    json_store.save_assignments(assignments)
    return {"removed": True, "id": assignment_id, "end_date": assignment["end_date"]}

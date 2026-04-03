import re
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from pmtracker.store import json_store
from api.routes.auth import is_admin, is_demo
from api.routes.assignments import get_user_project_keys, can_manage_project

router = APIRouter(tags=["projects"])


class ProjectCreate(BaseModel):
    key: str
    name: str
    description: str = ""
    lead_account_id: str | None = None
    components: list[str] = []
    admin_project: bool = False


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    components: list[str] | None = None
    lead_account_id: str | None = None
    archived: bool | None = None
    admin_project: bool | None = None


class VersionCreate(BaseModel):
    name: str
    description: str = ""
    start_date: str | None = None
    release_date: str | None = None


_HIDDEN_PROJECT_KEYS = {"ECOM", "MOB"}


@router.get("/projects")
def list_projects(request: Request, include_archived: bool = False):
    email = getattr(request.state, "user_email", "")
    projects = json_store.get_projects()
    projects = [p for p in projects if p["key"] not in _HIDDEN_PROJECT_KEYS]
    if not include_archived:
        projects = [p for p in projects if not p.get("archived", False)]

    # Demo user only sees DEM project
    if is_demo(email):
        return [p for p in projects if p["key"] == "DEM"]

    if is_admin(email):
        # Admin sees all (except hidden seeds)
        return projects

    # Non-admin: only see projects they are actively assigned to
    allowed_keys = set(get_user_project_keys(email))
    projects = [p for p in projects if p["key"] in allowed_keys]
    return projects


@router.get("/projects/{key}")
def get_project(key: str):
    project = json_store.get_project(key.upper())
    if not project:
        raise HTTPException(404, f"Project '{key}' not found.")
    return project


@router.put("/projects/{key}")
def update_project(key: str, body: ProjectUpdate, request: Request):
    email = getattr(request.state, "user_email", "")
    pk = key.upper()

    if not can_manage_project(email, pk):
        raise HTTPException(403, "Only admins or project admins can edit this project.")

    projects = json_store.get_projects()
    project = next((p for p in projects if p["key"] == pk), None)
    if not project:
        raise HTTPException(404, f"Project '{key}' not found.")

    # Fields any project manager can edit
    if body.name is not None:
        project["name"] = body.name
    if body.description is not None:
        project["description"] = body.description
    if body.components is not None:
        project["components"] = body.components

    # Fields only admin can edit
    if is_admin(email):
        if body.lead_account_id is not None:
            user = json_store.get_user(body.lead_account_id)
            if user:
                project["lead"] = {"accountId": user["accountId"], "displayName": user["displayName"]}
        if body.archived is not None:
            project["archived"] = body.archived
        if body.admin_project is not None:
            project["admin_project"] = body.admin_project

    json_store.save_projects(projects)
    return project


@router.post("/projects", status_code=201)
def create_project(body: ProjectCreate):
    key = body.key.upper()
    if not re.match(r"^[A-Z][A-Z0-9_]+$", key):
        raise HTTPException(400, "Project key must be uppercase letters, digits, underscores.")
    projects = json_store.get_projects()
    if any(p["key"] == key for p in projects):
        raise HTTPException(409, f"Project '{key}' already exists.")

    lead = None
    if body.lead_account_id:
        user = json_store.get_user(body.lead_account_id)
        if user:
            lead = {"accountId": user["accountId"], "displayName": user["displayName"]}

    existing_ids = [int(p["id"]) for p in projects if str(p.get("id", "")).isdigit()]
    new_id = str(max(existing_ids, default=10000) + 1)

    project = {
        "id": new_id,
        "key": key,
        "name": body.name,
        "projectTypeKey": "software",
        "lead": lead,
        "description": body.description,
        "components": body.components,
        "versions": [],
        "archived": False,
        "admin_project": body.admin_project,
    }
    projects.append(project)
    json_store.save_projects(projects)

    # Auto-create a scrum board for the new project
    boards = json_store.get_boards()
    existing_board_ids = [int(b["id"]) for b in boards if str(b.get("id", "")).isdigit()]
    new_board_id = str(max(existing_board_ids, default=0) + 1)
    boards.append({
        "id": new_board_id,
        "name": f"{key} Board",
        "type": "scrum",
        "projectKey": key,
    })
    json_store.save("boards", boards)

    return project


@router.get("/projects/{key}/versions")
def get_versions(key: str):
    project = json_store.get_project(key.upper())
    if not project:
        raise HTTPException(404, f"Project '{key}' not found.")
    return project.get("versions", [])


@router.post("/projects/{key}/versions", status_code=201)
def create_version(key: str, body: VersionCreate):
    projects = json_store.get_projects()
    project = next((p for p in projects if p["key"] == key.upper()), None)
    if not project:
        raise HTTPException(404, f"Project '{key}' not found.")

    versions = project.setdefault("versions", [])
    existing_ids = [int(v["id"]) for v in versions if str(v.get("id", "")).isdigit()]
    new_id = str(max(existing_ids, default=10100) + 1)

    version = {
        "id": new_id,
        "name": body.name,
        "description": body.description,
        "startDate": body.start_date,
        "releaseDate": body.release_date,
        "released": False,
        "archived": False,
        "projectKey": key.upper(),
    }
    versions.append(version)
    json_store.save_projects(projects)
    return version


@router.get("/projects/{key}/components")
def get_components(key: str):
    project = json_store.get_project(key.upper())
    if not project:
        raise HTTPException(404, f"Project '{key}' not found.")
    return [{"name": c} if isinstance(c, str) else c for c in project.get("components", [])]


@router.delete("/projects/{key}")
def delete_project(key: str, request: Request):
    email = getattr(request.state, "user_email", "")
    if not is_admin(email):
        raise HTTPException(403, "Only admins can delete projects.")
    pk = key.upper()
    projects = json_store.get_projects()
    original = len(projects)
    projects = [p for p in projects if p["key"] != pk]
    if len(projects) == original:
        raise HTTPException(404, f"Project '{key}' not found.")
    json_store.save_projects(projects)
    # Also remove related boards
    boards = json_store.get_boards()
    boards = [b for b in boards if b.get("projectKey", "").upper() != pk]
    json_store.save("boards", boards)
    # Remove related issues
    issues = json_store.get_issues()
    issues = [i for i in issues if i["fields"].get("project", {}).get("key", "").upper() != pk]
    json_store.save_issues(issues)
    return {"deleted": True, "project_key": pk}


@router.get("/projects/{key}/issues")
def get_project_issues(key: str, status: str = None, issue_type: str = None, start: int = 0, limit: int = 50):
    project = json_store.get_project(key.upper())
    if not project:
        raise HTTPException(404, f"Project '{key}' not found.")

    issues = json_store.get_issues()
    filtered = [i for i in issues if i["fields"].get("project", {}).get("key", "").upper() == key.upper()]
    if status:
        filtered = [i for i in filtered if i["fields"].get("status", {}).get("name", "").lower() == status.lower()]
    if issue_type:
        filtered = [i for i in filtered if i["fields"].get("issuetype", {}).get("name", "").lower() == issue_type.lower()]
    total = len(filtered)
    page = filtered[start: start + limit]
    return {"total": total, "start": start, "limit": limit, "issues": page}

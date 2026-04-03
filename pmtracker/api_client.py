"""HTTP client for calling the PMTracker FastAPI backend.

Used by MCP tools instead of direct json_store access, so the web app
backend is the single source of truth.
"""

import json
import os
import ssl
import urllib.request
import urllib.error
import urllib.parse


_BASE_URL = os.environ.get("PMTRACKER_API_URL", "https://pmtracker-app-g5c5fkgshwbyd5f4.southindia-01.azurewebsites.net")
_INTERNAL_KEY = os.environ.get("PMTRACKER_INTERNAL_KEY", "pmtracker-mcp-internal")

# SSL context — skip verification for corporate proxy environments
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE


def _url(path: str, params: dict | None = None) -> str:
    """Build full URL with optional query parameters."""
    url = f"{_BASE_URL}/api{path}"
    if params:
        # Filter out None values
        filtered = {k: v for k, v in params.items() if v is not None}
        if filtered:
            url += "?" + urllib.parse.urlencode(filtered)
    return url


def _request(method: str, path: str, params: dict | None = None, body: dict | None = None):
    """Make an HTTP request to the FastAPI backend."""
    url = _url(path, params if method == "GET" else None)
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    elif method in ("POST", "PUT") and params and method != "GET":
        data = json.dumps(params).encode("utf-8")

    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Internal-Key", _INTERNAL_KEY)

    try:
        with urllib.request.urlopen(req, context=_SSL_CTX) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(error_body).get("detail", error_body)
        except (json.JSONDecodeError, AttributeError):
            detail = error_body
        raise ValueError(f"API error {e.code}: {detail}")


def get(path: str, params: dict | None = None):
    return _request("GET", path, params=params)


def post(path: str, body: dict | None = None):
    return _request("POST", path, body=body)


def put(path: str, body: dict | None = None):
    return _request("PUT", path, body=body)


def delete(path: str):
    return _request("DELETE", path)


# ---- Convenience wrappers ----

# Projects
def get_all_projects(include_archived: bool = False):
    return get("/projects", {"include_archived": str(include_archived).lower()})

def get_project_versions(project_key: str):
    return get(f"/projects/{project_key}/versions")

def get_project_components(project_key: str):
    return get(f"/projects/{project_key}/components")

def create_version(project_key: str, name: str, description: str = "", start_date: str = None, release_date: str = None):
    body = {"name": name, "description": description}
    if start_date:
        body["start_date"] = start_date
    if release_date:
        body["release_date"] = release_date
    return post(f"/projects/{project_key}/versions", body)


# Issues
def get_issue(issue_key: str):
    return get(f"/issues/{issue_key}")

def get_project_issues(project_key: str, status: str = None, issue_type: str = None, start: int = 0, limit: int = 50):
    params = {"start": start, "limit": limit}
    if status:
        params["status"] = status
    if issue_type:
        params["issue_type"] = issue_type
    return get(f"/projects/{project_key}/issues", params)

def search_issues(jql: str, start: int = 0, limit: int = 50):
    return get("/search", {"jql": jql, "start": start, "limit": limit})

def create_issue(body: dict):
    return post("/issues", body)

def update_issue(issue_key: str, body: dict):
    return put(f"/issues/{issue_key}", body)

def delete_issue(issue_key: str):
    return delete(f"/issues/{issue_key}")


# Comments
def get_comments(issue_key: str):
    return get(f"/issues/{issue_key}/comments")

def add_comment(issue_key: str, body_text: str, author_id: str = None):
    payload = {"body": body_text}
    if author_id:
        payload["author_id"] = author_id
    return post(f"/issues/{issue_key}/comments", payload)

def edit_comment(issue_key: str, comment_id: str, new_body: str):
    return put(f"/issues/{issue_key}/comments/{comment_id}", {"body": new_body})


# Worklogs
def get_worklogs(issue_key: str):
    return get(f"/issues/{issue_key}/worklogs")

def add_worklog(issue_key: str, time_spent: str, comment: str = None, author_id: str = None, started: str = None):
    payload = {"time_spent": time_spent}
    if comment:
        payload["comment"] = comment
    if author_id:
        payload["author_id"] = author_id
    if started:
        payload["started"] = started
    return post(f"/issues/{issue_key}/worklogs", payload)


# Transitions
def get_transitions(issue_key: str):
    return get(f"/issues/{issue_key}/transitions")

def transition_issue(issue_key: str, transition_id: str = None, transition_name: str = None, comment: str = None):
    payload = {}
    if transition_id:
        payload["transition_id"] = transition_id
    if transition_name:
        payload["transition_name"] = transition_name
    if comment:
        payload["comment"] = comment
    return post(f"/issues/{issue_key}/transitions", payload)


# Sprints & Boards
def get_boards(project_key: str = None, board_type: str = None, name: str = None):
    params = {}
    if project_key:
        params["project_key"] = project_key
    return get("/boards", params if params else None)

def get_board_sprints(board_id: str, state: str = None):
    params = {"state": state} if state else None
    return get(f"/boards/{board_id}/sprints", params)

def get_sprint_issues(sprint_id: str):
    return get(f"/sprints/{sprint_id}/issues")

def create_sprint(board_id: str, name: str, start_date: str = None, end_date: str = None, goal: str = ""):
    payload = {"board_id": board_id, "name": name, "goal": goal}
    if start_date:
        payload["start_date"] = start_date
    if end_date:
        payload["end_date"] = end_date
    return post("/sprints", payload)

def update_sprint(sprint_id: str, body: dict):
    return put(f"/sprints/{sprint_id}", body)

def add_issues_to_sprint(sprint_id: str, issue_keys: list):
    return post(f"/sprints/{sprint_id}/issues", {"issue_keys": issue_keys})


# Links
def get_link_types():
    return get("/link-types")

def create_issue_link(source_key: str, link_type: str, target_key: str):
    return post(f"/issues/{source_key}/links", {"type": link_type, "target_key": target_key})

def delete_issue_link(issue_key: str, link_id: str):
    return delete(f"/issues/{issue_key}/links/{link_id}")


# Users
def get_users():
    return get("/users")

def get_user(identifier: str):
    return get(f"/users/{identifier}")


# Watchers
def get_watchers(issue_key: str):
    return get(f"/issues/{issue_key}/watchers")

def add_watcher(issue_key: str, user_identifier: str):
    return post(f"/issues/{issue_key}/watchers", {"user_identifier": user_identifier})

def remove_watcher(issue_key: str, account_id: str):
    return delete(f"/issues/{issue_key}/watchers/{account_id}")

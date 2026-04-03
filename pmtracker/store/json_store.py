import json
import os
import shutil
from pathlib import Path

# Seed data bundled with the app
_SEED_DIR = Path(__file__).parent / "data"

# Persistent data directory — survives Azure deployments.
# On Azure set DATA_DIR=/home/data; locally falls back to seed dir.
_env_dir = os.environ.get("DATA_DIR")
DATA_DIR = Path(_env_dir) if _env_dir else _SEED_DIR


def _ensure_data_dir():
    """Copy seed data into persistent DATA_DIR if it's empty (first deploy)."""
    if DATA_DIR == _SEED_DIR:
        return  # local dev — seed dir is the data dir
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for seed_file in _SEED_DIR.glob("*.json"):
        target = DATA_DIR / seed_file.name
        if not target.exists():
            shutil.copy2(seed_file, target)


_ensure_data_dir()


# ---------------------------------------------------------------------------
# Generic I/O helpers (task 2.2)
# ---------------------------------------------------------------------------

def load(filename: str, default=None):
    """Read {DATA_DIR}/{filename}.json. Returns default if file does not exist."""
    path = DATA_DIR / f"{filename}.json"
    if not path.exists():
        return default if default is not None else []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save(filename: str, data) -> None:
    """Write data back to {DATA_DIR}/{filename}.json (indent=2)."""
    path = DATA_DIR / f"{filename}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


# ---------------------------------------------------------------------------
# Typed read helpers (task 2.3)
# ---------------------------------------------------------------------------

def get_issues() -> list:
    return load("issues", default=[])


def get_issue(issue_key: str) -> dict | None:
    for issue in get_issues():
        if issue.get("key") == issue_key:
            return issue
    return None


def get_projects() -> list:
    return load("projects", default=[])


def get_project(project_key: str) -> dict | None:
    for project in get_projects():
        if project.get("key") == project_key:
            return project
    return None


def get_users() -> list:
    return load("users", default=[])


def get_user(identifier: str) -> dict | None:
    """Find user by accountId, emailAddress, or displayName (case-insensitive)."""
    identifier_lower = identifier.lower()
    for user in get_users():
        if (
            user.get("accountId", "").lower() == identifier_lower
            or user.get("emailAddress", "").lower() == identifier_lower
            or user.get("displayName", "").lower() == identifier_lower
        ):
            return user
    return None


def get_boards() -> list:
    return load("boards", default=[])


def get_board(board_id: str) -> dict | None:
    for board in get_boards():
        if board.get("id") == board_id:
            return board
    return None


def get_sprints() -> list:
    return load("sprints", default=[])


def get_sprint(sprint_id: str) -> dict | None:
    for sprint in get_sprints():
        if sprint.get("id") == sprint_id:
            return sprint
    return None


def get_worklogs() -> dict:
    return load("worklogs", default={})


def get_fields() -> list:
    return load("fields", default=[])


def get_link_types() -> list:
    return load("link_types", default=[])


# ---------------------------------------------------------------------------
# Typed write helpers (task 2.4)
# ---------------------------------------------------------------------------

def save_issues(issues: list) -> None:
    save("issues", issues)


def save_projects(projects: list) -> None:
    save("projects", projects)


def save_sprints(sprints: list) -> None:
    save("sprints", sprints)


def save_worklogs(worklogs: dict) -> None:
    save("worklogs", worklogs)


def get_agent_keys() -> list:
    return load("agent_keys", default=[])


def save_agent_keys(keys: list) -> None:
    save("agent_keys", keys)


def get_assignments() -> list:
    return load("project_assignments", default=[])


def save_assignments(assignments: list) -> None:
    save("project_assignments", assignments)


# ---------------------------------------------------------------------------
# Key generation (task 2.5)
# ---------------------------------------------------------------------------

def next_issue_key(project_key: str) -> str:
    """Return the next available issue key for the given project, e.g. ECOM-11."""
    issues = get_issues()
    max_num = 0
    prefix = f"{project_key}-"
    for issue in issues:
        key = issue.get("key", "")
        if key.startswith(prefix):
            try:
                num = int(key[len(prefix):])
                if num > max_num:
                    max_num = num
            except ValueError:
                pass
    return f"{project_key}-{max_num + 1}"

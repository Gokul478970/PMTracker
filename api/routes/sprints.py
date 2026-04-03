from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pmtracker.store import json_store

router = APIRouter(tags=["sprints"])


class SprintCreate(BaseModel):
    board_id: str
    name: str
    start_date: str | None = None
    end_date: str | None = None
    goal: str = ""


class SprintUpdate(BaseModel):
    name: str | None = None
    state: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    goal: str | None = None


class AddIssuesToSprint(BaseModel):
    issue_keys: list[str]


@router.get("/boards")
def list_boards(project_key: str = None):
    boards = json_store.get_boards()
    if project_key:
        pk = project_key.upper()
        filtered = [b for b in boards if b.get("projectKey", "").upper() == pk]
        if not filtered:
            # Auto-create a board for existing projects that don't have one
            project = json_store.get_project(pk)
            if project:
                existing_ids = [int(b["id"]) for b in boards if str(b.get("id", "")).isdigit()]
                new_board_id = str(max(existing_ids, default=0) + 1)
                new_board = {"id": new_board_id, "name": f"{pk} Board", "type": "scrum", "projectKey": pk}
                boards.append(new_board)
                json_store.save("boards", boards)
                filtered = [new_board]
        return filtered
    return boards


@router.get("/boards/{board_id}/sprints")
def get_board_sprints(board_id: str, state: str = None):
    board = json_store.get_board(board_id)
    if not board:
        raise HTTPException(404, f"Board '{board_id}' not found.")
    sprints = json_store.get_sprints()
    result = [s for s in sprints if s.get("boardId") == board_id]
    if state:
        result = [s for s in result if s.get("state", "").lower() == state.lower()]
    return result


@router.get("/sprints/{sprint_id}")
def get_sprint(sprint_id: str):
    sprint = json_store.get_sprint(sprint_id)
    if not sprint:
        raise HTTPException(404, f"Sprint '{sprint_id}' not found.")
    return sprint


@router.get("/sprints/{sprint_id}/issues")
def get_sprint_issues(sprint_id: str):
    sprint = json_store.get_sprint(sprint_id)
    if not sprint:
        raise HTTPException(404, f"Sprint '{sprint_id}' not found.")
    issues = json_store.get_issues()
    return [i for i in issues if str(i["fields"].get("sprint", "")) == str(sprint_id)]


@router.post("/sprints", status_code=201)
def create_sprint(body: SprintCreate):
    board = json_store.get_board(body.board_id)
    if not board:
        raise HTTPException(404, f"Board '{body.board_id}' not found.")

    sprints = json_store.get_sprints()
    existing_ids = [int(s["id"]) for s in sprints if str(s.get("id", "")).isdigit()]
    new_id = str(max(existing_ids, default=0) + 1)

    sprint = {
        "id": new_id,
        "name": body.name,
        "state": "future",
        "boardId": body.board_id,
        "startDate": body.start_date,
        "endDate": body.end_date,
        "goal": body.goal,
    }
    sprints.append(sprint)
    json_store.save_sprints(sprints)
    return sprint


@router.put("/sprints/{sprint_id}")
def update_sprint(sprint_id: str, body: SprintUpdate):
    sprints = json_store.get_sprints()
    sprint = next((s for s in sprints if s["id"] == sprint_id), None)
    if not sprint:
        raise HTTPException(404, f"Sprint '{sprint_id}' not found.")

    if body.state and body.state.lower() == "active":
        board_id = sprint.get("boardId")
        active_others = [
            s for s in sprints
            if s["id"] != sprint_id and s.get("boardId") == board_id and s.get("state", "").lower() == "active"
        ]
        if active_others:
            raise HTTPException(400, f"Board already has an active sprint: {active_others[0]['name']}")

    if body.name is not None:
        sprint["name"] = body.name
    if body.state is not None:
        sprint["state"] = body.state.lower()
    if body.start_date is not None:
        sprint["startDate"] = body.start_date
    if body.end_date is not None:
        sprint["endDate"] = body.end_date
    if body.goal is not None:
        sprint["goal"] = body.goal

    json_store.save_sprints(sprints)
    return sprint


@router.post("/sprints/{sprint_id}/issues")
def add_issues_to_sprint(sprint_id: str, body: AddIssuesToSprint):
    sprint = json_store.get_sprint(sprint_id)
    if not sprint:
        raise HTTPException(404, f"Sprint '{sprint_id}' not found.")

    issues = json_store.get_issues()
    added = []
    for key in body.issue_keys:
        issue = next((i for i in issues if i["key"] == key), None)
        if issue:
            issue["fields"]["sprint"] = sprint_id
            added.append(key)

    if added:
        json_store.save_issues(issues)
    return {"sprint_id": sprint_id, "added": added}

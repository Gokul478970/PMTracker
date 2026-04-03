from pmtracker import api_client
from pmtracker.tools.issues import parse_jql


def register(mcp):

    @mcp.tool()
    def get_agile_boards(
        project_key: str = None,
        board_type: str = None,
        name: str = None,
        start: int = 0,
        limit: int = 10,
    ) -> dict:
        """Get all agile boards, optionally filtered by project, type, or name."""
        boards = api_client.get_boards(project_key=project_key)
        if board_type:
            boards = [b for b in boards if b.get("type", "").lower() == board_type.lower()]
        if name:
            boards = [b for b in boards if name.lower() in b.get("name", "").lower()]
        total = len(boards)
        page = boards[start: start + limit]
        return {"total": total, "start": start, "limit": limit, "values": page}

    @mcp.tool()
    def get_sprints_from_board(
        board_id: str,
        state: str = None,
        start: int = 0,
        limit: int = 10,
    ) -> dict:
        """Get sprints for a specific agile board."""
        sprints = api_client.get_board_sprints(board_id, state=state)
        total = len(sprints)
        page = sprints[start: start + limit]
        return {"total": total, "start": start, "limit": limit, "values": page}

    @mcp.tool()
    def get_sprint_issues(
        sprint_id: str,
        start: int = 0,
        limit: int = 10,
        fields: str = None,
    ) -> dict:
        """Get all issues assigned to a specific sprint."""
        issues = api_client.get_sprint_issues(sprint_id)
        total = len(issues)
        page = issues[start: start + limit]
        return {"total": total, "start": start, "limit": limit, "issues": page}

    @mcp.tool()
    def get_board_issues(
        board_id: str,
        jql: str = None,
        start: int = 0,
        limit: int = 10,
        fields: str = None,
    ) -> dict:
        """Get issues on a board, optionally filtered by JQL."""
        boards = api_client.get_boards()
        board = next((b for b in boards if str(b["id"]) == str(board_id)), None)
        if board is None:
            raise ValueError(f"Board '{board_id}' not found.")

        project_key = board.get("projectKey")
        if project_key:
            result = api_client.get_project_issues(project_key, limit=200)
            board_issues = result.get("issues", [])
        else:
            board_issues = []

        if jql:
            predicate = parse_jql(jql)
            board_issues = [i for i in board_issues if predicate(i)]

        total = len(board_issues)
        page = board_issues[start: start + limit]
        return {"board_id": board_id, "total": total, "start": start, "limit": limit, "issues": page}

    @mcp.tool()
    def create_sprint(
        board_id: str,
        name: str,
        start_date: str = None,
        end_date: str = None,
        goal: str = None,
    ) -> dict:
        """Create a new sprint on an agile board."""
        return api_client.create_sprint(board_id, name, start_date=start_date, end_date=end_date, goal=goal or "")

    @mcp.tool()
    def update_sprint(
        sprint_id: str,
        name: str = None,
        state: str = None,
        start_date: str = None,
        end_date: str = None,
        goal: str = None,
    ) -> dict:
        """Update sprint details. Cannot activate a sprint if another is already active on the board."""
        body = {}
        if name is not None:
            body["name"] = name
        if state is not None:
            body["state"] = state
        if start_date is not None:
            body["start_date"] = start_date
        if end_date is not None:
            body["end_date"] = end_date
        if goal is not None:
            body["goal"] = goal
        return api_client.update_sprint(sprint_id, body)

    @mcp.tool()
    def add_issues_to_sprint(sprint_id: str, issue_keys: list) -> dict:
        """Add a list of issues to a sprint."""
        return api_client.add_issues_to_sprint(sprint_id, issue_keys)

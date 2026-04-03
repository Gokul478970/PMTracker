import json as _json

from pmtracker import api_client


# ---------------------------------------------------------------------------
# JQL parser — kept for get_board_issues in sprints.py (local filtering)
# ---------------------------------------------------------------------------

def parse_jql(jql: str):
    """Parse a simple JQL string and return a filter callable(issue) -> bool."""
    import re
    jql_clean = re.sub(r"\s+ORDER\s+BY\s+.*$", "", jql, flags=re.IGNORECASE).strip()
    clauses = re.split(r"\s+AND\s+", jql_clean, flags=re.IGNORECASE)

    predicates = []
    for clause in clauses:
        clause = clause.strip()

        m = re.match(r"project\s*=\s*[\"']?([A-Z][A-Z0-9_]+)[\"']?", clause, re.IGNORECASE)
        if m:
            proj = m.group(1).upper()
            predicates.append(lambda i, p=proj: i["fields"].get("project", {}).get("key", "").upper() == p)
            continue

        m = re.match(r'status\s*=\s*["\']?(.+?)["\']?\s*$', clause, re.IGNORECASE)
        if m:
            status_val = m.group(1).strip().strip("\"'")
            predicates.append(lambda i, s=status_val: i["fields"].get("status", {}).get("name", "").lower() == s.lower())
            continue

        m = re.match(r'assignee\s*=\s*["\']?(.+?)["\']?\s*$', clause, re.IGNORECASE)
        if m:
            assignee_id = m.group(1).strip().strip("\"'")
            predicates.append(lambda i, a=assignee_id: (i["fields"].get("assignee") or {}).get("accountId", "").lower() == a.lower())
            continue

        m = re.match(r'issuetype\s*=\s*["\']?(.+?)["\']?\s*$', clause, re.IGNORECASE)
        if m:
            itype = m.group(1).strip().strip("\"'")
            predicates.append(lambda i, t=itype: i["fields"].get("issuetype", {}).get("name", "").lower() == t.lower())
            continue

        m = re.match(r"labels\s+in\s*\((.+?)\)", clause, re.IGNORECASE)
        if m:
            raw = m.group(1)
            label_set = {lbl.strip().strip("\"'") for lbl in raw.split(",")}
            predicates.append(lambda i, ls=label_set: bool(set(i["fields"].get("labels", [])) & ls))
            continue

        m = re.match(r'sprint\s*=\s*["\']?(.+?)["\']?\s*$', clause, re.IGNORECASE)
        if m:
            sprint_val = m.group(1).strip().strip("\"'")
            predicates.append(lambda i, sv=sprint_val: str(i["fields"].get("sprint", "")).lower() == sv.lower())
            continue

    if not predicates:
        return lambda i: True

    def combined(issue):
        return all(p(issue) for p in predicates)

    return combined


# ---------------------------------------------------------------------------
# Tool registration
# ---------------------------------------------------------------------------

def register(mcp):

    @mcp.tool()
    def get_issue(
        issue_key: str,
        fields: str = "summary,status,assignee,reporter,priority,issuetype,created,updated,description,comment,labels,components,fixVersions,epic",
        expand: str = None,
        comment_limit: int = 10,
    ) -> dict:
        """Get details of a specific Jira issue by its key."""
        return api_client.get_issue(issue_key)

    @mcp.tool()
    def get_project_issues(
        project_key: str,
        status: str = None,
        issue_type: str = None,
        assignee: str = None,
        start: int = 0,
        limit: int = 10,
        fields: str = "summary,status,assignee,reporter,priority,issuetype,created,updated,description,comment,labels,components,fixVersions,epic",
    ) -> dict:
        """Get all issues for a specific Jira project with optional filters."""
        return api_client.get_project_issues(project_key, status=status, issue_type=issue_type, start=start, limit=limit)

    @mcp.tool()
    def search(
        jql: str,
        fields: str = "summary,status,assignee,reporter,priority,issuetype,created,updated,description,comment,labels,components,fixVersions,epic",
        start: int = 0,
        limit: int = 10,
        projects_filter: list = None,
        expand: str = None,
        comment_limit: int = 10,
    ) -> dict:
        """Search Jira issues using JQL (Jira Query Language)."""
        return api_client.search_issues(jql, start=start, limit=limit)

    @mcp.tool()
    def create_issue(
        project_key: str,
        summary: str,
        issue_type: str = "Story",
        description: str = None,
        assignee: str = None,
        priority: str = "Medium",
        labels: list = None,
        components: list = None,
        fix_versions: list = None,
        parent_key: str = None,
        epic_link: str = None,
        sprint_id: str = None,
        story_points: int = None,
        extra_fields: dict = None,
    ) -> dict:
        """Create a new Jira issue."""
        body = {
            "project_key": project_key,
            "summary": summary,
            "issue_type": issue_type,
            "description": description or "",
            "priority": priority,
            "labels": labels or [],
            "components": components or [],
            "fix_versions": fix_versions or [],
        }
        if assignee:
            body["assignee"] = assignee
        if parent_key:
            body["parent_key"] = parent_key
        if epic_link:
            body["epic_link"] = epic_link
        if sprint_id:
            body["sprint_id"] = sprint_id
        if story_points is not None:
            body["story_points"] = story_points
        return api_client.create_issue(body)

    @mcp.tool()
    def batch_create_issues(project_key: str, issues: str) -> list:
        """Batch create multiple Jira issues. issues is a JSON array of issue objects."""
        try:
            issue_list = _json.loads(issues)
        except _json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON for issues: {e}")
        created = []
        for item in issue_list:
            body = {
                "project_key": project_key,
                "summary": item["summary"],
                "issue_type": item.get("issue_type", "Story"),
                "description": item.get("description", ""),
                "priority": item.get("priority", "Medium"),
                "labels": item.get("labels", []),
                "components": item.get("components", []),
                "fix_versions": item.get("fix_versions", []),
            }
            if item.get("assignee"):
                body["assignee"] = item["assignee"]
            if item.get("parent_key"):
                body["parent_key"] = item["parent_key"]
            if item.get("epic_link"):
                body["epic_link"] = item["epic_link"]
            if item.get("sprint_id"):
                body["sprint_id"] = item["sprint_id"]
            if item.get("story_points") is not None:
                body["story_points"] = item["story_points"]
            result = api_client.create_issue(body)
            created.append(result)
        return created

    @mcp.tool()
    def update_issue(
        issue_key: str,
        summary: str = None,
        description: str = None,
        assignee: str = None,
        priority: str = None,
        labels: list = None,
        components: list = None,
        fix_versions: list = None,
        story_points: int = None,
        sprint_id: str = None,
        epic_link: str = None,
        status: str = None,
        parent_key: str = None,
        issue_type: str = None,
        additional_fields: dict = None,
    ) -> dict:
        """Update fields of an existing Jira issue."""
        body = {}
        if summary is not None:
            body["summary"] = summary
        if description is not None:
            body["description"] = description
        if assignee is not None:
            body["assignee"] = assignee
        if priority is not None:
            body["priority"] = priority
        if labels is not None:
            body["labels"] = labels
        if components is not None:
            body["components"] = components
        if fix_versions is not None:
            body["fix_versions"] = fix_versions
        if story_points is not None:
            body["story_points"] = story_points
        if sprint_id is not None:
            body["sprint_id"] = sprint_id
        if epic_link is not None:
            body["epic_link"] = epic_link
        if status is not None:
            body["status"] = status
        if parent_key is not None:
            body["parent_key"] = parent_key
        if issue_type is not None:
            body["issue_type"] = issue_type
        return api_client.update_issue(issue_key, body)

    @mcp.tool()
    def delete_issue(issue_key: str) -> dict:
        """Delete a Jira issue by its key."""
        return api_client.delete_issue(issue_key)

    @mcp.tool()
    def get_issue_dates(issue_key: str) -> dict:
        """Get key dates (created, updated, due date) for a Jira issue."""
        issue = api_client.get_issue(issue_key)
        f = issue["fields"]
        return {
            "issue_key": issue_key,
            "created": f.get("created"),
            "updated": f.get("updated"),
            "dueDate": f.get("dueDate"),
            "resolutionDate": f.get("resolutionDate"),
        }

    @mcp.tool()
    def batch_get_changelogs(issue_keys: list) -> dict:
        """Get transition history (changelog) for multiple Jira issues."""
        result = {}
        for key in issue_keys:
            try:
                issue = api_client.get_issue(key)
                result[key] = issue["fields"].get("transitions_history", [])
            except ValueError:
                result[key] = {"error": f"Issue '{key}' not found."}
        return result

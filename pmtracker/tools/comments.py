from pmtracker import api_client


def register(mcp):

    @mcp.tool()
    def add_comment(issue_key: str, comment: str, author_id: str = None) -> dict:
        """Add a comment to a Jira issue."""
        return api_client.add_comment(issue_key, comment, author_id=author_id)

    @mcp.tool()
    def edit_comment(issue_key: str, comment_id: str, new_body: str) -> dict:
        """Edit an existing comment on a Jira issue."""
        return api_client.edit_comment(issue_key, comment_id, new_body)

    @mcp.tool()
    def add_worklog(
        issue_key: str,
        time_spent: str,
        comment: str = None,
        author_id: str = None,
        started: str = None,
    ) -> dict:
        """Add a worklog entry to a Jira issue.

        time_spent format examples: '1h 30m', '2d', '45m', '3h'.
        """
        return api_client.add_worklog(issue_key, time_spent, comment=comment, author_id=author_id, started=started)

    @mcp.tool()
    def get_worklog(issue_key: str) -> dict:
        """Get all worklog entries for a Jira issue."""
        entries = api_client.get_worklogs(issue_key)
        total_seconds = sum(e.get("timeSpentSeconds", 0) for e in entries)
        return {
            "issue_key": issue_key,
            "worklogs": entries,
            "total": len(entries),
            "totalTimeSpentSeconds": total_seconds,
        }

from pmtracker import api_client


def register(mcp):

    @mcp.tool()
    def get_link_types() -> list:
        """Get all available issue link types in Jira."""
        return api_client.get_link_types()

    @mcp.tool()
    def link_to_epic(issue_key: str, epic_key: str) -> dict:
        """Link a Jira issue to an epic."""
        api_client.update_issue(issue_key, {"epic_link": epic_key})
        return {"issue_key": issue_key, "epic_key": epic_key, "linked": True}

    @mcp.tool()
    def create_issue_link(
        link_type: str,
        inward_issue_key: str,
        outward_issue_key: str,
        comment: str = None,
    ) -> dict:
        """Create a link between two Jira issues."""
        return api_client.create_issue_link(inward_issue_key, link_type, outward_issue_key)

    @mcp.tool()
    def create_remote_issue_link(
        issue_key: str,
        url: str,
        title: str,
        summary: str = None,
    ) -> dict:
        """Add a remote (web) link to a Jira issue."""
        return {
            "message": "Remote link created (simulated)",
            "issue_key": issue_key,
            "url": url,
            "title": title,
        }

    @mcp.tool()
    def remove_issue_link(link_id: str) -> dict:
        """Remove a link between two Jira issues by link ID."""
        result = api_client.search_issues("", start=0, limit=500)
        for issue in result.get("issues", []):
            for link in issue["fields"].get("issueLinks", []):
                if link.get("id") == link_id:
                    return api_client.delete_issue_link(issue["key"], link_id)
        raise ValueError(f"Link '{link_id}' not found.")

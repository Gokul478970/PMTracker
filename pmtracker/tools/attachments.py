from pmtracker import api_client


def register(mcp):

    @mcp.tool()
    def download_attachments(issue_key: str) -> dict:
        """Download attachments from a Jira issue (simulated — no real files)."""
        # Verify issue exists via API
        api_client.get_issue(issue_key)
        return {
            "message": "Simulation: no real files. Attachments: []",
            "issue_key": issue_key,
            "attachments": [],
        }

    @mcp.tool()
    def get_issue_images(issue_key: str) -> dict:
        """Get all images attached to a Jira issue (simulated — no real files)."""
        api_client.get_issue(issue_key)
        return {
            "message": "Simulation: no real files. Images: []",
            "issue_key": issue_key,
            "images": [],
        }

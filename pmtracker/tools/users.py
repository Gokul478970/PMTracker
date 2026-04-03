from pmtracker import api_client


def register(mcp):

    @mcp.tool()
    def get_user_profile(user_identifier: str) -> dict:
        """Retrieve profile information for a specific Jira user."""
        return api_client.get_user(user_identifier)

    @mcp.tool()
    def get_issue_watchers(issue_key: str) -> list:
        """Get the list of watchers for a Jira issue."""
        return api_client.get_watchers(issue_key)

    @mcp.tool()
    def add_watcher(issue_key: str, user_identifier: str) -> dict:
        """Add a user as a watcher to a Jira issue."""
        return api_client.add_watcher(issue_key, user_identifier)

    @mcp.tool()
    def remove_watcher(
        issue_key: str,
        username: str = None,
        account_id: str = None,
    ) -> dict:
        """Remove a user from watching a Jira issue."""
        identifier = account_id or username
        if not identifier:
            raise ValueError("Provide at least one of: username, account_id.")
        return api_client.remove_watcher(issue_key, identifier)

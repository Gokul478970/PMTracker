from pmtracker.store.json_store import get_fields
from pmtracker import api_client


def register(mcp):

    @mcp.tool()
    def search_fields(
        keyword: str = "",
        limit: int = 10,
        refresh: bool = False,
    ) -> list:
        """Search Jira fields by keyword with case-insensitive substring match."""
        # Fields metadata is static config, read directly
        all_fields = get_fields()
        kw = keyword.lower()
        matches = [f for f in all_fields if kw in f.get("name", "").lower()]
        return matches[:limit]

    @mcp.tool()
    def get_field_options(
        field_id: str,
        context_id: str = None,
        project_key: str = None,
        issue_type: str = None,
        contains: str = None,
        return_limit: int = None,
        values_only: bool = False,
    ) -> list:
        """Get allowed option values for a custom field."""
        if field_id == "customfield_10001":
            options = [1, 2, 3, 5, 8, 13, 21]
            if contains:
                options = [o for o in options if contains in str(o)]
            if return_limit:
                options = options[:return_limit]
            return options

        if field_id == "customfield_10002":
            # Get epics from API
            result = api_client.search_issues('issuetype = "Epic"', limit=100)
            epic_keys = [i["key"] for i in result.get("issues", [])]
            if contains:
                epic_keys = [k for k in epic_keys if contains.upper() in k.upper()]
            if return_limit:
                epic_keys = epic_keys[:return_limit]
            return epic_keys

        return []

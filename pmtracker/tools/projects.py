import json

from pmtracker import api_client


def register(mcp):

    @mcp.tool()
    def get_all_projects(include_archived: bool = False) -> list:
        """Get all Jira projects accessible to the current user."""
        return api_client.get_all_projects(include_archived=include_archived)

    @mcp.tool()
    def get_project_versions(project_key: str) -> list:
        """Get all fix versions for a specific Jira project."""
        return api_client.get_project_versions(project_key)

    @mcp.tool()
    def get_project_components(project_key: str) -> list:
        """Get all components for a specific Jira project."""
        return api_client.get_project_components(project_key)

    @mcp.tool()
    def create_version(
        project_key: str,
        name: str,
        start_date: str = None,
        release_date: str = None,
        description: str = None,
    ) -> dict:
        """Create a new fix version in a Jira project."""
        return api_client.create_version(project_key, name, description=description or "", start_date=start_date, release_date=release_date)

    @mcp.tool()
    def batch_create_versions(project_key: str, versions: str) -> list:
        """Batch create multiple versions in a Jira project. versions is a JSON array."""
        try:
            version_list = json.loads(versions)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON for versions: {e}")

        created = []
        for v in version_list:
            result = api_client.create_version(
                project_key,
                name=v["name"],
                description=v.get("description", ""),
                start_date=v.get("startDate") or v.get("start_date"),
                release_date=v.get("releaseDate") or v.get("release_date"),
            )
            created.append(result)
        return created

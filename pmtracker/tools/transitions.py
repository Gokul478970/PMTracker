from pmtracker import api_client

# Keep STATUS_OBJECTS and TRANSITIONS here since api/routes imports them
STATUS_OBJECTS = {
    "To Do": {
        "id": "1",
        "name": "To Do",
        "statusCategory": {"id": 2, "key": "new", "name": "To Do"},
    },
    "In Progress": {
        "id": "3",
        "name": "In Progress",
        "statusCategory": {"id": 4, "key": "indeterminate", "name": "In Progress"},
    },
    "In Review": {
        "id": "4",
        "name": "In Review",
        "statusCategory": {"id": 4, "key": "indeterminate", "name": "In Progress"},
    },
    "Done": {
        "id": "10001",
        "name": "Done",
        "statusCategory": {"id": 3, "key": "done", "name": "Done"},
    },
}

TRANSITIONS = {
    "To Do": [
        {"id": "11", "name": "In Progress"},
        {"id": "41", "name": "Done"},
    ],
    "In Progress": [
        {"id": "21", "name": "To Do"},
        {"id": "31", "name": "In Review"},
        {"id": "41", "name": "Done"},
    ],
    "In Review": [
        {"id": "11", "name": "In Progress"},
        {"id": "41", "name": "Done"},
    ],
    "Done": [
        {"id": "11", "name": "In Progress"},
    ],
}


def register(mcp):

    @mcp.tool()
    def get_transitions(issue_key: str) -> list:
        """Get available status transitions for a Jira issue."""
        return api_client.get_transitions(issue_key)

    @mcp.tool()
    def transition_issue(
        issue_key: str,
        transition_id: str = None,
        transition_name: str = None,
        comment: str = None,
    ) -> dict:
        """Transition a Jira issue to a new status using a transition ID or name."""
        if not transition_id and not transition_name:
            raise ValueError("Provide at least one of: transition_id, transition_name.")
        return api_client.transition_issue(issue_key, transition_id=transition_id, transition_name=transition_name, comment=comment)

from pmtracker.tools import (
    projects,
    users,
    fields,
    attachments,
    issues,
    comments,
    transitions,
    sprints,
    linking,
)


def register_all_tools(mcp):
    projects.register(mcp)
    users.register(mcp)
    fields.register(mcp)
    attachments.register(mcp)
    issues.register(mcp)
    comments.register(mcp)
    transitions.register(mcp)
    sprints.register(mcp)
    linking.register(mcp)

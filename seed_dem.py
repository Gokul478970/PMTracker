"""Seed the DEM (Demo) project with sample data via the PMTracker API."""

import sys
from pmtracker import api_client

PROJECT_KEY = "DEM"

# 1. Create the project
try:
    result = api_client.post("/projects", {
        "key": PROJECT_KEY,
        "name": "Demo Project",
        "description": "Sample project for demo mode — explore Velocity's features in read-only mode.",
        "components": ["Frontend", "Backend", "API", "DevOps"],
    })
    print(f"Created project: {result['key']}")
except Exception as e:
    if "already exists" in str(e):
        print(f"Project {PROJECT_KEY} already exists, skipping creation.")
    else:
        print(f"Error creating project: {e}", file=sys.stderr)
        sys.exit(1)

# 2. Get the board
boards = api_client.get(f"/boards?project_key={PROJECT_KEY}")
if not boards:
    print("No board found!", file=sys.stderr)
    sys.exit(1)
board_id = boards[0]["id"]
print(f"Board ID: {board_id}")

# 3. Create sprints
sprint_defs = [
    {"name": "Sprint 1", "goal": "Core authentication and project setup", "start_date": "2026-02-17T00:00:00.000Z", "end_date": "2026-03-03T00:00:00.000Z"},
    {"name": "Sprint 2", "goal": "Dashboard and reporting", "start_date": "2026-03-03T00:00:00.000Z", "end_date": "2026-03-17T00:00:00.000Z"},
    {"name": "Sprint 3", "goal": "Notifications and integrations", "start_date": None, "end_date": None},
]

sprint_ids = []
for sd in sprint_defs:
    try:
        result = api_client.post("/sprints", {"board_id": board_id, **sd})
        sprint_ids.append(result["id"])
        print(f"  Created sprint: {result['name']} (id={result['id']})")
    except Exception as e:
        print(f"  Error creating sprint: {e}", file=sys.stderr)

# Close sprint 1, activate sprint 2
if len(sprint_ids) >= 2:
    try:
        api_client.put(f"/sprints/{sprint_ids[0]}", {"state": "closed"})
        print(f"  Sprint 1 closed")
    except Exception as e:
        print(f"  Error closing sprint 1: {e}")
    try:
        api_client.put(f"/sprints/{sprint_ids[1]}", {"state": "active"})
        print(f"  Sprint 2 activated")
    except Exception as e:
        print(f"  Error activating sprint 2: {e}")

# 4. Create issues
issues = [
    # Epics
    {"summary": "User Authentication", "issue_type": "Epic", "priority": "Highest", "description": "Implement end-to-end user authentication with JWT tokens, OAuth2, and session management.", "labels": ["epic", "auth"]},
    {"summary": "Dashboard & Analytics", "issue_type": "Epic", "priority": "High", "description": "Build interactive dashboard with charts, metrics, and real-time data visualization.", "labels": ["epic", "dashboard"]},
    # Stories in Sprint 1 (closed) — all Done
    {"summary": "Implement JWT token generation", "issue_type": "Story", "priority": "Highest", "description": "Create JWT token generation and validation service with refresh token support.", "labels": ["auth", "backend"], "story_points": 5, "status": "Done", "sprint_idx": 0, "epic_idx": 0},
    {"summary": "Build login page UI", "issue_type": "Story", "priority": "High", "description": "Design and implement the login page with email/password form and social login buttons.", "labels": ["auth", "frontend"], "story_points": 3, "status": "Done", "sprint_idx": 0, "epic_idx": 0},
    {"summary": "Add password reset flow", "issue_type": "Story", "priority": "Medium", "description": "Allow users to reset their password via email verification link.", "labels": ["auth"], "story_points": 3, "status": "Done", "sprint_idx": 0, "epic_idx": 0},
    # Stories in Sprint 2 (active) — mixed statuses
    {"summary": "Create dashboard layout", "issue_type": "Story", "priority": "High", "description": "Build the main dashboard grid layout with responsive card components.", "labels": ["dashboard", "frontend"], "story_points": 5, "status": "In Progress", "sprint_idx": 1, "epic_idx": 1},
    {"summary": "Implement metrics API", "issue_type": "Story", "priority": "High", "description": "Build REST API endpoints to aggregate and serve project metrics data.", "labels": ["dashboard", "backend"], "story_points": 8, "status": "In Review", "sprint_idx": 1, "epic_idx": 1},
    {"summary": "Add chart components", "issue_type": "Story", "priority": "Medium", "description": "Integrate charting library and create reusable chart components for velocity and burndown.", "labels": ["dashboard", "frontend"], "story_points": 5, "status": "To Do", "sprint_idx": 1, "epic_idx": 1},
    # Bug
    {"summary": "Fix session timeout not redirecting to login", "issue_type": "Bug", "priority": "High", "description": "When JWT token expires, the user sees a blank page instead of being redirected to login.", "labels": ["auth", "bug"], "story_points": 2, "status": "In Progress", "sprint_idx": 1, "epic_idx": 0},
    # Backlog items (no sprint)
    {"summary": "Add email notification preferences", "issue_type": "Story", "priority": "Low", "description": "Allow users to configure which email notifications they receive.", "labels": ["notifications"], "story_points": 3, "epic_idx": 1},
    {"summary": "Integrate Slack webhook", "issue_type": "Task", "priority": "Medium", "description": "Set up Slack incoming webhook to push project update notifications.", "labels": ["integrations"], "story_points": 2},
]

created_keys = []
epic_keys = []

for i, iss in enumerate(issues):
    body = {
        "project_key": PROJECT_KEY,
        "summary": iss["summary"],
        "issue_type": iss["issue_type"],
        "description": iss.get("description", ""),
        "priority": iss.get("priority", "Medium"),
        "labels": iss.get("labels", []),
    }
    if iss.get("story_points"):
        body["story_points"] = iss["story_points"]
    if "epic_idx" in iss and iss["issue_type"] != "Epic" and len(epic_keys) > iss["epic_idx"]:
        body["epic_link"] = epic_keys[iss["epic_idx"]]

    try:
        result = api_client.post("/issues", body)
        key = result["key"]
        created_keys.append(key)
        if iss["issue_type"] == "Epic":
            epic_keys.append(key)
        print(f"  [{i+1}/{len(issues)}] {key}: {iss['summary'][:50]}")

        # Set status if not default
        if iss.get("status") and iss["status"] != "To Do":
            try:
                api_client.post(f"/issues/{key}/transitions", {"transition_name": iss["status"]})
            except:
                pass

        # Add to sprint
        if "sprint_idx" in iss and len(sprint_ids) > iss["sprint_idx"]:
            try:
                api_client.post(f"/sprints/{sprint_ids[iss['sprint_idx']]}/issues", {"issue_keys": [key]})
            except:
                pass

    except Exception as e:
        print(f"  [{i+1}/{len(issues)}] ERROR: {iss['summary'][:50]} - {e}", file=sys.stderr)

# 5. Add some comments
if len(created_keys) >= 4:
    comments = [
        (created_keys[2], "JWT implementation looks good. Added refresh token rotation."),
        (created_keys[2], "Merged to main. All tests passing."),
        (created_keys[5], "Dashboard layout wireframes approved by design team."),
        (created_keys[8], "Reproducing this consistently on Chrome. Investigating the interceptor."),
    ]
    for key, text in comments:
        try:
            api_client.post(f"/issues/{key}/comments", {"body": text})
        except:
            pass

print(f"\n=== DONE ===")
print(f"Created {len(created_keys)} issues in {PROJECT_KEY}")

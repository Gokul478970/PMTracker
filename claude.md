# PMTracker — Jira MCP Server Simulator

A local Python MCP server that simulates the [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian) Jira MCP, exposing identical tool names and schemas. Data is stored in local JSON files. Transport: stdio (compatible with Claude Desktop and Claude Code).

---

## Implementation Steps

### Step 1 — Bootstrap the Project Structure

Create the following directory and file layout from the repo root:

```
JiraMCP/
├── claude.md                   ← this file
├── requirements.txt
├── pyproject.toml
├── server.py                   ← entry point
├── pmtracker/
│   ├── __init__.py
│   ├── server.py               ← MCP server wiring
│   ├── constants.py            ← shared patterns, defaults
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── issues.py           ← get_issue, search, create_issue, update_issue, delete_issue, get_project_issues, batch_create_issues, get_issue_dates, batch_get_changelogs
│   │   ├── comments.py         ← add_comment, edit_comment, add_worklog, get_worklog
│   │   ├── transitions.py      ← get_transitions, transition_issue
│   │   ├── sprints.py          ← get_agile_boards, get_board_issues, get_sprints_from_board, get_sprint_issues, create_sprint, update_sprint, add_issues_to_sprint
│   │   ├── projects.py         ← get_all_projects, get_project_versions, get_project_components, create_version, batch_create_versions
│   │   ├── linking.py          ← get_link_types, link_to_epic, create_issue_link, create_remote_issue_link, remove_issue_link
│   │   ├── users.py            ← get_user_profile, get_issue_watchers, add_watcher, remove_watcher
│   │   ├── fields.py           ← search_fields, get_field_options
│   │   └── attachments.py      ← download_attachments, get_issue_images
│   └── store/
│       ├── __init__.py
│       ├── json_store.py       ← read/write helpers for all JSON files
│       └── data/
│           ├── projects.json
│           ├── issues.json
│           ├── users.json
│           ├── boards.json
│           ├── sprints.json
│           ├── link_types.json
│           ├── fields.json
│           └── worklogs.json
└── tests/
    └── test_tools.py
```

**Do not create any files yet — just confirm the layout is understood.**

---

### Step 2 — Set Up Python Package Files

**2.1 `requirements.txt`** — dependencies:
```
mcp>=1.0.0
```

**2.2 `pyproject.toml`** — minimal project config:
```toml
[project]
name = "pmtracker"
version = "0.1.0"
description = "Jira MCP Server Simulator"
requires-python = ">=3.11"
dependencies = ["mcp>=1.0.0"]

[project.scripts]
pmtracker = "server:main"
```

**2.3 `server.py`** — entry point that calls `pmtracker.server.run()`.

Install with:
```bash
pip install -e .
```

---

### Step 3 — Create `pmtracker/constants.py`

Define shared constants used across all tools:

```python
ISSUE_KEY_PATTERN = r"^[A-Z][A-Z0-9_]+-\d+$"
PROJECT_KEY_PATTERN = r"^[A-Z][A-Z0-9_]+$"
DEFAULT_READ_JIRA_FIELDS = "summary,status,assignee,reporter,priority,issuetype,created,updated,description,comment,labels,components,fixVersions,epic"
DEFAULT_COMMENT_LIMIT = 10
DEFAULT_PAGE_LIMIT = 10
MAX_PAGE_LIMIT = 50
```

---

### Step 4 — Create `pmtracker/store/json_store.py`

This is the **data access layer**. Implement the following functions:

- `load(filename: str) -> dict | list` — reads `store/data/{filename}.json`
- `save(filename: str, data: dict | list) -> None` — writes back to file
- `get_issues() -> list[dict]`
- `get_issue(issue_key: str) -> dict | None`
- `get_projects() -> list[dict]`
- `get_project(project_key: str) -> dict | None`
- `get_users() -> list[dict]`
- `get_boards() -> list[dict]`
- `get_sprints() -> list[dict]`
- `get_worklogs() -> dict` — keyed by issue_key
- `get_fields() -> list[dict]`
- `get_link_types() -> list[dict]`
- `next_issue_key(project_key: str) -> str` — generates the next issue key like `PROJ-5`

All reads/writes are synchronous file I/O. No caching needed.

---

### Step 5 — Seed `store/data/` JSON Files with Dummy Data

Create each JSON file with realistic dummy data. Schema details:

**5.1 `projects.json`** — array of project objects:
```json
[
  {
    "id": "10001",
    "key": "ECOM",
    "name": "E-Commerce Platform",
    "projectTypeKey": "software",
    "lead": { "accountId": "user-001", "displayName": "Alice Johnson" },
    "description": "Main e-commerce application",
    "components": ["Frontend", "Backend", "Payments"],
    "versions": []
  },
  {
    "id": "10002",
    "key": "MOB",
    "name": "Mobile App",
    "projectTypeKey": "software",
    "lead": { "accountId": "user-002", "displayName": "Bob Smith" },
    "description": "iOS and Android mobile application",
    "components": ["iOS", "Android", "Shared"],
    "versions": []
  }
]
```

**5.2 `users.json`** — array of user objects:
```json
[
  { "accountId": "user-001", "displayName": "Alice Johnson", "emailAddress": "alice@example.com", "active": true, "timeZone": "America/New_York" },
  { "accountId": "user-002", "displayName": "Bob Smith",    "emailAddress": "bob@example.com",   "active": true, "timeZone": "America/Chicago" },
  { "accountId": "user-003", "displayName": "Carol White",  "emailAddress": "carol@example.com",  "active": true, "timeZone": "Europe/London" }
]
```

**5.3 `issues.json`** — array of issue objects. Each issue must include:
```json
{
  "id": "10001",
  "key": "ECOM-1",
  "fields": {
    "summary": "Implement user login",
    "status": { "id": "3", "name": "In Progress", "statusCategory": { "key": "indeterminate" } },
    "issuetype": { "id": "1", "name": "Story" },
    "priority": { "id": "2", "name": "High" },
    "assignee": { "accountId": "user-001", "displayName": "Alice Johnson" },
    "reporter": { "accountId": "user-002", "displayName": "Bob Smith" },
    "project": { "key": "ECOM", "id": "10001" },
    "description": "As a user I want to log in with email and password.",
    "created": "2025-01-10T09:00:00.000Z",
    "updated": "2025-01-15T14:30:00.000Z",
    "labels": ["authentication", "mvp"],
    "components": [{ "name": "Backend" }],
    "fixVersions": [],
    "comment": { "comments": [], "total": 0 },
    "subtasks": [],
    "parent": null,
    "epic": null,
    "sprint": null,
    "watchers": [],
    "transitions_history": [],
    "remote_links": [],
    "issueLinks": []
  }
}
```

Seed at least **10 issues** across the two projects. Include a mix of issue types: `Epic`, `Story`, `Task`, `Bug`, `Sub-task`. Include at least 2 epics. Assign some issues to sprints (reference sprint IDs from `sprints.json`).

**5.4 `boards.json`** — array of board objects:
```json
[
  { "id": "1", "name": "ECOM Board", "type": "scrum", "projectKey": "ECOM" },
  { "id": "2", "name": "MOB Board",  "type": "kanban", "projectKey": "MOB" }
]
```

**5.5 `sprints.json`** — array of sprint objects:
```json
[
  {
    "id": "1",
    "boardId": "1",
    "name": "Sprint 1",
    "state": "closed",
    "startDate": "2025-01-06T00:00:00.000Z",
    "endDate":   "2025-01-20T00:00:00.000Z",
    "goal": "Deliver login and registration"
  },
  {
    "id": "2",
    "boardId": "1",
    "name": "Sprint 2",
    "state": "active",
    "startDate": "2025-01-20T00:00:00.000Z",
    "endDate":   "2025-02-03T00:00:00.000Z",
    "goal": "Payment integration"
  },
  {
    "id": "3",
    "boardId": "1",
    "name": "Sprint 3",
    "state": "future",
    "startDate": null,
    "endDate":   null,
    "goal": ""
  }
]
```

**5.6 `link_types.json`** — array:
```json
[
  { "id": "1", "name": "Blocks",     "inward": "is blocked by",   "outward": "blocks" },
  { "id": "2", "name": "Cloners",    "inward": "is cloned by",    "outward": "clones" },
  { "id": "3", "name": "Duplicate",  "inward": "is duplicated by","outward": "duplicates" },
  { "id": "4", "name": "Relates",    "inward": "relates to",      "outward": "relates to" }
]
```

**5.7 `fields.json`** — array of field descriptors covering standard Jira fields plus a few custom ones:
```json
[
  { "id": "summary",          "name": "Summary",      "schema": { "type": "string"   }, "custom": false },
  { "id": "status",           "name": "Status",       "schema": { "type": "status"   }, "custom": false },
  { "id": "assignee",         "name": "Assignee",     "schema": { "type": "user"     }, "custom": false },
  { "id": "reporter",         "name": "Reporter",     "schema": { "type": "user"     }, "custom": false },
  { "id": "priority",         "name": "Priority",     "schema": { "type": "priority" }, "custom": false },
  { "id": "issuetype",        "name": "Issue Type",   "schema": { "type": "issuetype"}, "custom": false },
  { "id": "description",      "name": "Description",  "schema": { "type": "string"   }, "custom": false },
  { "id": "labels",           "name": "Labels",       "schema": { "type": "array"    }, "custom": false },
  { "id": "components",       "name": "Components",   "schema": { "type": "array"    }, "custom": false },
  { "id": "fixVersions",      "name": "Fix Version/s","schema": { "type": "array"    }, "custom": false },
  { "id": "customfield_10001","name": "Story Points", "schema": { "type": "number"   }, "custom": true  },
  { "id": "customfield_10002","name": "Epic Link",    "schema": { "type": "string"   }, "custom": true  },
  { "id": "customfield_10003","name": "Sprint",       "schema": { "type": "string"   }, "custom": true  }
]
```

**5.8 `worklogs.json`** — object keyed by issue_key:
```json
{
  "ECOM-1": [
    {
      "id": "wl-001",
      "author": { "accountId": "user-001", "displayName": "Alice Johnson" },
      "timeSpent": "2h",
      "timeSpentSeconds": 7200,
      "started": "2025-01-12T09:00:00.000Z",
      "comment": "Initial implementation"
    }
  ]
}
```

---

### Step 6 — Implement `pmtracker/server.py`

Create the MCP server using the official `mcp` Python SDK:

```python
from mcp.server import Server
from mcp.server.stdio import stdio_server
from pmtracker.tools import register_all_tools

app = Server("pmtracker")
register_all_tools(app)

async def run():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())
```

In `pmtracker/tools/__init__.py`, create `register_all_tools(app)` that imports and registers tools from every sub-module.

---

### Step 7 — Implement Tool Modules

Implement each tool using `@app.tool()` decorator. Match parameter names, types, defaults, and validation patterns exactly to the sooperset/mcp-atlassian schema. Each tool returns a JSON-serializable dict or list.

#### 7.1 `tools/issues.py` — 9 tools

| Tool | Key behavior |
|------|-------------|
| `get_issue` | Look up by `issue_key`. Return filtered `fields` if provided. Respect `comment_limit`. |
| `search` | Filter `issues.json` using simple JQL-like string matching on `project`, `status`, `assignee`, `issuetype`, `labels`. Support `start_at` + `limit` pagination. |
| `get_project_issues` | Filter issues by `project_key`. Paginate with `start_at` + `limit`. |
| `create_issue` | Generate next issue key, create new issue dict, append to `issues.json`. |
| `batch_create_issues` | Parse JSON array, call create logic for each, return array of created keys. |
| `update_issue` | Merge `fields` JSON into `issue["fields"]`. Handle `components` as comma-separated string. Append to `transitions_history` if status changes. |
| `delete_issue` | Remove issue from `issues.json` by key. |
| `get_issue_dates` | Return `created`, `updated`, and `transitions_history` from the issue. |
| `batch_get_changelogs` | Return a dict of `{ issue_key: transitions_history }` for each key. |

**JQL simulation rules for `search`:**
- `project = KEY` → filter by project key
- `status = "Name"` → filter by status name
- `assignee = "email"` → filter by assignee email or accountId
- `issuetype = "Bug"` → filter by issue type
- `labels in ("label")` → filter by label membership
- Combine with `AND` (split on AND, apply all filters)
- `ORDER BY created DESC` → sort results by created date descending
- If JQL is unrecognized, return all issues (graceful fallback)

#### 7.2 `tools/comments.py` — 4 tools

| Tool | Key behavior |
|------|-------------|
| `add_comment` | Append comment object (id, body, author, created) to `issue.fields.comment.comments`. Generate comment id as `cmt-{uuid4()[:8]}`. |
| `edit_comment` | Find comment by `comment_id` in issue, replace `body`. |
| `add_worklog` | Append worklog to `worklogs.json[issue_key]`. Parse `time_spent` string to seconds. |
| `get_worklog` | Return all worklogs for the issue key from `worklogs.json`. |

#### 7.3 `tools/transitions.py` — 2 tools

Define a static set of valid transitions per status. For example:

```python
TRANSITIONS = {
    "To Do":      [{"id": "11", "name": "In Progress"}, {"id": "41", "name": "Done"}],
    "In Progress":[{"id": "21", "name": "To Do"},       {"id": "31", "name": "In Review"}, {"id": "41", "name": "Done"}],
    "In Review":  [{"id": "11", "name": "In Progress"}, {"id": "41", "name": "Done"}],
    "Done":       [{"id": "11", "name": "In Progress"}],
}
```

| Tool | Key behavior |
|------|-------------|
| `get_transitions` | Read current status of issue, return available transitions from the map above. |
| `transition_issue` | Find transition by `transition_id`, update `issue.fields.status`, append to `transitions_history`. |

#### 7.4 `tools/sprints.py` — 7 tools

| Tool | Key behavior |
|------|-------------|
| `get_agile_boards` | Filter `boards.json` by `board_name`, `project_key`, `board_type`. Paginate. |
| `get_board_issues` | Filter issues where `issue.fields.sprint` matches any sprint in the board. Apply JQL filter on top. Paginate. |
| `get_sprints_from_board` | Filter `sprints.json` by `boardId` and optionally `state`. Paginate. |
| `get_sprint_issues` | Filter issues where `issue.fields.sprint == sprint_id`. Paginate. |
| `create_sprint` | Append new sprint to `sprints.json`. Auto-generate `id`. |
| `update_sprint` | Merge non-null fields into the sprint object. If state changes to `active`, validate no other active sprint on same board. |
| `add_issues_to_sprint` | Set `issue.fields.sprint = sprint_id` for each key in comma-separated list. |

#### 7.5 `tools/projects.py` — 5 tools

| Tool | Key behavior |
|------|-------------|
| `get_all_projects` | Return all projects from `projects.json`. If `include_archived=False`, filter out any with `"archived": true`. |
| `get_project_versions` | Return `project["versions"]` for the given key. |
| `get_project_components` | Return `project["components"]` as array of `{"name": ...}` objects. |
| `create_version` | Append version object to `project["versions"]` and save. |
| `batch_create_versions` | Parse JSON array of version objects, call create logic for each. |

#### 7.6 `tools/linking.py` — 5 tools

| Tool | Key behavior |
|------|-------------|
| `get_link_types` | Return all from `link_types.json`, optionally filtered by `name_filter`. |
| `link_to_epic` | Set `issue.fields.epic = epic_key` for the given `issue_key`. |
| `create_issue_link` | Append a link object to both the inward and outward issues' `fields.issueLinks` array. |
| `create_remote_issue_link` | Append a remote link object to `issue.fields.remote_links`. |
| `remove_issue_link` | Remove link by `link_id` from all issues that reference it. |

#### 7.7 `tools/users.py` — 4 tools

| Tool | Key behavior |
|------|-------------|
| `get_user_profile` | Find user in `users.json` by `accountId`, `emailAddress`, or `displayName`. |
| `get_issue_watchers` | Return `issue.fields.watchers` array. |
| `add_watcher` | Find user by `user_identifier`, append their `accountId` to `issue.fields.watchers`. |
| `remove_watcher` | Remove matching watcher from `issue.fields.watchers` by `username` or `account_id`. |

#### 7.8 `tools/fields.py` — 2 tools

| Tool | Key behavior |
|------|-------------|
| `search_fields` | Case-insensitive substring match on `field["name"]` using `keyword`. Return up to `limit` results. |
| `get_field_options` | For `customfield_10001` (Story Points) return numeric options; for `customfield_10002` (Epic Link) return epic issue keys. |

#### 7.9 `tools/attachments.py` — 2 tools

| Tool | Key behavior |
|------|-------------|
| `download_attachments` | Return a simulated response: `{"message": "Simulation: no real files. Attachments: []"}`. |
| `get_issue_images` | Return same simulated empty response. |

---

### Step 8 — Wire Entry Point

**`server.py`** (root-level):
```python
import asyncio
from pmtracker.server import run

def main():
    asyncio.run(run())

if __name__ == "__main__":
    main()
```

---

### Step 9 — Register with Claude Code (MCP Config)

Add to `~/.claude/claude_mcp_config.json` (or `.mcp.json` in the workspace):

```json
{
  "mcpServers": {
    "pmtracker": {
      "command": "python",
      "args": ["c:/Siva/projects/JiraMCP/server.py"]
    }
  }
}
```

Or if installed as a package:
```json
{
  "mcpServers": {
    "pmtracker": {
      "command": "pmtracker"
    }
  }
}
```

---

### Step 10 — Smoke Test Each Tool Group

After implementation, test each group manually via Claude Code by calling the MCP tools. Verify:

1. `get_all_projects` → returns 2 projects
2. `get_issue` with `ECOM-1` → returns full issue
3. `search` with `jql: "project = ECOM AND status = \"In Progress\""` → returns matching issues
4. `create_issue` → creates new issue, key increments correctly
5. `get_transitions` for an issue → returns valid transitions
6. `transition_issue` → status updated, history recorded
7. `get_agile_boards` → returns 2 boards
8. `get_sprints_from_board` with `board_id: "1"` → returns 3 sprints
9. `add_comment` → comment appears in `get_issue`
10. `search_fields` with `keyword: "story"` → returns Story Points field

---

### Step 11 — Add Tests

In `tests/test_tools.py`, write unit tests for:
- `json_store.py`: load/save round-trip, `next_issue_key` generation
- `issues.py`: create, get, delete, search with JQL
- `transitions.py`: valid and invalid transition attempts
- `sprints.py`: create sprint, add issues to sprint

Run with:
```bash
python -m pytest tests/
```

---

## Implementation Order (Recommended)

1. Steps 1–2: scaffold structure and configs
2. Step 3: `constants.py`
3. Step 4: `json_store.py` (data layer first — everything depends on it)
4. Step 5: seed JSON data files
5. Step 6: `pmtracker/server.py`
6. Step 7.5 (`projects.py`) + Step 7.7 (`users.py`): read-only, simple
7. Step 7.1 (`issues.py`): core — most complex, most used
8. Step 7.2 (`comments.py`) + Step 7.3 (`transitions.py`)
9. Step 7.4 (`sprints.py`) + Step 7.6 (`linking.py`)
10. Step 7.8 (`fields.py`) + Step 7.9 (`attachments.py`)
11. Step 8: entry point
12. Step 9: register MCP
13. Steps 10–11: test

---

## Tracking Progress

After completing each group of tasks:

1. Open `status.md`
2. Change the group's badge in the Summary Table to `✅ Completed` and fill in the date
3. Mark each individual task row in the group's detail section as `✅`
4. Add a one-line entry to the **Completion Log** table at the bottom
5. Update the **Overall Progress** counter and bar at the top of `status.md`

If a task is blocked, mark it `❌ Blocked` and add a note in the group's **Completion Notes** field.

---

## Key Design Rules

- **No external dependencies** beyond the `mcp` package. No aiofiles, no pydantic.
- **All file I/O is synchronous** (`json.load` / `json.dump`). MCP tool handlers are async but delegate to sync helpers.
- **Return plain dicts/lists** from every tool. The MCP SDK serializes them to JSON automatically.
- **Match parameter names exactly** to sooperset/mcp-atlassian — this is a drop-in simulator.
- **Validation**: raise `ValueError` with a descriptive message if a required resource is not found (e.g., issue key not in store). The MCP SDK will surface this as a tool error.
- **Idempotent seeds**: JSON seed files are the source of truth. Never auto-generate seed data at runtime.

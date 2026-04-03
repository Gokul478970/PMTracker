# PMTracker — Implementation Task Plan

> Reference: `claude.md` for schemas, tool behavior, and design rules.
> Total tools: **34** across 9 modules | Storage: JSON | Transport: stdio
>
> **After completing each group:** update `status.md` — mark tasks ✅, update the group status in the Summary Table, fill in the Completed On date, add a line to the Completion Log, and update the Overall Progress bar.

---

## Package Installation Policy

> **Read before installing anything.**

- ✅ **Pre-approved:** Any package listed in `packages.md` may be installed immediately without asking — this includes `mcp`, `pytest`, and `pytest-asyncio`.
- ❌ **Ask first:** Any package **not listed** in `packages.md` requires explicit permission from the user before installing. Do not install unlisted packages, even if they appear helpful.
- ℹ️ Transitive dependencies pulled in automatically by approved packages (e.g. `anyio`, `pydantic`, `httpx`) are also pre-approved since they install silently as part of an approved package.

---

## Group 1 — Project Scaffolding

> Goal: Lay out the directory tree and Python package files before writing any logic.

**1.1** Create the root directory structure:
- `pmtracker/` (Python package)
- `pmtracker/tools/` (tool modules)
- `pmtracker/store/` (data access layer)
- `pmtracker/store/data/` (JSON seed files)
- `tests/` (unit tests)

**1.2** Create all empty Python package init files:
- `pmtracker/__init__.py`
- `pmtracker/tools/__init__.py`
- `pmtracker/store/__init__.py`

**1.3** Create `requirements.txt` with single dependency: `mcp>=1.0.0`

**1.4** Create `pyproject.toml` with project metadata, Python version constraint (`>=3.11`), dependency list, and `pmtracker` console script entry point pointing to `server:main`

**1.5** Create root `server.py` as the entry point — it imports and calls `pmtracker.server.run()` via `asyncio.run()`

**1.6** Install the package in editable mode: `pip install -e .`

**1.7** Verify the package installs without errors and the `pmtracker` command is available on the PATH

---

## Group 2 — Shared Foundation

> Goal: Establish shared constants and the data access layer that all tools will depend on.

**2.1** Create `pmtracker/constants.py` and define:
- `ISSUE_KEY_PATTERN` regex: `^[A-Z][A-Z0-9_]+-\d+$`
- `PROJECT_KEY_PATTERN` regex: `^[A-Z][A-Z0-9_]+$`
- `DEFAULT_READ_JIRA_FIELDS` comma-separated string of standard field names
- `DEFAULT_COMMENT_LIMIT = 10`
- `DEFAULT_PAGE_LIMIT = 10`
- `MAX_PAGE_LIMIT = 50`

**2.2** Create `pmtracker/store/json_store.py` — implement generic I/O helpers:
- `load(filename: str) -> dict | list` — reads `store/data/{filename}.json` using `json.load`
- `save(filename: str, data: dict | list) -> None` — writes back with `json.dump` (indent=2)

**2.3** In `json_store.py` — implement typed read helpers (each calls `load()`):
- `get_issues() -> list[dict]`
- `get_issue(issue_key: str) -> dict | None` — finds by `issue["key"]`
- `get_projects() -> list[dict]`
- `get_project(project_key: str) -> dict | None` — finds by `project["key"]`
- `get_users() -> list[dict]`
- `get_user(identifier: str) -> dict | None` — match by `accountId`, `emailAddress`, or `displayName`
- `get_boards() -> list[dict]`
- `get_sprints() -> list[dict]`
- `get_sprint(sprint_id: str) -> dict | None`
- `get_worklogs() -> dict` — returns the full dict keyed by issue_key
- `get_fields() -> list[dict]`
- `get_link_types() -> list[dict]`

**2.4** In `json_store.py` — implement write/mutation helpers:
- `save_issues(issues: list[dict]) -> None`
- `save_projects(projects: list[dict]) -> None`
- `save_sprints(sprints: list[dict]) -> None`
- `save_worklogs(worklogs: dict) -> None`

**2.5** In `json_store.py` — implement `next_issue_key(project_key: str) -> str`:
- Read all issues from `issues.json`
- Filter to the given project key
- Find the highest existing sequence number
- Return `{project_key}-{max_number + 1}`

**2.6** Verify `json_store.py` in isolation by writing a quick throwaway script that calls each helper function — confirm no import errors and correct return types before moving on

---

## Group 3 — Seed Data

> Goal: Populate all 8 JSON files with realistic, internally consistent dummy data.
> All files live in `pmtracker/store/data/`.

**3.1** Create `projects.json` — 2 projects:
- `ECOM` (E-Commerce Platform) — components: Frontend, Backend, Payments — lead: Alice Johnson
- `MOB` (Mobile App) — components: iOS, Android, Shared — lead: Bob Smith
- Both have empty `versions` arrays initially

**3.2** Create `users.json` — 3 users:
- `user-001` Alice Johnson — alice@example.com — America/New_York
- `user-002` Bob Smith — bob@example.com — America/Chicago
- `user-003` Carol White — carol@example.com — Europe/London

**3.3** Create `boards.json` — 2 boards:
- Board `1`: ECOM Board, type `scrum`, linked to `ECOM`
- Board `2`: MOB Board, type `kanban`, linked to `MOB`

**3.4** Create `sprints.json` — 3 sprints (all on Board 1):
- Sprint `1`: state `closed` — goal: "Deliver login and registration"
- Sprint `2`: state `active` — goal: "Payment integration"
- Sprint `3`: state `future` — no dates, no goal

**3.5** Create `link_types.json` — 4 link types:
- Blocks (is blocked by / blocks)
- Cloners (is cloned by / clones)
- Duplicate (is duplicated by / duplicates)
- Relates (relates to / relates to)

**3.6** Create `fields.json` — 13 fields:
- 10 standard fields: summary, status, assignee, reporter, priority, issuetype, description, labels, components, fixVersions
- 3 custom fields: Story Points (`customfield_10001`), Epic Link (`customfield_10002`), Sprint (`customfield_10003`)

**3.7** Create `issues.json` — minimum 10 issues. Required mix:
- At least 2 Epics (one per project)
- At least 3 Stories
- At least 2 Tasks
- At least 2 Bugs
- At least 1 Sub-task (linked to a Story parent)
- Distribute across ECOM and MOB projects
- Some issues assigned to Sprint 1 (closed), some to Sprint 2 (active), some unassigned
- Some issues linked to epics via `epic` field
- At least 2 issues with non-empty `comment.comments` arrays
- All issues must have every required field from the schema in `claude.md` (section 5.3)

**3.8** Create `worklogs.json` — add worklog entries for at least 3 different issues:
- Include fields: `id`, `author`, `timeSpent`, `timeSpentSeconds`, `started`, `comment`
- Use realistic time values (e.g., "2h", "30m", "1h 30m")

**3.9** Cross-check data consistency:
- Every `sprint` id referenced in `issues.json` exists in `sprints.json`
- Every `assignee.accountId` in `issues.json` exists in `users.json`
- Every `boardId` in `sprints.json` exists in `boards.json`
- Every epic key referenced in `issues.json` is itself an issue of type `Epic`
- Sub-task `parent` field points to a valid issue key

---

## Group 4 — MCP Server Core

> Goal: Set up the MCP server wiring so tools can be registered and the server can be started.

**4.1** Create `pmtracker/server.py` — initialize the MCP `Server("pmtracker")` instance and define the `run()` async function using `stdio_server` context manager

**4.2** In `pmtracker/server.py` — call `register_all_tools(app)` from `pmtracker.tools` before starting the server loop

**4.3** Create `pmtracker/tools/__init__.py` — implement `register_all_tools(app: Server)` that imports each tool module and passes `app` to its registration function:
- `from pmtracker.tools import issues, comments, transitions, sprints, projects, linking, users, fields, attachments`
- Call each module's `register(app)` function

**4.4** Define the convention for all tool modules: each must expose a `register(app: Server)` function that decorates its tool functions with `@app.tool()` and returns nothing

**4.5** Verify the server starts without errors by running `python server.py` — it should block on stdin waiting for MCP messages (Ctrl+C to exit). No tool responses needed yet.

---

## Group 5 — Read-Only Tool Modules (Simple)

> Goal: Implement the simplest tools first to build confidence and verify the server+store integration end-to-end.

### 5A — Projects Tools (`pmtracker/tools/projects.py`) — 5 tools

**5.1** `get_all_projects(include_archived: bool = False) -> list`
- Load projects, filter out archived if flag is False, return full list

**5.2** `get_project_versions(project_key: str) -> list`
- Get project by key, return `project["versions"]`; raise ValueError if project not found

**5.3** `get_project_components(project_key: str) -> list`
- Get project by key, return components as `[{"name": c} for c in project["components"]]`

**5.4** `create_version(project_key: str, name: str, start_date: str = None, release_date: str = None, description: str = None) -> dict`
- Build version object with provided fields, append to `project["versions"]`, save projects

**5.5** `batch_create_versions(project_key: str, versions: str) -> list`
- Parse `versions` as JSON array, call `create_version` logic for each entry, return list of created version objects

### 5B — Users Tools (`pmtracker/tools/users.py`) — 4 tools

**5.6** `get_user_profile(user_identifier: str) -> dict`
- Search users by accountId, emailAddress, or displayName (case-insensitive); raise ValueError if not found

**5.7** `get_issue_watchers(issue_key: str) -> list`
- Get issue, return `issue["fields"]["watchers"]`

**5.8** `add_watcher(issue_key: str, user_identifier: str) -> dict`
- Find user, find issue, append accountId to watchers if not already present, save issues

**5.9** `remove_watcher(issue_key: str, username: str = None, account_id: str = None) -> dict`
- Find issue, remove matching watcher from watchers list using either parameter, save issues

### 5C — Fields Tools (`pmtracker/tools/fields.py`) — 2 tools

**5.10** `search_fields(keyword: str = "", limit: int = 10, refresh: bool = False) -> list`
- Load fields, case-insensitive substring match on `field["name"]`, return up to `limit` results

**5.11** `get_field_options(field_id: str, context_id: str = None, project_key: str = None, issue_type: str = None, contains: str = None, return_limit: int = None, values_only: bool = False) -> list`
- For `customfield_10001` (Story Points): return `[1, 2, 3, 5, 8, 13, 21]`
- For `customfield_10002` (Epic Link): return list of Epic issue keys from `issues.json`
- For other fields: return empty list

### 5D — Attachments Tools (`pmtracker/tools/attachments.py`) — 2 tools

**5.12** `download_attachments(issue_key: str) -> dict`
- Validate issue exists, return `{"message": "Simulation: no real files. Attachments: []", "issue_key": issue_key}`

**5.13** `get_issue_images(issue_key: str) -> dict`
- Validate issue exists, return same simulated empty response

---

## Group 6 — Core Issue Tools

> Goal: Implement the most-used and most complex tools — the heart of the simulator.

### 6A — Issue CRUD (`pmtracker/tools/issues.py`) — 9 tools

**6.1** `get_issue(issue_key: str, fields: str = DEFAULT_READ_JIRA_FIELDS, expand: str = None, comment_limit: int = 10, properties: str = None, update_history: bool = True) -> dict`
- Find issue by key; raise ValueError if not found
- If `fields != "*all"`, trim the returned `fields` dict to only include requested field names
- Trim `comment.comments` to last `comment_limit` entries

**6.2** `get_project_issues(project_key: str, limit: int = 10, start_at: int = 0) -> dict`
- Filter issues by `issue["fields"]["project"]["key"]`
- Apply pagination: `issues[start_at : start_at + limit]`
- Return `{"issues": [...], "total": total_count, "startAt": start_at, "maxResults": limit}`

**6.3** `search(jql: str, fields: str = DEFAULT_READ_JIRA_FIELDS, limit: int = 10, start_at: int = 0, projects_filter: str = None, expand: str = None, page_token: str = None) -> dict`
- Implement JQL parser as described in `claude.md` section 7.1
- Support clauses: `project =`, `status =`, `assignee =`, `issuetype =`, `labels in (...)`
- Support `AND` combining of clauses
- Support `ORDER BY created DESC` sorting
- Apply `projects_filter` as additional project key filter if provided
- Return paginated results in same shape as `get_project_issues`

**6.4** `create_issue(project_key: str, summary: str, issue_type: str, assignee: str = None, description: str = None, components: str = None, additional_fields: str = None) -> dict`
- Validate project exists
- Generate new issue key using `next_issue_key(project_key)`
- Build full issue object with all required fields (use current UTC timestamp for created/updated)
- Parse `components` as comma-separated string into `[{"name": ...}]` array
- Parse `additional_fields` as JSON if provided and merge into `fields`
- Append to issues list and save
- Return the created issue object

**6.5** `batch_create_issues(issues: str, validate_only: bool = False) -> list`
- Parse `issues` as JSON array of issue dicts
- For each entry, call create logic; if `validate_only=True`, skip saving and just return what would be created
- Return list of `{"key": ..., "id": ...}` for each created issue

**6.6** `update_issue(issue_key: str, fields: str, additional_fields: str = None, components: str = None, attachments: str = None) -> dict`
- Find issue; raise ValueError if not found
- Parse `fields` JSON and merge into `issue["fields"]`
- Parse `additional_fields` JSON if provided and merge
- Parse `components` as comma-separated string if provided
- If `fields` contains a `status` change, record a `transitions_history` entry with old/new status and timestamp
- Update `updated` timestamp, save, return updated issue

**6.7** `delete_issue(issue_key: str) -> dict`
- Find issue; raise ValueError if not found
- Remove from issues list, save
- Return `{"message": f"Issue {issue_key} deleted successfully"}`

**6.8** `get_issue_dates(issue_key: str, include_status_changes: bool = True, include_status_summary: bool = True) -> dict`
- Find issue
- Return `created`, `updated`, and optionally `transitions_history` and a summary of time spent per status

**6.9** `batch_get_changelogs(issue_ids_or_keys: str, fields: str = None, limit: int = -1) -> dict`
- Parse comma-separated keys
- For each key, retrieve the issue's `transitions_history`
- Return `{issue_key: [changelog entries]}` dict

### 6B — Comments & Worklogs (`pmtracker/tools/comments.py`) — 4 tools

**6.10** `add_comment(issue_key: str, body: str, visibility: str = None, public: bool = None) -> dict`
- Find issue; raise ValueError if not found
- Generate comment id as `f"cmt-{str(uuid4())[:8]}"`
- Build comment object: `{id, body, author (system user), created (now), visibility}`
- Append to `issue["fields"]["comment"]["comments"]`, increment `total`, save
- Return the new comment object

**6.11** `edit_comment(issue_key: str, comment_id: str, body: str, visibility: str = None) -> dict`
- Find issue and locate comment by `comment_id`; raise ValueError if either not found
- Replace `body`, update `updated` timestamp on the comment, save
- Return the updated comment object

**6.12** `add_worklog(issue_key: str, time_spent: str, comment: str = None, started: str = None, original_estimate: str = None, remaining_estimate: str = None) -> dict`
- Find issue; raise ValueError if not found
- Parse `time_spent` string to seconds (support `Xh`, `Xm`, `Xh Xm` formats)
- Build worklog object with generated id, author, timeSpent, timeSpentSeconds, started (default now), comment
- Append to `worklogs[issue_key]`, save worklogs
- Return the new worklog object

**6.13** `get_worklog(issue_key: str) -> list`
- Find issue; raise ValueError if not found
- Return `worklogs.get(issue_key, [])`

### 6C — Transitions (`pmtracker/tools/transitions.py`) — 2 tools

**6.14** Define `TRANSITIONS` dict mapping each status name to its allowed next transitions (as list of `{id, name}` dicts). Map:
- `To Do` → `In Progress`, `Done`
- `In Progress` → `To Do`, `In Review`, `Done`
- `In Review` → `In Progress`, `Done`
- `Done` → `In Progress`

Also define the full status objects for each transition target (including `id`, `name`, `statusCategory`).

**6.15** `get_transitions(issue_key: str) -> list`
- Find issue, read current status name
- Return `TRANSITIONS.get(current_status, [])` — empty list if status not in map

**6.16** `transition_issue(issue_key: str, transition_id: str, fields: str = None, comment: str = None) -> dict`
- Find issue and current status
- Get available transitions from `TRANSITIONS`
- Find the target transition by `transition_id`; raise ValueError if not valid
- Record `transitions_history` entry: `{from_status, to_status, timestamp, comment}`
- Update `issue["fields"]["status"]` to the target status object
- If `comment` provided, also call the `add_comment` logic
- Update `updated` timestamp, save, return updated issue

---

## Group 7 — Agile & Linking Tools

### 7A — Sprint & Board Tools (`pmtracker/tools/sprints.py`) — 7 tools

**7.1** `get_agile_boards(board_name: str = None, project_key: str = None, board_type: str = None, start_at: int = 0, limit: int = 10) -> dict`
- Load boards
- Filter by `board_name` (case-insensitive contains), `project_key` (exact), `board_type` (exact) — only apply filters that are not None
- Paginate and return `{boards: [...], total, startAt, maxResults}`

**7.2** `get_sprints_from_board(board_id: str, state: str = None, start_at: int = 0, limit: int = 10) -> dict`
- Filter sprints where `sprint["boardId"] == board_id`
- If `state` provided, also filter by `sprint["state"] == state`
- Paginate and return sprint list

**7.3** `get_sprint_issues(sprint_id: str, fields: str = DEFAULT_READ_JIRA_FIELDS, start_at: int = 0, limit: int = 10) -> dict`
- Filter issues where `issue["fields"]["sprint"] == sprint_id`
- Paginate and return issue list

**7.4** `get_board_issues(board_id: str, jql: str, fields: str = DEFAULT_READ_JIRA_FIELDS, start_at: int = 0, limit: int = 10, expand: str = "version") -> dict`
- Get all sprint IDs for the board from `sprints.json`
- Filter issues whose `sprint` field is in those sprint IDs
- Further filter using the JQL parser (reuse logic from `search` tool)
- Paginate and return

**7.5** `create_sprint(board_id: str, name: str, start_date: str, end_date: str, goal: str = None) -> dict`
- Validate board exists; raise ValueError if not
- Generate new sprint id (max existing id + 1 as string)
- Build sprint object, append to sprints list, save
- Return the created sprint

**7.6** `update_sprint(sprint_id: str, name: str = None, state: str = None, start_date: str = None, end_date: str = None, goal: str = None) -> dict`
- Find sprint; raise ValueError if not found
- If `state` being set to `active`, verify no other sprint on same board already has state `active`; raise ValueError if conflict
- Merge all non-None parameters into sprint object, save
- Return updated sprint

**7.7** `add_issues_to_sprint(sprint_id: str, issue_keys: str) -> dict`
- Validate sprint exists; raise ValueError if not
- Parse comma-separated `issue_keys`
- For each key, find issue and set `issue["fields"]["sprint"] = sprint_id`
- Save issues, return `{"sprint_id": sprint_id, "added_issues": [keys list]}`

### 7B — Issue Linking (`pmtracker/tools/linking.py`) — 5 tools

**7.8** `get_link_types(name_filter: str = None) -> list`
- Load link types
- If `name_filter` provided, case-insensitive substring match on `linkType["name"]`
- Return filtered list

**7.9** `link_to_epic(issue_key: str, epic_key: str) -> dict`
- Validate both issue and epic exist; validate that `epic_key` is actually an Epic type
- Set `issue["fields"]["epic"] = epic_key`, update `updated`, save
- Return updated issue

**7.10** `create_issue_link(link_type: str, inward_issue_key: str, outward_issue_key: str, comment: str = None, comment_visibility: str = None) -> dict`
- Find both issues; raise ValueError if either not found
- Find link type by name from `link_types.json`
- Generate link id as `f"link-{str(uuid4())[:8]}"`
- Append link object to `inward_issue["fields"]["issueLinks"]` and `outward_issue["fields"]["issueLinks"]`
- Save issues, return `{"id": link_id, "type": link_type_obj, "inwardIssue": ..., "outwardIssue": ...}`

**7.11** `create_remote_issue_link(issue_key: str, url: str, title: str, summary: str = None, relationship: str = None, icon_url: str = None) -> dict`
- Find issue; raise ValueError if not found
- Build remote link object with generated id
- Append to `issue["fields"]["remote_links"]`, save
- Return the remote link object

**7.12** `remove_issue_link(link_id: str) -> dict`
- Search all issues for a link with the given `link_id` in their `issueLinks`
- Remove that link entry from any issues that contain it, save
- Return `{"message": f"Link {link_id} removed successfully"}`

---

## Group 8 — Integration & Registration

> Goal: Wire everything up and make the server reachable from Claude Code.

**8.1** Complete `pmtracker/tools/__init__.py` — ensure `register_all_tools()` calls each module's `register(app)` function in this order: projects, users, fields, attachments, issues, comments, transitions, sprints, linking

**8.2** Run `python server.py` and confirm the server starts cleanly with no import errors across all 9 tool modules

**8.3** Create `.mcp.json` in the workspace root (`c:/Siva/projects/JiraMCP/.mcp.json`) with the `pmtracker` server config pointing to `python server.py`

**8.4** Restart Claude Code (or reload MCP servers) and verify `pmtracker` appears in the available MCP server list

**8.5** Confirm all 34 tools are listed when Claude Code queries the `pmtracker` MCP server's tool list

---

## Group 9 — Smoke Testing (Manual)

> Goal: Manually invoke each tool group via Claude Code to confirm end-to-end correctness.

**9.1** Projects group:
- Call `get_all_projects` → expect 2 projects (ECOM, MOB)
- Call `get_project_versions("ECOM")` → expect empty array
- Call `create_version("ECOM", "v1.0", "2025-03-01", "2025-03-31")` → expect version created
- Call `get_project_versions("ECOM")` again → expect 1 version returned

**9.2** Users group:
- Call `get_user_profile("alice@example.com")` → expect Alice's full profile
- Call `get_issue_watchers("ECOM-1")` → expect empty list
- Call `add_watcher("ECOM-1", "alice@example.com")` → success
- Call `get_issue_watchers("ECOM-1")` → expect Alice's accountId in list

**9.3** Issue reads:
- Call `get_issue("ECOM-1")` → expect full issue object
- Call `get_project_issues("ECOM")` → expect ECOM issues with pagination metadata
- Call `search('project = ECOM AND status = "In Progress"')` → expect filtered results
- Call `search('issuetype = Bug')` → expect only bugs

**9.4** Issue writes:
- Call `create_issue("ECOM", "New test story", "Story")` → expect new key like `ECOM-11`
- Call `get_issue("ECOM-11")` → confirm it exists
- Call `update_issue("ECOM-11", '{"priority": {"name": "Low"}}')` → confirm updated
- Call `delete_issue("ECOM-11")` → confirm deleted
- Call `get_issue("ECOM-11")` → expect ValueError/not found

**9.5** Comments & worklogs:
- Call `add_comment("ECOM-1", "This is a test comment")` → expect comment returned
- Call `get_issue("ECOM-1")` → confirm comment appears in `fields.comment.comments`
- Call `add_worklog("ECOM-1", "1h 30m", "Debugging session")` → expect worklog returned
- Call `get_worklog("ECOM-1")` → expect at least 2 worklogs

**9.6** Transitions:
- Call `get_transitions("ECOM-1")` → expect non-empty transitions list
- Note the current status and pick a valid `transition_id`
- Call `transition_issue("ECOM-1", "{transition_id}")` → confirm status changed
- Call `get_issue_dates("ECOM-1")` → confirm `transitions_history` has an entry

**9.7** Sprints & boards:
- Call `get_agile_boards()` → expect 2 boards
- Call `get_agile_boards("ECOM Board")` → expect 1 board
- Call `get_sprints_from_board("1")` → expect 3 sprints
- Call `get_sprints_from_board("1", "active")` → expect Sprint 2 only
- Call `get_sprint_issues("2")` → expect issues assigned to Sprint 2
- Call `create_sprint("1", "Sprint 4", "2025-02-03T00:00:00.000Z", "2025-02-17T00:00:00.000Z", "Q1 wrap-up")` → expect new sprint created
- Call `add_issues_to_sprint("4", "ECOM-3,ECOM-4")` → expect success

**9.8** Linking:
- Call `get_link_types()` → expect 4 link types
- Call `link_to_epic("ECOM-2", "ECOM-1")` (assuming ECOM-1 is an Epic) → confirm epic field set
- Call `create_issue_link("Blocks", "ECOM-3", "ECOM-4")` → confirm link created
- Call `get_issue("ECOM-3")` → confirm `issueLinks` has an entry
- Call `remove_issue_link("{link_id}")` → confirm removed

**9.9** Fields & attachments:
- Call `search_fields("story")` → expect Story Points field returned
- Call `search_fields("")` → expect up to 10 fields returned
- Call `get_field_options("customfield_10001")` → expect `[1, 2, 3, 5, 8, 13, 21]`
- Call `get_field_options("customfield_10002")` → expect list of Epic keys
- Call `download_attachments("ECOM-1")` → expect simulated empty response

---

## Group 10 — Unit Tests

> Goal: Automate verification of the data layer and critical tool logic.

**10.1** Set up `tests/test_tools.py` with pytest imports and a fixture that copies seed data to a temp directory and patches `json_store` to use that temp path

**10.2** Write data layer tests (`json_store`):
- `test_load_and_save_roundtrip` — save a dict, reload it, assert equality
- `test_get_issue_found` — assert correct issue returned for valid key
- `test_get_issue_not_found` — assert None returned for unknown key
- `test_next_issue_key_increments` — assert key is `PROJECT-{max+1}`
- `test_next_issue_key_new_project` — assert key is `PROJECT-1` when no issues exist

**10.3** Write issue tool tests:
- `test_create_issue_returns_correct_key`
- `test_create_issue_persists_to_store`
- `test_get_issue_returns_full_object`
- `test_delete_issue_removes_from_store`
- `test_search_by_project` — JQL `project = ECOM`
- `test_search_by_status` — JQL `status = "In Progress"`
- `test_search_by_issue_type` — JQL `issuetype = Bug`
- `test_search_combined_jql` — JQL `project = ECOM AND status = "Done"`

**10.4** Write transition tool tests:
- `test_get_transitions_todo_status` — assert correct transitions returned
- `test_transition_issue_updates_status` — assert status changed in store
- `test_transition_issue_records_history` — assert `transitions_history` has entry
- `test_transition_issue_invalid_id_raises` — assert ValueError raised

**10.5** Write sprint tool tests:
- `test_create_sprint_appends_to_store`
- `test_update_sprint_active_conflict_raises` — two active sprints on same board
- `test_add_issues_to_sprint_sets_sprint_field`
- `test_get_sprint_issues_filters_correctly`

**10.6** Run all tests: `python -m pytest tests/ -v` — confirm all pass with no errors

---

## Summary Checklist

| Group | Description | Tasks | Tools |
|-------|-------------|-------|-------|
| 1 | Project Scaffolding | 1.1 – 1.7 | — |
| 2 | Shared Foundation | 2.1 – 2.6 | — |
| 3 | Seed Data | 3.1 – 3.9 | — |
| 4 | MCP Server Core | 4.1 – 4.5 | — |
| 5A | Projects Tools | 5.1 – 5.5 | 5 tools |
| 5B | Users Tools | 5.6 – 5.9 | 4 tools |
| 5C | Fields Tools | 5.10 – 5.11 | 2 tools |
| 5D | Attachments Tools | 5.12 – 5.13 | 2 tools |
| 6A | Issue CRUD | 6.1 – 6.9 | 9 tools |
| 6B | Comments & Worklogs | 6.10 – 6.13 | 4 tools |
| 6C | Transitions | 6.14 – 6.16 | 2 tools |
| 7A | Sprints & Boards | 7.1 – 7.7 | 7 tools |
| 7B | Issue Linking | 7.8 – 7.12 | 5 tools |
| 8 | Integration & Registration | 8.1 – 8.5 | — |
| 9 | Smoke Testing | 9.1 – 9.9 | — |
| 10 | Unit Tests | 10.1 – 10.6 | — |

**Total: 34 tools across 9 modules | ~65 implementation tasks | ~25 test cases**

# Backlog & Sprint Management — Implementation Plan

## Features Requested
1. Product Backlog View
2. Sprint View (create sprints, add stories)
3. "Release" field for issues
4. Parent field for issues
5. Dependency links between issues
6. Block/unblock stories

---

## Step 1 — Backend: Add Release Field to Issues

### 1.1 Update issue create/update endpoints
- Add `fix_versions` (release) to `IssueCreate` and `IssueUpdate` models in `api/routes/issues.py`
- On create: store `fields.fixVersions` as array of `{"name": "..."}` objects
- On update: merge fixVersions into fields

### 1.2 Ensure project versions endpoint works
- `GET /api/projects/{key}/versions` already exists
- `POST /api/projects/{key}/versions` already exists
- Frontend will use these to populate release dropdowns

---

## Step 2 — Backend: Add Parent Field Support

### 2.1 Update issue create endpoint
- `parent_key` parameter already exists in create API
- Ensure `fields.parent = {"key": parent_key}` is stored
- Validate parent issue exists in same project

### 2.2 Update issue update endpoint
- Add `parent_key` to update body
- Allow setting/clearing parent

### 2.3 Update issue detail response
- Ensure `fields.parent` is included in get_issue response
- Ensure `fields.subtasks` lists child issues

---

## Step 3 — Backend: Add Dependency & Blocking Support

### 3.1 Issue linking endpoints already exist
- `POST /api/issues/{key}/links` — create link (need to verify/add in REST API)
- Link types from `link_types.json`: Blocks, Cloners, Duplicate, Relates

### 3.2 Add REST endpoints for issue links
- `POST /api/issues/{key}/links` — body: `{ "type": "Blocks", "target_key": "PROJ-5" }`
- `DELETE /api/issues/{key}/links/{link_id}`
- Return links in issue detail response (already in `fields.issueLinks`)

---

## Step 4 — Frontend: Product Backlog View

### 4.1 New page: `ui/src/pages/Backlog.tsx`
Route: `/projects/:projectKey/backlog`

**Layout:**
- Top: Project breadcrumb + "Create Issue" button + "Create Sprint" button
- Main area split into two sections:
  - **Sprint sections** (expandable): Each active/future sprint as a collapsible panel
    - Header: Sprint name, goal, date range, issue count, story points total
    - Body: List of issues assigned to that sprint (draggable)
  - **Backlog section**: All issues NOT assigned to any sprint
    - Sortable list with checkboxes for multi-select
    - "Move to Sprint" dropdown action

### 4.2 Features:
- Filter by issue type
- Select multiple issues → "Add to Sprint" action
- Create new sprint inline
- Show story points per sprint
- Show release/version per issue

---

## Step 5 — Frontend: Sprint Board View

### 5.1 New page: `ui/src/pages/SprintBoard.tsx`
Route: `/projects/:projectKey/sprints/:sprintId`

**Layout:**
- Header: Sprint name, goal, start/end dates, status badge
- Kanban board: 4 columns (To Do, In Progress, In Review, Done)
  - Only shows issues in THIS sprint
- Sprint actions: Start Sprint, Complete Sprint

### 5.2 Sprint Management:
- Create Sprint dialog (name, goal, start date, end date)
- Start Sprint (transition from future → active)
- Complete Sprint (transition from active → closed)

---

## Step 6 — Frontend: Update Issue Creation Dialog

### 6.1 Add new fields to CreateIssueDialog:
- **Release** dropdown (populated from project versions)
- **Parent** dropdown (populated from project issues, filtered by Epic/Story)
- "Create Version" inline button if no versions exist

### 6.2 Add field display to IssueDetail sidebar:
- Release/Fix Version display
- Parent link (clickable to parent issue)
- Sub-tasks list
- Issue Links section (dependencies, blockers)
- "Link Issue" button with type selector

---

## Step 7 — Frontend: Issue Links in Detail View

### 7.1 New section in IssueDetail sidebar: "Links"
- Shows existing links grouped by type:
  - "blocks PROJ-3"
  - "is blocked by PROJ-1"
  - "relates to PROJ-5"
- "Add Link" button opens dialog:
  - Link type dropdown (Blocks, Relates, Duplicate)
  - Target issue key input (with autocomplete)
- Delete link (X button per link)

### 7.2 Blocked indicator:
- If issue "is blocked by" any open issue → show red "BLOCKED" badge on card and detail
- Show blocked status in backlog and sprint board views

---

## Step 8 — Frontend: Navigation Updates

### 8.1 Update Layout sidebar:
- Add "Backlog" link under each project (between project name and chat)
- Add "Sprints" section showing active sprint

### 8.2 Update ProjectBoard:
- Add "Backlog" tab alongside Board/List views
- Add sprint selector dropdown to filter board by sprint

---

## Implementation Order
1. Step 1-3: Backend changes (release field, parent, linking)
2. Step 6: Update CreateIssueDialog with new fields
3. Step 7: Issue links in detail view
4. Step 4: Backlog page
5. Step 5: Sprint board
6. Step 8: Navigation
7. Build & push

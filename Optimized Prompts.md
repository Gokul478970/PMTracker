# Velocity — Single Prompt to Build the Entire Project

Use this prompt with Claude Code (or any AI coding agent) to build the complete Velocity project management tool from scratch.

---

## The Prompt

> Build a full-stack project management tool called **Velocity** with the tagline **"Get it done with AI"**. The app has two interfaces: a **web UI** (FastAPI + React) and an **MCP server** (Python stdio) that lets AI agents interact with the same data. All data is stored in JSON files — no database.
>
> ### Tech Stack
> - **Backend**: Python 3.11+, FastAPI, Pydantic, JWT auth
> - **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, TanStack React Query, Lucide React icons
> - **MCP Server**: Python `mcp` SDK, stdio transport
> - **Storage**: JSON files in `pmtracker/store/data/`
> - **Deployment**: Azure App Service with gunicorn + uvicorn
>
> ### Authentication
> - Email/password auth with OTP-based registration (admin email: `604671@cognizant.com`)
> - JWT tokens stored in localStorage
> - Login page with Register and Login tabs, browser password autofill support (Credential Management API)
> - Global roles per user: Dev, QA, PM, PO (stored in `auth_users.json`)
>
> ### RBAC (Role-Based Access Control)
> - **Global roles**: Dev, QA, PM, PO (one per user)
> - **Per-project roles**: Project Admin, Product Owner, Project User (via assignments table)
> - Admin sees all projects; normal users see only assigned projects
> - Project Admin can: manage sprints, import CSV, access settings, manage assignments
> - Product Owner can: view Scope page
> - Project User can: view board, backlog, chat, create issues
> - Team page: admin sees all users; normal users see only their project teammates
>
> ### Issue Types & Hierarchy
> - Types: **Epic > Feature > Story/Bug > Task** (Feature is optional — Epic > Story > Task is also valid)
> - Type icons: Epic=⚡, Feature=🚀, Story=📖, Task=✅, Bug=🐛
> - **Story Points** (`customfield_10001`) for Epic/Feature/Story/Bug
> - **Estimate Hours** (`estimate_hours`) for Task
> - Parent-child relationships: Feature's parent can be Epic; Story/Bug parent can be Epic or Feature; Task parent can be Story or Bug
> - Child tasks shown in parent's detail page with inline "Add Task" form, progress bar, status badges, hours, strikethrough for Done
>
> ### Pages & Features
>
> **Sidebar Layout** (all pages):
> - App name "Velocity" with FolderKanban icon
> - Global search with filters (project, status, type, assignee) and results dropdown
> - Nav: Dashboard, Team, New Project (admin only)
> - Per-project sub-nav: Board, Backlog, Sprint Board, Scope (PO+ only), Chat (with red unread badge), Settings (admin/PA only)
> - Footer: user email, role badge, help icon (mailto:604671@cognizant.com), dark/light theme toggle, logout
>
> **Dashboard**: Overview of all accessible projects with issue counts and status breakdown
>
> **Backlog Page**:
> - Sprints (active/future) as collapsible sections with issue rows
> - Backlog section for unassigned issues
> - Drag-and-drop issues between sprints and backlog
> - Bulk select + move to sprint
> - Sprint management: create, start, complete, edit (name, goal, dates)
> - Epic filter in sidebar with nested epic tree
> - Progress panel with segmented bars (Done/In Progress/To Do) for active sprint, backlog, epics, releases
> - Closed sprints shown in separate collapsed section
> - Issue rows: type icon, key (link), summary (strikethrough if Done), status badge, priority, story points badge, hours badge, assignee avatar
> - **Import CSV** button (admin/PA only): opens dialog with clear format guide (Summary required, Type optional, Description optional; other columns ignored), drag-drop file upload, client-side preview table showing valid/error rows, server-side creation with detailed results, downloadable sample CSV template, "Contact 604671@cognizant.com" help text
> - Create Issue button
>
> **Sprint Board** (Kanban):
> - Columns: To Do, In Progress, In Review, Done
> - Drag-and-drop cards between columns (updates status)
> - Issue cards show: type icon, key, summary, priority, assignee avatar, story points, hours
> - Filter toggles: "Tasks" (show/hide child tasks, hidden by default), "My Tasks" (show only current user's issues)
> - Sprint selector dropdown
>
> **Issue Detail Page**:
> - Full issue view with inline-editable fields: summary, description, status, priority, assignee, type, sprint, parent, labels, story points (or estimate hours for Task)
> - Status transitions via dropdown
> - Comments section with add/edit
> - Issue links section (add/remove links: Blocks, Relates, Duplicate)
> - Child tasks section (for Epic/Feature/Story/Bug): shows child issues with status, type icon, key, summary, hours, assignee; inline "Add Task" form with summary, assignee, hours; progress bar with aggregate hours
> - Sidebar with all metadata fields
>
> **Project Chat** (full page + slide-out panel on board):
> - Shows all project members (admin + assigned users)
> - Send messages, @mention users with autocomplete (type @ to trigger dropdown, arrow keys to navigate, Enter/Tab to select)
> - @mentions insert **first name only** (e.g., @Alice not @Alice Johnson)
> - @mentions highlighted with blue styling in messages
> - 10-line message limit (enforced client-side and server-side, show error message)
> - Read markers: track last-read timestamp per user per project
> - Unread badge: red dot with count on Chat sidebar links, polls every 10 seconds
> - Chat stored as separate JSON per project (`chat_{PROJECT_KEY}.json`)
> - Auto-scroll to latest message
> - Members bar (toggleable) showing all project members with click-to-mention
>
> **Team Page**:
> - User cards: avatar (gradient initials), display name, role badge (role-specific icon + color), email
> - Admin section: Agent keys management (create/delete API keys for MCP agents)
> - Admin can click user card to open **User Edit Dialog**: change global role, manage project assignments (add/remove projects with per-project role dropdown)
> - Agents section hidden from non-admin users
>
> **Project Settings** (admin/PA only):
> - Edit project name, description
> - Manage team assignments: add/remove users, set per-project roles
> - Delete project
>
> **Scope Page** (admin/PA/PO only):
> - Create and edit scope documents per project
>
> **Create Issue Dialog**:
> - Fields: Summary (required), Type (Epic/Feature/Story/Task/Bug), Priority, Description, Assignee, Sprint, Release, Parent (smart picker based on hierarchy), Labels, Components
> - Conditional estimate field: Story Points for Epic/Feature/Story/Bug, Estimate Hours for Task
>
> ### UX Polish
> - **ESC key** closes all dialogs and panels (CreateIssue, ImportCSV, AgentToken, UserEdit, ChatPanel)
> - Click outside overlay closes dialog
> - Dark mode with persistent theme toggle
> - Done issues: strikethrough summary, reduced opacity
> - Responsive status colors: To Do (slate), In Progress (blue), In Review (amber), Done (emerald)
> - Priority colors: Highest (red), High (orange), Medium (yellow), Low (blue), Lowest (slate)
>
> ### MCP Server (34 tools)
> - Simulates sooperset/mcp-atlassian Jira MCP with identical tool names and schemas
> - Transport: stdio (compatible with Claude Desktop and Claude Code)
> - Tools call the FastAPI REST API via HTTP (api_client.py), not direct JSON file access
> - Agent authentication via API keys (managed in Team page)
> - Tool modules: issues (9), comments (4), transitions (2), sprints (7), projects (5), linking (5), users (4), fields (2), attachments (2 — simulated/empty)
> - JQL simulation: supports project, status, assignee, issuetype, labels filters with AND, ORDER BY created DESC
>
> ### Backend API Routes
> - `auth.py`: register (OTP), verify-otp, login, JWT middleware
> - `issues.py`: CRUD, children endpoint, issue links, CSV import (`POST /projects/{key}/import-issues` with multipart file upload)
> - `projects.py`: CRUD, versions
> - `sprints.py`: CRUD, add issues to sprint
> - `comments.py`: add, edit
> - `search.py`: JQL-based search
> - `users.py`: list, update (admin), delete
> - `assignments.py`: CRUD for project role assignments
> - `chat.py`: messages, read markers (`POST /projects/{key}/chat/read`), unread counts (`GET /chat/unread`)
> - `scopes.py`: CRUD for scope documents
>
> ### Status Transitions
> ```
> To Do → In Progress, Done
> In Progress → To Do, In Review, Done
> In Review → In Progress, Done
> Done → In Progress
> ```
>
> ### Data Storage (JSON files, no seed data needed — users create everything through UI)
> - `auth_users.json` — registered users with hashed passwords
> - `projects.json` — projects
> - `issues.json` — all issues
> - `boards.json` — boards (one per project, auto-created)
> - `sprints.json` — sprints
> - `users.json` — user profiles (synced from auth)
> - `chat_{KEY}.json` — chat messages per project
> - `chat_read_markers.json` — read timestamps (`email::project_key → timestamp`)
> - `assignments.json` — project role assignments
> - `scopes_{KEY}.json` — scope documents per project
> - `fields.json` — field definitions
> - `link_types.json` — issue link types (Blocks, Cloners, Duplicate, Relates)
> - `worklogs.json` — time tracking
>
> ### File Structure
> ```
> project/
> ├── server.py                          # MCP entry point
> ├── .mcp.json                          # MCP config for Claude Code
> ├── api/
> │   ├── main.py                        # FastAPI app with CORS, static files, JWT middleware
> │   └── routes/                        # All API route modules
> ├── pmtracker/
> │   ├── server.py                      # MCP server wiring (stdio)
> │   ├── api_client.py                  # HTTP client for MCP→API bridge
> │   ├── tools/                         # 34 MCP tool implementations
> │   └── store/
> │       ├── json_store.py              # Data access layer (sync file I/O)
> │       └── data/                      # JSON data files (empty initially)
> └── ui/
>     ├── index.html
>     ├── vite.config.ts
>     ├── tailwind.config.js
>     └── src/
>         ├── App.tsx                    # React Router setup
>         ├── main.tsx                   # Entry point
>         ├── lib/
>         │   ├── api.ts                 # All REST API functions
>         │   ├── auth.ts                # JWT/session/theme management
>         │   └── utils.ts              # Constants, helpers (status colors, type icons, initials, timeAgo)
>         ├── components/
>         │   ├── Layout.tsx             # Sidebar, search, nav, unread badges
>         │   ├── CreateIssueDialog.tsx  # Issue creation with hierarchy-aware parent picker
>         │   ├── ImportCsvDialog.tsx    # CSV import with preview, progress, results
>         │   ├── ChatPanel.tsx          # Slide-out chat panel with @mentions
>         │   ├── IssueCard.tsx          # Kanban card component
>         │   └── AgentTokenDialog.tsx   # MCP agent key management
>         └── pages/
>             ├── Dashboard.tsx
>             ├── Login.tsx
>             ├── Backlog.tsx
>             ├── SprintBoard.tsx
>             ├── IssueDetail.tsx
>             ├── ProjectChat.tsx
>             ├── People.tsx
>             ├── ProjectSettings.tsx
>             ├── ProjectBoard.tsx
>             ├── ScopePage.tsx
>             └── CreateProject.tsx
> ```
>
> Build the complete application with all features described above. No seed/dummy data needed — users will create projects, issues, and sprints through the UI. Start with the backend, then the frontend, then the MCP server.

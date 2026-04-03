# Velocity — Complete Build Prompts (Chronological)

This document contains every prompt used to build the Velocity project management tool from scratch using Claude Code. Follow these prompts in order to recreate the entire application.

---

## Phase 1: MCP Server Foundation

### Prompt 1 — Project Bootstrap
> Create a Jira MCP Server Simulator called PMTracker. It should simulate the sooperset/mcp-atlassian Jira MCP, exposing identical tool names and schemas. Data stored in local JSON files. Transport: stdio. Create the full directory structure with pmtracker/server.py, pmtracker/tools/ (issues, comments, transitions, sprints, projects, linking, users, fields, attachments), pmtracker/store/json_store.py, and pmtracker/store/data/ with seed JSON files.

### Prompt 2 — Implement MCP Tools
> Implement all 34 MCP tools across 9 modules: issues (9 tools), comments (4), transitions (2), sprints (7), projects (5), linking (5), users (4), fields (2), attachments (2). Match sooperset/mcp-atlassian parameter names exactly. JQL simulation should support project, status, assignee, issuetype, labels filters with AND. Seed with 2 projects (ECOM, MOB), 3 users, 10+ issues, 2 boards, 3 sprints (closed/active/future), 4 link types.

### Prompt 3 — Register MCP Server
> Register the MCP server in .mcp.json for Claude Code with command pointing to python server.py.

---

## Phase 2: Web UI (FastAPI + React)

### Prompt 4 — Web UI Foundation
> Build a full web UI for this project tracker. Use FastAPI as the backend API layer and React + TypeScript + Vite + Tailwind CSS for the frontend. Create REST API routes that wrap the same JSON store. Include: Project list page, Project board (Kanban), Issue detail page with comments, Sprint management, and a sidebar navigation.

### Prompt 5 — Azure Deployment
> Deploy this to Azure App Service. Add a startup command, gunicorn config, CORS support for the Azure URL, and serve the built React frontend as static files from FastAPI. Make sure the data directory persists across deployments.

### Prompt 6 — Auth System
> Add email/password authentication with OTP-based registration. Use JWT tokens. Store auth users in a separate auth_users.json. Add login and registration pages with a polished UI. The admin email is 604671@cognizant.com.

### Prompt 7 — Hide Seed Data
> Hide the seed users and projects from the UI. Only show real registered users and created projects.

---

## Phase 3: Core Features

### Prompt 8 — Context Graph & Scope Tab
> Add a Scope/MVP tab to each project where admins can create and edit scope documents. Fix sprint creation. Add a Context Graph feature.

### Prompt 9 — Team Page
> Rename "People" to "Team". Split into two sections: Human (registered users) and Agent (MCP agent keys). Show user cards with avatar, role, email.

### Prompt 10 — Admin Controls & Dark Theme
> Add user roles (Dev, QA, PM, PO), admin controls for user management, drag-and-drop issue reordering, inline field editing on issue detail, and a dark theme toggle that persists.

### Prompt 11 — Sprint Management in Backlog
> Add sprint management controls to the Backlog page: create sprint, start/complete sprint, edit sprint details (name, goal, dates), drag-and-drop issues between sprints and backlog, bulk select and move issues.

### Prompt 12 — Audit Fixes
> Fix: components dropdown in create dialog, comment editing, MCP update_issue params, transition_id support in transition_issue.

### Prompt 13 — MCP HTTP Rewiring
> Rewire MCP tools to call FastAPI backend via HTTP instead of direct JSON file access. Add an api_client.py that calls the REST API.

### Prompt 14 — MCP HTTP Transport
> Add MCP HTTP transport with agent key management. Create an agent keys management UI on the Team page (admin only). Generate API keys for MCP agents.

### Prompt 15 — Login Autofill
> Fix login form to trigger browser password save prompt. Use Credential Management API for login autofill support.

### Prompt 16 — Backlog/Sprint UI Polish
> Backlog/Sprint UI enhancements: show closed sprints in a separate section, Done issues get strikethrough and opacity, add epic filter in sidebar with nested epic tree, add progress panels showing sprint/backlog/epic/version completion bars.

### Prompt 17 — Cache & Progress Redesign
> Remove Epic field from issue detail, fix stale cache on re-edit (invalidate queries properly), redesign progress panels with segmented bars, add admin-only project creation.

### Prompt 18 — Team Page Visibility
> Hide Agents section on Team page from non-admin users.

---

## Phase 4: RBAC & Access Control

### Prompt 19 — Role-Based Access Control
> Add role-based project access control (RBAC). Users should only see projects they are assigned to. Admins see all. Create a project assignments system with roles: Project Admin, Product Owner, Project User. Add assignment management in Project Settings.

### Prompt 20 — Team Page Filtering
> Filter Team page by role: normal users see only their project teammates. Admins see everyone.

### Prompt 21 — Product Owner Role
> Add Product Owner role. Restrict Create Sprint to admins and project admins. Restrict Scope visibility to admins, project admins, and product owners.

### Prompt 22 — Sprint Action Restrictions
> Restrict sprint start/complete actions to admins and project admins. Fix settings access. Fix user dropdown to show only project members for assignee.

---

## Phase 5: Rename & Feature Expansion

### Prompt 23 — Rename to Velocity AI
> Rename the app from PMTracker to Velocity AI. Update all UI references: sidebar header, login page, browser title.

### Prompt 24 — Child Tasks & Estimate Hours
> Add child tasks feature. Stories and Bugs can have child Tasks with hour estimates. Stories/Bugs use story points, Tasks use estimate hours (new field). Sprint board should hide child tasks by default with "Tasks" and "My Tasks" filter toggles. Issue detail should show child tasks with status, hours, strikethrough for Done, and an inline "Add Task" form. Update CreateIssueDialog to show hours for Task type and points for Story/Bug. Show hours badge in IssueCard and Backlog.

### Prompt 25 — User Edit Dialog
> For admin, in teams page, upon clicking a user, it must be possible to edit user details like role and assigned project. It must be possible to assign multiple projects (but role will be only one per person).

### Prompt 26 — Help Icon & Feature Type
> 1. Introduce a help icon in all pages and ask them to contact 604671@cognizant.com for help.
> 2. Introduce another issue type 'Feature'. Hierarchy is Epic - Feature - Story (or defect) - Task. But it shall also be possible Epic - Story - Task also.

---

## Phase 6: Chat System

### Prompt 27 — Project Chat
> All users in the project must be visible in Chat Menu. Should be able to send messages and tag them using @. A notification must be visible in chat menu (red dot) to indicate that there is unread msg. Kind of mini slack within chat menu. Store chat as separate JSON for each project. Always show latest msg. Don't allow more than 10 lines in chat (say that is not allowed).

---

## Phase 7: CSV Import & Polish

### Prompt 28 — CSV Import
> For admin and project admin, provide an option in the backlog for adding an attachment with list of stories and create stories based on it. Remove assignee. Have Summary, Type, Description. If excel contains any other fields ignore. UI must be clear enough to say the format of the file, they should reach admin. It must clearly show progress and result also (in case of any parse failure). UX must be clear enough for the entire flow, don't want any support calls.

### Prompt 29 — Rename to Velocity
> Change "Velocity AI" to "Velocity". "Project Management Dashboard" to "Get it done with AI".

### Prompt 30 — ESC Key & Chat First Name
> When ESC key pressed, it should remove the forms like create issue, edit user, etc. In the chat @username, show only the first part of the user name (remove after a space).

### Prompt 31 — Remove UTC
> Remove the "UTC" reference in Teams card.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Python 3.13, FastAPI, Pydantic |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack React Query |
| MCP Server | Python `mcp` SDK, stdio transport |
| Storage | JSON files (no database) |
| Auth | JWT tokens, SHA-256 password hashing, OTP registration |
| Deployment | Azure App Service, gunicorn + uvicorn |
| Icons | Lucide React |
| State | React Query for server state, useState for local |

## Key Architecture Decisions

- **No database**: All data stored in JSON files for simplicity and portability
- **Dual interface**: MCP server (for AI agents via stdio) + REST API (for web UI)
- **RBAC**: Global roles (Dev/QA/PM/PO) + per-project roles (Project Admin/Product Owner/Project User)
- **Issue hierarchy**: Epic > Feature > Story/Bug > Task (Feature is optional in chain)
- **Story Points** for Epic/Feature/Story/Bug, **Estimate Hours** for Tasks
- **Chat**: Per-project JSON files, read markers for unread tracking, @mention with first-name only
- **CSV Import**: Client-side preview + server-side creation, supports Summary/Type/Description columns

## File Structure (Key Files)

```
JiraMCP/
├── server.py                          # MCP entry point
├── api/
│   ├── main.py                        # FastAPI app
│   └── routes/
│       ├── auth.py                    # Login, register, OTP, JWT
│       ├── issues.py                  # CRUD + CSV import
│       ├── chat.py                    # Chat messages, read markers, unread counts
│       ├── projects.py                # Project CRUD
│       ├── sprints.py                 # Sprint management
│       ├── users.py                   # User management
│       ├── assignments.py             # Project role assignments
│       ├── comments.py                # Issue comments
│       ├── search.py                  # JQL search
│       └── scopes.py                  # Scope documents
├── pmtracker/
│   ├── server.py                      # MCP server wiring
│   ├── api_client.py                  # HTTP client for MCP→API
│   ├── tools/                         # 34 MCP tools (9 modules)
│   └── store/
│       ├── json_store.py              # Data access layer
│       └── data/*.json                # All data files
├── ui/
│   └── src/
│       ├── App.tsx                    # Router setup
│       ├── lib/
│       │   ├── api.ts                 # All API functions
│       │   ├── auth.ts                # JWT/session management
│       │   └── utils.ts               # Shared constants, helpers
│       ├── components/
│       │   ├── Layout.tsx             # Sidebar, search, nav
│       │   ├── CreateIssueDialog.tsx  # Issue creation form
│       │   ├── ImportCsvDialog.tsx    # CSV bulk import
│       │   ├── ChatPanel.tsx          # Slide-out chat panel
│       │   ├── IssueCard.tsx          # Kanban card
│       │   └── AgentTokenDialog.tsx   # MCP agent key mgmt
│       └── pages/
│           ├── Dashboard.tsx          # Home dashboard
│           ├── Login.tsx              # Auth page
│           ├── Backlog.tsx            # Backlog + sprint mgmt
│           ├── SprintBoard.tsx        # Kanban board
│           ├── IssueDetail.tsx        # Issue detail + child tasks
│           ├── ProjectChat.tsx        # Full-page chat
│           ├── People.tsx             # Team page
│           ├── ProjectSettings.tsx    # Project config
│           ├── ProjectBoard.tsx       # Project overview
│           ├── ScopePage.tsx          # Scope documents
│           └── CreateProject.tsx      # New project form
└── CLAUDE.md                          # Full MCP implementation guide
```

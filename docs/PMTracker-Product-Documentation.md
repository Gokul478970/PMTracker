# PMTracker — AI-Native Project Management Platform

### Product Documentation v1.0

---

## 1. Introduction

### What is PMTracker?

PMTracker is an **AI-native project management platform** purpose-built for the age of autonomous agents. While traditional tools like Jira were designed for humans clicking through web interfaces, PMTracker was engineered from the ground up with a dual interface philosophy: a modern web application for human teams **and** a Model Context Protocol (MCP) server that lets AI agents participate as first-class team members.

At its core, PMTracker is a **full-featured agile project management system** — projects, sprints, kanban boards, backlogs, issue tracking, team collaboration — deployed on Microsoft Azure. What sets it apart is its MCP layer: **34 tools** exposed over a standardized protocol that any LLM-based agent can discover, understand, and invoke. This means a Claude agent, a LangChain pipeline, a GPT-4o workflow, or any MCP-compatible framework can create issues, manage sprints, transition statuses, and collaborate with human team members — all through the same backend, the same data, in real time.

PMTracker is not a toy or a simulator. It is a **production-grade platform** running on Azure App Service with a FastAPI backend, React frontend, role-based access control, and persistent data storage. The MCP server acts as a thin proxy to this backend, ensuring that whether a human clicks "Create Issue" on the board or an AI agent calls `create_issue` through MCP, the result is identical.

### Why AI-Native Matters

Traditional project management tools bolt on AI as an afterthought — a chatbot sidebar, a summary generator, a suggestion engine. PMTracker takes the opposite approach:

- **Agents are team members**, not plugins. The Team page lists four planned agent roles (PO Agent, PM Agent, Dev Agent, QA Agent) alongside human members.
- **MCP is not an integration** — it is a primary interface. The 34 MCP tools cover the full surface area of the platform, not a limited subset.
- **Single source of truth.** Humans and agents read and write the same data through the same API. There is no sync lag, no translation layer, no data duplication.
- **Framework-agnostic.** Any LLM that supports tool calling — Claude, GPT-4o, Gemini, LLaMA, Mistral — can operate PMTracker through MCP via adapters like `langchain-mcp-adapters`.

---

## 2. Platform Architecture

### High-Level System Design

```
                         Human Users
                              |
                              v
                    +-------------------+
                    |   React Frontend  |
                    |   (Azure-hosted)  |
                    +--------+----------+
                             |
                             | REST API calls
                             v
                    +-------------------+
                    |  FastAPI Backend   |<-------- Source of Truth
                    |  (Azure App Svc)  |
                    +--------+----------+
                             ^
                             | HTTP + X-Internal-Key
                             |
                    +-------------------+
                    | PMTracker MCP Svr |
                    |  (stdio transport)|
                    +--------+----------+
                             ^
                             | MCP JSON-RPC (stdin/stdout)
                             |
              +--------------+--------------+
              |              |              |
         Claude Code    LangChain      Custom Agent
         Claude Desktop  Agent          (Any LLM)
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18, TypeScript, Tailwind CSS, TanStack Query | Modern SPA with dark mode, drag-and-drop, real-time updates |
| **Backend** | Python, FastAPI | RESTful API with auth middleware, role-based access control |
| **MCP Server** | Python, FastMCP (mcp SDK) | 34-tool interface for AI agent consumption over stdio |
| **Hosting** | Microsoft Azure App Service (South India) | Production deployment with HTTPS |
| **Data** | JSON file storage | Lightweight, human-readable persistence |
| **Auth** | Session tokens, OTP-based registration | Corporate email domain enforcement, role assignment |

### Data Entities

PMTracker manages the following core entities, all accessible by both the web UI and MCP tools:

| Entity | Description |
|--------|-------------|
| **Projects** | Top-level containers with key, name, lead, components, versions |
| **Issues** | Work items — Epics, Stories, Tasks, Bugs, Sub-tasks — with full lifecycle |
| **Sprints** | Time-boxed iterations (future, active, closed) tied to boards |
| **Boards** | Scrum or Kanban boards associated with projects |
| **Users** | Human team members with roles (Admin, Dev, QA, PM, PO) |
| **Comments** | Threaded discussions on issues |
| **Worklogs** | Time tracking entries against issues |
| **Issue Links** | Relationships: Blocks, Relates, Duplicate, Cloners |
| **Scopes / MVPs** | Requirements documents with auto-save |
| **Chat Messages** | Real-time project-level team communication |

---

## 3. Features — Human Interface (Web Application)

### 3.1 Dashboard

The landing page provides a bird's-eye view of all projects. Each project card displays:

- Project name, key, description, and lead
- **Live status breakdown**: To Do, Active, In Review, and Done issue counts as color-coded pills
- Component count and total issue count
- One-click navigation to the project board

Admins see a **New Project** button to create projects with a key, name, description, lead, and initial components.

### 3.2 Project Board — Kanban & List Views

The project board is the primary workspace. It supports two view modes toggled via the toolbar:

**Kanban View** — A four-column board (To Do | In Progress | In Review | Done) with:

- **Drag-and-drop** issue cards between columns to trigger status transitions
- Visual hover feedback with ring highlights and shadow elevation
- Issue cards showing key, type icon, summary, priority color, story points, labels, and assignee avatar

**List View** — A filterable table with columns for Key, Summary, Type, Status, Priority, and Assignee. Click any row to open the issue detail.

**Toolbar actions**: Issue type filter, view mode toggle, chat panel toggle, Create Issue button, and an admin-only Delete Project button with confirmation dialog.

### 3.3 Backlog & Sprint Planning

The Backlog page is where sprint planning happens. It displays:

- **Sprint sections** as expandable accordions — each showing the sprint name, state badge (active/future/closed), issue count, total story points, date range, and goal
- **Backlog section** at the bottom for unassigned items
- **Drag-and-drop** to move issues between sprints or back to the backlog
- **Bulk operations**: Checkbox selection with a dropdown to move multiple issues at once

**Admin sprint controls:**

| Action | When Available | Effect |
|--------|---------------|--------|
| **Start Sprint** | Sprint is in "future" state | Transitions to "active" |
| **Complete Sprint** | Sprint is in "active" state | Transitions to "closed" |
| **Edit Sprint** | Any non-closed sprint | Inline editing of name, goal, start date, end date |
| **Create Sprint** | Always | Adds a new future sprint to the board |

### 3.4 Sprint Board

A focused execution view defaulting to the active sprint. Features include:

- **Sprint selector dropdown** for switching between non-closed sprints
- **Progress bar** showing story point completion (e.g., "12/20 pts" with a green fill)
- Same four-column Kanban layout with drag-and-drop
- Start/Complete sprint action buttons

### 3.5 Issue Detail

A comprehensive two-panel layout for viewing and editing any issue:

**Main Panel:**
- Inline-editable summary and multiline description
- "Blocked" badge when the issue is blocked by another
- Subtasks list with navigation links
- **Issue Links** section: add/remove relationships (Blocks, Relates, Duplicate) between issues
- **Comments tab**: Full comment thread with add/edit capabilities, author avatars, and timestamps
- **History tab**: Timeline of status transitions with from/to status and timestamps

**Sidebar Panel:**
- **Transition buttons**: Context-aware action buttons showing only valid next statuses
- **Editable fields**: Type, Priority, Assignee, Story Points, Sprint, Epic, Parent, Labels, Components, Fix Versions — all with click-to-edit inline editing
- **Dates**: Created and Updated timestamps
- **Delete Issue** button with confirmation

### 3.6 Project Scope & Requirements

A document editor for managing MVPs and project scope:

- Sidebar listing all MVPs (e.g., MVP 1, MVP 2, MVP 3)
- Main editor with a large content textarea and editable title
- **Auto-save** with 1-second debounce and visual "Saving..." / "Saved" indicators
- Character count, last-updated timestamp
- Add and delete MVPs with confirmation

### 3.7 Project Chat

Real-time messaging within a project context:

- Message bubbles with sender avatar, name, and relative timestamp
- Different styling for own messages (blue, right-aligned) vs. others (gray, left-aligned)
- 2000-character limit per message
- **Auto-refresh** every 5 seconds for new messages
- Auto-scroll to latest message
- Also available as a **slide-over panel** on the Project Board via the chat toggle button

### 3.8 Team Management

The Team page has two sections:

**Humans** — Grid of user cards showing:
- Avatar, display name, role badge (color-coded: Admin/Dev/QA/PM/PO)
- Email, timezone, assigned issue count
- Admin-only remove button (cannot remove the admin user)

**Agents** — Four planned AI agent roles:

| Agent | Role | Capabilities |
|-------|------|-------------|
| **PO Agent** | Product Owner | Manages backlog, writes user stories, prioritizes features |
| **PM Agent** | Project Manager | Tracks progress, manages sprints, reports status |
| **Dev Agent** | Developer | Implements features, fixes bugs, reviews code |
| **QA Agent** | Quality Assurance | Tests features, writes test cases, reports defects |

These agents are currently marked "Coming Soon" and represent PMTracker's vision of **mixed human-AI teams** where autonomous agents hold defined project roles.

### 3.9 Authentication & Role-Based Access

- **Corporate email enforcement**: Only `@cognizant.com` addresses can register
- **OTP-based registration**: Multi-stage flow with admin-issued OTP verification
- **Five roles**: Admin, Dev, QA, PM, PO — assigned at registration
- **Admin-only features**: Project creation/deletion, user removal, sprint state transitions, sprint creation/editing

### 3.10 Dark Mode

Full light/dark theme support with a toggle in the sidebar. Theme preference is persisted in localStorage. Every component — cards, badges, modals, inputs, chat bubbles — adapts to the selected theme.

---

## 4. Features — Agent Interface (MCP Server)

### 4.1 What is MCP?

The **Model Context Protocol** is an open standard (created by Anthropic) that defines how LLM applications connect to external tools. Think of it as USB-C for AI agents — a universal port that any compliant agent can plug into.

PMTracker's MCP server exposes **34 tools** over stdio transport. When an agent connects:

1. The agent launches `python server.py` as a subprocess
2. MCP's `tools/list` handshake returns all 34 tools with names, descriptions, and parameter schemas
3. The agent's LLM sees these tools as callable functions and decides when to invoke them
4. Tool calls are routed through the MCP protocol to the Azure backend
5. Results flow back as structured JSON

The agent never needs to know about REST endpoints, authentication headers, or data schemas. MCP abstracts it all away.

### 4.2 Complete Tool Inventory (34 Tools)

#### Issues — 9 Tools
| Tool | Parameters | What It Does |
|------|-----------|-------------|
| `get_issue` | issue_key, fields, comment_limit | Retrieve full issue details by key |
| `search` | jql, fields, start_at, limit | Search issues using JQL-like queries |
| `get_project_issues` | project_key, status, issue_type, start, limit | List all issues in a project with filters |
| `create_issue` | project_key, summary, issue_type, description, priority, assignee, labels, components, sprint | Create a new issue with full field support |
| `batch_create_issues` | project_key, issues_json | Create multiple issues in a single call |
| `update_issue` | issue_key, fields | Update any field on an existing issue |
| `delete_issue` | issue_key | Remove an issue permanently |
| `get_issue_dates` | issue_key | Get created/updated dates and transition history |
| `batch_get_changelogs` | issue_keys | Get transition history for multiple issues at once |

#### Comments & Worklogs — 4 Tools
| Tool | Parameters | What It Does |
|------|-----------|-------------|
| `add_comment` | issue_key, body | Add a comment to an issue |
| `edit_comment` | issue_key, comment_id, body | Modify an existing comment |
| `add_worklog` | issue_key, time_spent, comment | Log time spent on an issue |
| `get_worklog` | issue_key | Retrieve all time entries for an issue |

#### Transitions — 2 Tools
| Tool | Parameters | What It Does |
|------|-----------|-------------|
| `get_transitions` | issue_key | Get available status transitions from current state |
| `transition_issue` | issue_key, transition_id/name, comment | Move issue to a new status |

**Status workflow**: To Do <-> In Progress <-> In Review <-> Done (with configurable transitions per status)

#### Sprints & Boards — 7 Tools
| Tool | Parameters | What It Does |
|------|-----------|-------------|
| `get_agile_boards` | board_name, project_key, board_type | List boards with filters |
| `get_board_issues` | board_id, jql, start_at, limit | Get all issues across a board's sprints |
| `get_sprints_from_board` | board_id, state, start_at, limit | List sprints for a board |
| `get_sprint_issues` | sprint_id, start_at, limit | Get all issues assigned to a sprint |
| `create_sprint` | board_id, name, start_date, end_date, goal | Create a new sprint |
| `update_sprint` | sprint_id, name, state, start_date, end_date, goal | Modify sprint details or change state |
| `add_issues_to_sprint` | sprint_id, issue_keys | Assign issues to a sprint |

#### Projects — 5 Tools
| Tool | Parameters | What It Does |
|------|-----------|-------------|
| `get_all_projects` | include_archived | List all projects |
| `get_project_versions` | project_key | Get release versions for a project |
| `get_project_components` | project_key | Get components for a project |
| `create_version` | project_key, name, description, dates | Create a new release version |
| `batch_create_versions` | project_key, versions_json | Create multiple versions at once |

#### Linking — 5 Tools
| Tool | Parameters | What It Does |
|------|-----------|-------------|
| `get_link_types` | name_filter | List available relationship types |
| `link_to_epic` | issue_key, epic_key | Associate an issue with an epic |
| `create_issue_link` | source_key, link_type, target_key | Create a bidirectional relationship |
| `create_remote_issue_link` | issue_key, url, title | Add an external link to an issue |
| `remove_issue_link` | link_id | Delete a relationship between issues |

#### Users — 4 Tools
| Tool | Parameters | What It Does |
|------|-----------|-------------|
| `get_user_profile` | account_id, email, display_name | Look up a user by any identifier |
| `get_issue_watchers` | issue_key | List watchers on an issue |
| `add_watcher` | issue_key, user_identifier | Subscribe a user to issue updates |
| `remove_watcher` | issue_key, username/account_id | Unsubscribe a user from an issue |

#### Fields — 2 Tools
| Tool | Parameters | What It Does |
|------|-----------|-------------|
| `search_fields` | keyword, limit | Search available fields by name |
| `get_field_options` | field_id | Get allowed values for a field |

#### Attachments — 2 Tools (Simulated)
| Tool | Parameters | What It Does |
|------|-----------|-------------|
| `download_attachments` | issue_key | Returns simulated response (placeholder) |
| `get_issue_images` | issue_key | Returns simulated response (placeholder) |

### 4.3 JQL Search Support

The `search` tool supports a subset of Jira Query Language for filtering issues:

| JQL Clause | Example | Behavior |
|------------|---------|----------|
| `project = KEY` | `project = RFP` | Filter by project key |
| `status = "Name"` | `status = "In Progress"` | Filter by status name |
| `assignee = "value"` | `assignee = "alice@example.com"` | Filter by assignee email or ID |
| `issuetype = "Type"` | `issuetype = "Bug"` | Filter by issue type |
| `labels in ("label")` | `labels in ("mvp")` | Filter by label membership |
| `AND` combinator | `project = RFP AND status = "To Do"` | Combine multiple filters |
| `ORDER BY created DESC` | Appended to any query | Sort by creation date descending |

Unrecognized JQL gracefully falls back to returning all issues.

### 4.4 Authentication for Agents

MCP tool calls are authenticated using an **X-Internal-Key** header, separate from the user-facing session token system. This allows agents to operate without logging in as a human user:

| Header | Default Value | Purpose |
|--------|--------------|---------|
| `X-Internal-Key` | `pmtracker-mcp-internal` | Service-to-service authentication |

The FastAPI middleware recognizes this header and bypasses user authentication, granting the MCP server full access to all API endpoints. This is configurable via the `PMTRACKER_INTERNAL_KEY` environment variable on both the MCP server and the backend.

---

## 5. Agentification — The AI-Native Vision

### 5.1 What is Agentification?

Agentification is the practice of making a software system **natively operable by autonomous AI agents** — not through screen scraping or brittle API wrappers, but through a purpose-built protocol that agents can discover, reason about, and invoke.

PMTracker is agentified through MCP. This means:

- **Any MCP-compatible agent framework** can consume PMTracker without custom integration code
- **Tool discovery is automatic** — the agent learns what tools exist at connection time
- **Parameter schemas are self-describing** — the LLM knows what arguments each tool accepts
- **Error messages are actionable** — the agent can understand failures and retry or adjust

### 5.2 Supported Agent Frameworks

PMTracker's MCP server can be consumed by:

| Framework | How to Connect |
|-----------|---------------|
| **Claude Desktop** | Add to `claude_desktop_config.json` as an MCP server |
| **Claude Code (CLI)** | Add to `.mcp.json` or `~/.claude/claude_mcp_config.json` |
| **Claude Agent SDK** | Configure as an MCP tool source in agent setup |
| **LangChain / LangGraph** | Use `langchain-mcp-adapters` package (`pip install langchain-mcp-adapters`) |
| **OpenAI Agents** | Use MCP-to-OpenAI adapter libraries |
| **CrewAI** | Use MCP tool integration |
| **AutoGen** | Use MCP tool wrapper |
| **Any custom agent** | Use the `mcp` Python SDK client directly |

See the companion document [LangChain MCP Integration Guide](langchain-mcp-integration-guide.md) for detailed step-by-step instructions.

### 5.3 Agent Use Cases

With 34 tools covering the full platform surface area, agents can perform sophisticated workflows:

**Scenario 1 — Autonomous Sprint Planning (PM Agent)**
> "Review the backlog for the RFP project, identify the highest-priority unassigned stories, create Sprint 4 with a two-week window starting Monday, and assign the top 8 stories to it."

The agent would call: `get_project_issues` -> `create_sprint` -> `add_issues_to_sprint`

**Scenario 2 — Bug Triage (QA Agent)**
> "Search for all open bugs across all projects, add a comment to each one asking for reproduction steps, and set priority to High for any that mention 'data loss'."

The agent would call: `search` (jql: `issuetype = "Bug" AND status = "To Do"`) -> loop: `add_comment` + `update_issue`

**Scenario 3 — Daily Standup Report (PM Agent)**
> "Generate a standup report: list all issues that transitioned to 'Done' yesterday, all issues currently 'In Progress', and any blockers."

The agent would call: `search` (multiple JQL queries) -> `batch_get_changelogs` -> compose report

**Scenario 4 — Backlog Grooming (PO Agent)**
> "Look at all stories in the RFP project without story points. Estimate each one based on its description and update the story points field."

The agent would call: `get_project_issues` -> loop: `update_issue` (with story_points)

**Scenario 5 — Cross-Project Dependency Mapping (Dev Agent)**
> "Find all issues that block other issues across all projects. Build a dependency graph and identify the critical path."

The agent would call: `get_all_projects` -> `get_project_issues` (for each) -> analyze `issueLinks` for "Blocks" relationships

### 5.4 Multi-Agent Collaboration

Because PMTracker's backend handles concurrent HTTP requests, **multiple agents can operate simultaneously** on the same project data:

```
PO Agent (Claude)  ──MCP──>  PMTracker MCP Server ──HTTP──>  Azure Backend
PM Agent (GPT-4o)  ──MCP──>  PMTracker MCP Server ──HTTP──>  Azure Backend
Dev Agent (Gemini) ──MCP──>  PMTracker MCP Server ──HTTP──>  Azure Backend
Human (Browser)    ────────────────────────────────HTTP──>  Azure Backend
```

Each agent spawns its own MCP server subprocess, but all connect to the same backend. A PO Agent can create stories while a PM Agent plans sprints while a human reviews the board — all in real time, all seeing each other's changes immediately.

### 5.5 The Planned Agent Roles

PMTracker's Team page outlines four agent roles that represent the vision of AI-augmented project teams:

| Agent | Icon | Responsibility |
|-------|------|---------------|
| **PO Agent** | Product Owner | Manages the product backlog, writes and refines user stories, prioritizes features based on business value, grooms the backlog before sprint planning |
| **PM Agent** | Project Manager | Tracks sprint progress, manages sprint ceremonies (start/complete), generates status reports, identifies blockers and risks, monitors velocity |
| **Dev Agent** | Developer | Implements features and fixes bugs (via external code tools), reviews code, updates issue statuses as work progresses, logs time |
| **QA Agent** | Quality Assurance | Tests completed features, writes and tracks test cases as sub-tasks, reports defects as Bug issues, validates fixes and transitions issues to Done |

These roles are designed to work **alongside human team members**, not replace them. The human remains in control — setting priorities, making architectural decisions, approving releases — while agents handle the repetitive, high-volume operational work.

### 5.6 Security Model for Agents

| Concern | How It's Handled |
|---------|-----------------|
| **Authentication** | X-Internal-Key header for service-to-service auth, separate from user sessions |
| **Authorization** | MCP tools have full backend access; scope control is at the agent framework level |
| **Audit trail** | All changes (transitions, comments, updates) are timestamped and attributed |
| **Data isolation** | Each MCP subprocess is independent; no shared state between agent sessions |
| **Network security** | Azure App Service with HTTPS; agents connect to the same endpoint as the web UI |

For production deployments, recommended hardening includes:
- Rotating the internal key on a schedule
- IP whitelisting or Azure VNet integration
- Per-agent API key issuance for audit differentiation
- Rate limiting per agent to prevent runaway loops

---

## Appendix — Quick Reference

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PMTRACKER_API_URL` | `https://pmtracker-app-g5c5fkgshwbyd5f4.southindia-01.azurewebsites.net` | Azure backend URL |
| `PMTRACKER_INTERNAL_KEY` | `pmtracker-mcp-internal` | MCP service authentication key |

### MCP Server Launch

```
python c:/Siva/projects/JiraMCP/server.py
```

### MCP Configuration (for Claude Code / Claude Desktop)

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

### Issue Statuses & Transitions

```
To Do  ──>  In Progress  ──>  In Review  ──>  Done
  ^              |                |              |
  |              v                v              |
  +----- In Progress <---- In Review             |
  +<--------------------------------------------|
```

### Priority Levels

Highest > High > Medium > Low > Lowest

### Issue Types

Epic | Story | Task | Bug | Sub-task

### User Roles

Admin | Dev | QA | PM | PO

---

*PMTracker is built for the future of software delivery — where humans and AI agents collaborate as equals on the same platform, through the same data, toward the same goals.*

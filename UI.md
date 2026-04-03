# PMTracker UI — Implementation Guide

Build a web UI on top of the existing PMTracker backend to create projects, manage stories, and track work.

---

## Architecture

```
┌─────────────────────────────────┐
│   React + Tailwind + shadcn/ui  │  ← Frontend (Vite dev server :5173)
│   Executive-style dashboard     │
└──────────────┬──────────────────┘
               │ HTTP (REST JSON)
┌──────────────▼──────────────────┐
│   FastAPI REST API (:8000)      │  ← Backend (Python)
│   Reuses pmtracker/tools logic  │
│   + json_store.py directly      │
└──────────────┬──────────────────┘
               │ File I/O
┌──────────────▼──────────────────┐
│   pmtracker/store/data/*.json   │  ← Existing JSON storage
└─────────────────────────────────┘
```

### Why This Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Backend | **FastAPI** | Python, async, auto-generates OpenAPI docs, zero config CORS |
| Frontend | **React + Vite** | Fast dev server, hot reload, massive ecosystem |
| Styling | **Tailwind CSS + shadcn/ui** | Executive-grade polish out of the box, no custom CSS needed |
| State | **TanStack Query (React Query)** | Auto caching, refetch, loading/error states for free |
| Routing | **React Router v7** | Simple SPA routing |

**shadcn/ui** gives you pre-built components (tables, cards, dialogs, forms, badges, dropdowns) that look like a premium SaaS product with zero design effort.

---

## Pages & Features

| Page | What It Shows | Key Actions |
|------|--------------|-------------|
| **Dashboard** | All projects as cards, summary stats (total issues, by status) | Navigate to project |
| **Project Board** | Kanban columns (To Do / In Progress / In Review / Done) with issue cards | Drag-drop status change, quick create issue |
| **Project List View** | Sortable/filterable table of all issues in a project | Inline status change, bulk actions |
| **Issue Detail** | Full issue view — description, comments, history, watchers, links | Edit fields, add comment, log time, transition status |
| **Create Project** | Form: key, name, description, lead, components | Save new project |
| **Create/Edit Issue** | Form: summary, type, priority, assignee, labels, sprint, epic link | Save issue |
| **Sprint Board** | Issues grouped by sprint (active/future) | Move issues between sprints |
| **People** | User list with avatars and assigned issue counts | Click to filter issues by assignee |

---

## Directory Structure

```
JiraMCP/
├── pmtracker/                ← existing (unchanged)
├── api/
│   ├── __init__.py
│   ├── main.py               ← FastAPI app, CORS, mount routes
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── projects.py       ← /api/projects endpoints
│   │   ├── issues.py         ← /api/issues endpoints
│   │   ├── comments.py       ← /api/issues/{key}/comments
│   │   ├── transitions.py    ← /api/issues/{key}/transitions
│   │   ├── sprints.py        ← /api/boards, /api/sprints
│   │   ├── users.py          ← /api/users
│   │   └── search.py         ← /api/search
│   └── deps.py               ← shared dependencies if needed
├── ui/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── components.json        ← shadcn/ui config
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx            ← router setup
│   │   ├── lib/
│   │   │   ├── api.ts         ← fetch wrapper, base URL config
│   │   │   └── utils.ts       ← shadcn/ui cn() utility
│   │   ├── hooks/
│   │   │   ├── use-projects.ts
│   │   │   ├── use-issues.ts
│   │   │   └── use-sprints.ts
│   │   ├── components/
│   │   │   ├── ui/            ← shadcn/ui components (auto-generated)
│   │   │   ├── layout/
│   │   │   │   ├── sidebar.tsx
│   │   │   │   ├── header.tsx
│   │   │   │   └── app-shell.tsx
│   │   │   ├── project-card.tsx
│   │   │   ├── issue-card.tsx
│   │   │   ├── kanban-board.tsx
│   │   │   ├── issue-table.tsx
│   │   │   ├── status-badge.tsx
│   │   │   ├── priority-icon.tsx
│   │   │   ├── create-issue-dialog.tsx
│   │   │   └── comment-thread.tsx
│   │   └── pages/
│   │       ├── dashboard.tsx
│   │       ├── project-board.tsx
│   │       ├── project-list.tsx
│   │       ├── issue-detail.tsx
│   │       ├── create-project.tsx
│   │       ├── sprint-board.tsx
│   │       └── people.tsx
│   └── public/
│       └── favicon.svg
└── ...
```

---

## Implementation Steps

### Step 1 — Install Backend Dependencies

```bash
pip install fastapi uvicorn
```

No other dependencies. FastAPI reuses the existing `pmtracker.store.json_store` module directly — no ORM, no database driver.

---

### Step 2 — Create the FastAPI REST API

**`api/main.py`** — the API entry point:

- Create a FastAPI app
- Add CORS middleware (allow `http://localhost:5173` for Vite dev server)
- Include routers from `api/routes/`
- Run with: `uvicorn api.main:app --reload --port 8000`

---

### Step 3 — Define API Routes

These routes call `json_store` functions directly. No need to go through MCP — the store is the shared layer.

#### 3.1 Projects (`api/routes/projects.py`)

| Method | Endpoint | Maps To |
|--------|----------|---------|
| GET | `/api/projects` | `json_store.get_projects()` |
| GET | `/api/projects/{key}` | `json_store.get_project(key)` |
| POST | `/api/projects` | Append to projects.json |
| GET | `/api/projects/{key}/versions` | `project["versions"]` |
| POST | `/api/projects/{key}/versions` | Append version |
| GET | `/api/projects/{key}/components` | `project["components"]` |
| GET | `/api/projects/{key}/issues` | Filter issues by project key |

#### 3.2 Issues (`api/routes/issues.py`)

| Method | Endpoint | Maps To |
|--------|----------|---------|
| GET | `/api/issues/{key}` | `json_store.get_issue(key)` |
| POST | `/api/issues` | Reuse `_create_issue_impl` from tools/issues.py |
| PUT | `/api/issues/{key}` | Merge fields, save |
| DELETE | `/api/issues/{key}` | Remove from issues.json |
| GET | `/api/issues/{key}/dates` | Return created, updated, transitions_history |

#### 3.3 Comments (`api/routes/comments.py`)

| Method | Endpoint | Maps To |
|--------|----------|---------|
| GET | `/api/issues/{key}/comments` | `issue["fields"]["comment"]["comments"]` |
| POST | `/api/issues/{key}/comments` | Append comment with generated ID |
| PUT | `/api/issues/{key}/comments/{id}` | Update comment body |

#### 3.4 Transitions (`api/routes/transitions.py`)

| Method | Endpoint | Maps To |
|--------|----------|---------|
| GET | `/api/issues/{key}/transitions` | Look up TRANSITIONS map by current status |
| POST | `/api/issues/{key}/transitions` | Apply transition, record history |

#### 3.5 Search (`api/routes/search.py`)

| Method | Endpoint | Maps To |
|--------|----------|---------|
| GET | `/api/search?jql=...&limit=10&start=0` | Reuse `parse_jql` from tools/issues.py |

#### 3.6 Sprints & Boards (`api/routes/sprints.py`)

| Method | Endpoint | Maps To |
|--------|----------|---------|
| GET | `/api/boards` | `json_store.get_boards()` |
| GET | `/api/boards/{id}/sprints` | Filter sprints by boardId |
| GET | `/api/sprints/{id}/issues` | Filter issues by sprint field |
| POST | `/api/sprints` | Create sprint |
| PUT | `/api/sprints/{id}` | Update sprint |
| POST | `/api/sprints/{id}/issues` | Assign issues to sprint |

#### 3.7 Users (`api/routes/users.py`)

| Method | Endpoint | Maps To |
|--------|----------|---------|
| GET | `/api/users` | `json_store.get_users()` |
| GET | `/api/users/{id}` | `json_store.get_user(id)` |

---

### Step 4 — Scaffold the React Frontend

```bash
cd JiraMCP
npm create vite@latest ui -- --template react-ts
cd ui
npm install
```

---

### Step 5 — Install Frontend Dependencies

```bash
# Core
npm install @tanstack/react-query react-router-dom

# shadcn/ui prerequisites
npm install tailwindcss @tailwindcss/vite
npm install class-variance-authority clsx tailwind-merge lucide-react

# Initialize shadcn/ui
npx shadcn@latest init
```

When prompted by shadcn init:
- Style: **Default**
- Base color: **Slate** (executive/professional)
- CSS variables: **Yes**

---

### Step 6 — Add shadcn/ui Components

Install only the components you need:

```bash
npx shadcn@latest add button card badge table dialog input label select textarea
npx shadcn@latest add dropdown-menu avatar separator tabs sheet command
npx shadcn@latest add tooltip popover calendar form
```

These give you the full building block set for an executive-style app.

---

### Step 7 — Configure Vite Proxy

In `ui/vite.config.ts`, add a proxy so the frontend can call `/api/*` without CORS issues in dev:

```ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000'
    }
  }
})
```

---

### Step 8 — Build the Layout Shell

Create the `app-shell.tsx` with:

- **Left sidebar** (collapsible): project list, navigation links (Dashboard, Boards, People)
- **Top header**: breadcrumb, search bar, user avatar dropdown
- **Main content area**: page content renders here

Use shadcn/ui `Sheet` for mobile sidebar, `Separator` between nav sections, `Avatar` for user.

Color scheme: **Slate grays + a single accent color** (blue or indigo). Keep it minimal — executive dashboards should feel calm, not busy.

---

### Step 9 — Build the Dashboard Page

**Layout**:
- Top row: 3-4 stat cards (total projects, total issues, in-progress count, done count)
- Below: project cards in a responsive grid (2-3 columns)

**Each project card shows**:
- Project name and key (as badge)
- Lead name
- Issue count by status (small bar or pills)
- Click → navigates to Project Board

Use shadcn `Card`, `Badge`, and `Button` components.

---

### Step 10 — Build the Project Board (Kanban)

**Layout**: 4 columns — To Do | In Progress | In Review | Done

**Each column**:
- Column header with count badge
- Stack of issue cards

**Each issue card shows**:
- Issue key (e.g., ECOM-4) as a clickable link
- Summary (title)
- Priority icon (colored dot or arrow)
- Assignee avatar (initials circle)
- Issue type icon (small)
- Labels as tiny badges

**Interactions**:
- Click card → open Issue Detail (slide-over panel or new page)
- "+" button at column top → Create Issue dialog with that status pre-selected
- Optional: drag-drop between columns (calls transition API)

For drag-drop, add `@hello-pangea/dnd` (lightweight, maintained fork of react-beautiful-dnd):
```bash
npm install @hello-pangea/dnd
```

---

### Step 11 — Build the Issue Detail Page

**Layout**: Two-column on desktop

**Left column (wide)**:
- Issue key + summary as heading
- Description (rendered markdown or plain text)
- Comment thread (chronological, with "Add comment" text area at bottom)
- Activity / transition history timeline

**Right column (narrow sidebar)**:
- Status (dropdown to transition)
- Priority
- Assignee (dropdown of users)
- Reporter
- Sprint
- Epic link
- Labels (pill badges)
- Components
- Story Points
- Watchers
- Created / Updated dates

Use shadcn `Tabs` to switch between Comments and History in the left column.

---

### Step 12 — Build the Create/Edit Issue Dialog

Use shadcn `Dialog` component. Form fields:

| Field | Component |
|-------|-----------|
| Project | `Select` (dropdown of projects — only on create) |
| Issue Type | `Select` (Epic, Story, Task, Bug, Sub-task) |
| Summary | `Input` |
| Description | `Textarea` |
| Priority | `Select` (Highest, High, Medium, Low, Lowest) |
| Assignee | `Select` (users dropdown) |
| Labels | `Input` (comma-separated) |
| Sprint | `Select` (sprints for the project's board) |
| Epic Link | `Select` (epics in the project) |
| Story Points | `Input` (number) |

On submit → POST `/api/issues` → refetch project issues → close dialog.

---

### Step 13 — Build the Create Project Page

Simple form with:

| Field | Component |
|-------|-----------|
| Project Key | `Input` (uppercase, validated against `^[A-Z][A-Z0-9_]+$`) |
| Project Name | `Input` |
| Description | `Textarea` |
| Lead | `Select` (users dropdown) |
| Components | `Input` (comma-separated, creates component objects) |

On submit → POST `/api/projects` → navigate to new project's board.

---

### Step 14 — Build the Sprint Board Page

**Layout**: Grouped by sprint

- **Active Sprint** section (highlighted): sprint name, goal, date range, issue cards
- **Future Sprints** section: collapsible, each sprint with its issues
- **Backlog** section: issues with no sprint assigned

**Actions**:
- Move issue to sprint (dropdown on each card)
- Create new sprint (button)
- Start/complete sprint (button on sprint header)

---

### Step 15 — Build the People Page

**Layout**: Grid of user cards

Each card:
- Avatar (initials-based, colored)
- Name and email
- Assigned issues count
- Click → filtered issue list for that user

---

### Step 16 — API Client Layer

Create `ui/src/lib/api.ts`:

- Base fetch wrapper that prepends `/api` and handles JSON parse
- Error handling: throw on non-2xx, display toast via shadcn `Sonner` or `Toast`
- Type-safe functions: `getProjects()`, `getIssue(key)`, `createIssue(data)`, etc.

Create React Query hooks in `ui/src/hooks/`:
- `useProjects()` → `GET /api/projects`
- `useProjectIssues(key)` → `GET /api/projects/{key}/issues`
- `useIssue(key)` → `GET /api/issues/{key}`
- `useCreateIssue()` → mutation + invalidation
- etc.

React Query handles caching, loading states, and background refetching automatically.

---

### Step 17 — Polish & Executive Touches

- **Typography**: Use `Inter` or `Geist` font (clean, modern, professional)
- **Color palette**: Slate-700 for text, Slate-100 for backgrounds, Blue-600 for primary actions
- **Status colors**: To Do (gray), In Progress (blue), In Review (amber), Done (green)
- **Priority icons**: Highest (red up-arrow), High (orange up-arrow), Medium (yellow dash), Low (blue down-arrow)
- **Empty states**: Friendly message + CTA button ("No issues yet — create your first story")
- **Loading skeletons**: Use shadcn `Skeleton` component while data loads
- **Responsive**: Sidebar collapses on mobile, kanban scrolls horizontally

---

## Running Locally (Dev Mode)

Terminal 1 — Backend:
```bash
cd JiraMCP
uvicorn api.main:app --reload --port 8000
```

Terminal 2 — Frontend:
```bash
cd JiraMCP/ui
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Running for Production

### Step 1 — Build the frontend

```bash
cd JiraMCP/ui
npm run build
```

This outputs static files to `ui/dist/`.

### Step 2 — Serve from FastAPI

Mount the `dist/` folder as static files in `api/main.py`:

```python
from fastapi.staticfiles import StaticFiles

# API routes first
app.include_router(...)

# Then serve frontend as fallback
app.mount("/", StaticFiles(directory="ui/dist", html=True), name="frontend")
```

Now everything runs on a single port:
```bash
uvicorn api.main:app --host 0.0.0.0 --port 8000
```

### Step 3 — Deploy

Same options as in `deployment.md`:
- **Docker**: single container, expose port 8000
- **Cloud**: Railway / Render / Fly.io with `Dockerfile`
- **VM**: systemd service behind nginx with TLS

### Step 4 — Data persistence

- Mount `pmtracker/store/data/` as a persistent volume (Docker) or use a dedicated data directory
- For concurrent users: consider adding file locking in `json_store.py` or migrating to SQLite

---

## Dependency Summary

### Backend (Python)
```
fastapi
uvicorn
mcp>=1.0.0      # already installed
```

### Frontend (Node.js)
```
react + react-dom
@tanstack/react-query
react-router-dom
tailwindcss
shadcn/ui components
lucide-react (icons)
@hello-pangea/dnd (optional, for drag-drop)
```

---

## Implementation Order (Recommended)

| Phase | What | Effort |
|-------|------|--------|
| 1 | FastAPI routes (all of Step 2-3) | 1 session |
| 2 | React scaffold + layout shell (Steps 4-8) | 1 session |
| 3 | Dashboard + Project Board (Steps 9-10) | 1 session |
| 4 | Issue Detail + Create/Edit forms (Steps 11-13) | 1 session |
| 5 | Sprint Board + People (Steps 14-15) | 1 session |
| 6 | API hooks + wiring (Step 16) | woven into 3-5 |
| 7 | Polish + production build (Step 17 + production) | 1 session |

---

## Quick Validation Checklist

After each phase, verify:

- [ ] Can I see all projects on the dashboard?
- [ ] Can I create a new project and see it appear?
- [ ] Can I create stories/bugs/tasks under a project?
- [ ] Does the Kanban board show issues in correct columns?
- [ ] Can I click an issue and see full details?
- [ ] Can I change issue status and see it move columns?
- [ ] Can I add a comment and see it appear?
- [ ] Can I assign issues to sprints?
- [ ] Do loading and empty states look polished?
- [ ] Does the app feel like a premium tool, not a prototype?

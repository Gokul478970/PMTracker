# PMTracker — Project Chat Rooms

## Overview

Each project gets its own chat room where team members can post messages in real time.
Chat history is stored as JSON — one file per project (`chat_{PROJECT_KEY}.json`).
Messages include sender info (email + display name), timestamp, and text body.

---

## Data Storage

### File location
```
pmtracker/store/data/chat_{PROJECT_KEY}.json
```

Example: `chat_ECOM.json`, `chat_MOB.json`

### Message schema
```json
[
  {
    "id": "msg-a1b2c3d4",
    "sender_email": "604671@cognizant.com",
    "sender_name": "Siva",
    "text": "Hey team, sprint 2 is starting today!",
    "timestamp": "2026-03-06T11:30:00.000Z"
  }
]
```

- `id` — unique ID: `msg-{uuid4()[:8]}`
- `sender_email` — extracted from the auth token session
- `sender_name` — looked up from merged users list (auth_users + seed users)
- `text` — the message body (plain text)
- `timestamp` — ISO 8601 UTC

---

## API Endpoints

### Step 1 — Backend: `api/routes/chat.py`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/projects/{project_key}/chat` | Get chat history for a project |
| POST | `/api/projects/{project_key}/chat` | Send a new message |

**GET `/api/projects/{project_key}/chat`**
- Query params: `limit` (default 50), `before` (message ID for pagination)
- Returns: `{ "messages": [...], "total": N }`
- Messages sorted by timestamp descending (newest first)
- If file doesn't exist, return empty array

**POST `/api/projects/{project_key}/chat`**
- Body: `{ "text": "Hello!" }`
- Validates: project exists, text is non-empty (max 2000 chars)
- Reads sender email from the auth session (via Authorization header)
- Looks up display name from merged users
- Appends message to `chat_{project_key}.json`
- Returns: the created message object

### Step 2 — Backend: Wire into `api/main.py`

- Import and register `chat.router`
- No new auth changes needed (existing middleware covers `/api/*`)

### Step 3 — Backend: Helper to get current user from request

- Extract email from the Bearer token in auth middleware
- Pass email through via `request.state.user_email`
- Chat route reads `request.state.user_email` to identify the sender

---

## Frontend

### Step 4 — API client: `ui/src/lib/api.ts`

Add two functions:
```typescript
export const getChatMessages = (projectKey: string, limit?: number) =>
  request<any>(`/projects/${projectKey}/chat?limit=${limit || 50}`)

export const sendChatMessage = (projectKey: string, text: string) =>
  request<any>(`/projects/${projectKey}/chat`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
```

### Step 5 — Chat component: `ui/src/components/ChatPanel.tsx`

A slide-out or embedded panel component:

**Layout:**
- Header: "Project Chat" with project key
- Message list: scrollable, newest at bottom, auto-scroll on new messages
- Each message shows: avatar (initials), sender name, timestamp, text
- Input bar: text input + send button at the bottom
- "You" indicator for messages from the current user

**Behavior:**
- Polls for new messages every 5 seconds using react-query `refetchInterval`
- Optimistic updates: show sent message immediately before server confirms
- Auto-scroll to bottom when new messages arrive
- Shows "No messages yet" placeholder for empty rooms
- Max 2000 chars per message

### Step 6 — Integrate into ProjectBoard

Add a chat toggle button in the ProjectBoard header (next to view toggle and filter).
When clicked, a chat panel slides in from the right side as a sidebar overlay.

**UI placement:**
- Chat icon button in the project header toolbar
- Chat panel: fixed right sidebar (320px wide) that overlays the board
- Close button to hide the panel
- Unread indicator (optional): show dot if new messages since last view

### Step 7 — Add route for dedicated chat page

Add route `/projects/:projectKey/chat` for a full-page chat view.
Add "Chat" link in the sidebar nav under each project.

---

## Implementation Order

1. Step 3 — Update auth middleware to set `request.state.user_email`
2. Step 1 — Create `api/routes/chat.py`
3. Step 2 — Wire into `api/main.py`
4. Step 4 — Add API functions in `api.ts`
5. Step 5 — Build `ChatPanel.tsx` component
6. Step 6 — Integrate into ProjectBoard
7. Step 7 — Add route and nav link
8. Build and test

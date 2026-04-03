# PMTracker MCP — Consumer Guide

How to connect your agent to the PMTracker MCP server deployed on Azure.

---

## Connection Details

| Property | Value |
|----------|-------|
| **MCP HTTP Endpoint** | `https://pmtracker-app-g5c5fkgshwbyd5f4.southindia-01.azurewebsites.net/mcp` |
| **Transport** | Streamable HTTP |
| **Auth Header** | `X-Agent-Key: <your-key>` |
| **MCP Path** | `/mcp` |

Get your agent key from the PMTracker web UI: **Team page → click an agent card → Generate New Key → copy it**.

---

## Option 1 — Claude Agent SDK (Python)

```bash
pip install mcp anthropic
```

```python
import asyncio
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

MCP_URL = "https://pmtracker-app-g5c5fkgshwbyd5f4.southindia-01.azurewebsites.net/mcp"
AGENT_KEY = "sk-agent-..."  # your key from PMTracker UI

async def main():
    headers = {"X-Agent-Key": AGENT_KEY}

    async with streamablehttp_client(MCP_URL, headers=headers) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # List all available tools
            tools = await session.list_tools()
            for t in tools.tools:
                print(f"  {t.name}: {t.description}")

            # Call a tool
            result = await session.call_tool("get_all_projects", arguments={})
            print(result)

asyncio.run(main())
```

---

## Option 2 — LangChain / LangGraph

```bash
pip install langchain-mcp-adapters langgraph langchain-anthropic
```

```python
import asyncio
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from langchain_mcp_adapters.tools import load_mcp_tools
from langgraph.prebuilt import create_react_agent
from langchain_anthropic import ChatAnthropic

MCP_URL = "https://pmtracker-app-g5c5fkgshwbyd5f4.southindia-01.azurewebsites.net/mcp"
AGENT_KEY = "sk-agent-..."

async def main():
    model = ChatAnthropic(model="claude-sonnet-4-20250514", temperature=0)
    headers = {"X-Agent-Key": AGENT_KEY}

    async with streamablehttp_client(MCP_URL, headers=headers) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await load_mcp_tools(session)

            agent = create_react_agent(model, tools)
            result = await agent.ainvoke({
                "messages": [("user", "List all issues in the RFP project")]
            })
            print(result["messages"][-1].content)

asyncio.run(main())
```

---

## Option 3 — LangChain MultiServerMCPClient

Use this when connecting to PMTracker alongside other MCP servers.

```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent
from langchain_anthropic import ChatAnthropic

async def main():
    model = ChatAnthropic(model="claude-sonnet-4-20250514", temperature=0)

    async with MultiServerMCPClient(
        {
            "pmtracker": {
                "url": "https://pmtracker-app-g5c5fkgshwbyd5f4.southindia-01.azurewebsites.net/mcp",
                "transport": "streamable_http",
                "headers": {"X-Agent-Key": "sk-agent-..."},
            },
            # Add other MCP servers here if needed
        }
    ) as client:
        tools = await client.get_tools()
        agent = create_react_agent(model, tools)
        result = await agent.ainvoke({
            "messages": [("user", "Create a bug in RFP: Login button not working on Safari")]
        })
        print(result["messages"][-1].content)

asyncio.run(main())
```

---

## Option 4 — Direct REST API (No MCP)

If your agent doesn't support MCP, you can call the PMTracker REST API directly using the same agent key.

```python
import requests

BASE = "https://pmtracker-app-g5c5fkgshwbyd5f4.southindia-01.azurewebsites.net/api"
HEADERS = {"X-Agent-Key": "sk-agent-...", "Content-Type": "application/json"}

# List projects
projects = requests.get(f"{BASE}/projects", headers=HEADERS).json()

# Get issues for a project
issues = requests.get(f"{BASE}/projects/RFP/issues", headers=HEADERS).json()

# Create an issue
new_issue = requests.post(f"{BASE}/issues", headers=HEADERS, json={
    "project_key": "RFP",
    "summary": "Fix login timeout on mobile",
    "issue_type": "Bug",
    "priority": "High",
    "description": "Users report session expires after 30 seconds on iOS Safari.",
}).json()

# Transition an issue
requests.post(f"{BASE}/issues/RFP-4/transitions", headers=HEADERS, json={
    "transition_name": "In Progress"
})

# Add a comment
requests.post(f"{BASE}/issues/RFP-4/comments", headers=HEADERS, json={
    "body": "Investigating — looks like a cookie SameSite issue."
})
```

---

## Available MCP Tools (34)

### Issues
| Tool | Parameters |
|------|-----------|
| `get_issue` | `issue_key`, `fields?`, `comment_limit?` |
| `search` | `jql`, `fields?`, `start_at?`, `limit?` |
| `get_project_issues` | `project_key`, `status?`, `issue_type?`, `start?`, `limit?` |
| `create_issue` | `project_key`, `summary`, `issue_type?`, `description?`, `priority?`, `assignee?`, `labels?`, `components?`, `sprint?` |
| `batch_create_issues` | `project_key`, `issues_json` |
| `update_issue` | `issue_key`, `fields` |
| `delete_issue` | `issue_key` |
| `get_issue_dates` | `issue_key` |
| `batch_get_changelogs` | `issue_keys` |

### Comments & Worklogs
| Tool | Parameters |
|------|-----------|
| `add_comment` | `issue_key`, `body` |
| `edit_comment` | `issue_key`, `comment_id`, `body` |
| `add_worklog` | `issue_key`, `time_spent`, `comment?` |
| `get_worklog` | `issue_key` |

### Transitions
| Tool | Parameters |
|------|-----------|
| `get_transitions` | `issue_key` |
| `transition_issue` | `issue_key`, `transition_id?`, `transition_name?`, `comment?` |

### Sprints & Boards
| Tool | Parameters |
|------|-----------|
| `get_agile_boards` | `board_name?`, `project_key?`, `board_type?` |
| `get_board_issues` | `board_id`, `jql?`, `start_at?`, `limit?` |
| `get_sprints_from_board` | `board_id`, `state?`, `start_at?`, `limit?` |
| `get_sprint_issues` | `sprint_id`, `start_at?`, `limit?` |
| `create_sprint` | `board_id`, `name`, `start_date?`, `end_date?`, `goal?` |
| `update_sprint` | `sprint_id`, `name?`, `state?`, `start_date?`, `end_date?`, `goal?` |
| `add_issues_to_sprint` | `sprint_id`, `issue_keys` |

### Projects
| Tool | Parameters |
|------|-----------|
| `get_all_projects` | `include_archived?` |
| `get_project_versions` | `project_key` |
| `get_project_components` | `project_key` |
| `create_version` | `project_key`, `name`, `description?`, `start_date?`, `release_date?` |
| `batch_create_versions` | `project_key`, `versions_json` |

### Linking
| Tool | Parameters |
|------|-----------|
| `get_link_types` | `name_filter?` |
| `link_to_epic` | `issue_key`, `epic_key` |
| `create_issue_link` | `source_key`, `link_type`, `target_key` |
| `create_remote_issue_link` | `issue_key`, `url`, `title` |
| `remove_issue_link` | `link_id` |

### Users
| Tool | Parameters |
|------|-----------|
| `get_user_profile` | `account_id?`, `email_address?`, `display_name?` |
| `get_issue_watchers` | `issue_key` |
| `add_watcher` | `issue_key`, `user_identifier` |
| `remove_watcher` | `issue_key`, `username?`, `account_id?` |

### Fields
| Tool | Parameters |
|------|-----------|
| `search_fields` | `keyword`, `limit?` |
| `get_field_options` | `field_id` |

---

## REST API Endpoints (for Option 4)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/{key}/issues` | Get project issues |
| GET | `/api/issues/{key}` | Get single issue |
| POST | `/api/issues` | Create issue |
| PUT | `/api/issues/{key}` | Update issue |
| DELETE | `/api/issues/{key}` | Delete issue |
| GET | `/api/issues/{key}/transitions` | Available transitions |
| POST | `/api/issues/{key}/transitions` | Transition issue |
| POST | `/api/issues/{key}/comments` | Add comment |
| PUT | `/api/issues/{key}/comments/{id}` | Edit comment |
| GET | `/api/boards` | List boards |
| GET | `/api/boards/{id}/sprints` | List sprints |
| POST | `/api/sprints` | Create sprint |
| PUT | `/api/sprints/{id}` | Update sprint |
| POST | `/api/sprints/{id}/issues` | Add issues to sprint |
| GET | `/api/users` | List users |
| GET | `/api/search?jql=...` | Search issues (JQL) |

All endpoints accept `X-Agent-Key` header for authentication.

---

## JQL Search Examples

```
project = RFP
project = RFP AND status = "In Progress"
issuetype = "Bug" AND status = "To Do"
assignee = "alice@example.com"
labels in ("mvp")
project = RFP AND status = "To Do" ORDER BY created DESC
```

---

## Environment Variables (for your agent project)

```env
PMTRACKER_MCP_URL=https://pmtracker-app-g5c5fkgshwbyd5f4.southindia-01.azurewebsites.net/mcp
PMTRACKER_AGENT_KEY=sk-agent-...
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `401 Invalid or revoked agent key` | Check your key is correct and not revoked in Team page |
| `401 Not authenticated` | You're missing the `X-Agent-Key` header |
| Empty results | The project may not have data — try `get_all_projects` first |
| Connection timeout | Verify Azure app is running: `GET /api/health` |
| SSL errors | Add `verify=False` to requests or configure your CA bundle |

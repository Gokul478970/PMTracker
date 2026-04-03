# How to Consume the PMTracker MCP Server from a LangChain Agent

A comprehensive, step-by-step guide for integrating the PMTracker MCP server into any LangChain-based LLM agent. No changes to the PMTracker codebase are required.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Prerequisites](#3-prerequisites)
4. [Step 1 — Install Dependencies](#step-1--install-dependencies)
5. [Step 2 — Understand What the MCP Server Exposes](#step-2--understand-what-the-mcp-server-exposes)
6. [Step 3 — Configure the MCP Server Connection (stdio)](#step-3--configure-the-mcp-server-connection-stdio)
7. [Step 4 — Load MCP Tools into LangChain (Single Server)](#step-4--load-mcp-tools-into-langchain-single-server)
8. [Step 5 — Load MCP Tools into LangChain (Multi-Server)](#step-5--load-mcp-tools-into-langchain-multi-server)
9. [Step 6 — Create a ReAct Agent with the Tools](#step-6--create-a-react-agent-with-the-tools)
10. [Step 7 — Run the Agent with a User Query](#step-7--run-the-agent-with-a-user-query)
11. [Step 8 — Advanced: Custom LangGraph Workflow](#step-8--advanced-custom-langgraph-workflow)
12. [Step 9 — Using a Different LLM Provider](#step-9--using-a-different-llm-provider)
13. [Step 10 — Deployment Considerations](#step-10--deployment-considerations)
14. [Troubleshooting](#troubleshooting)
15. [Appendix A — Full Tool Reference](#appendix-a--full-tool-reference)
16. [Appendix B — Example Prompts and Expected Behavior](#appendix-b--example-prompts-and-expected-behavior)

---

## 1. Overview

### What is MCP?

**Model Context Protocol (MCP)** is an open protocol (created by Anthropic) that standardizes how LLM applications connect to external tools and data sources. It acts as a universal adapter — any MCP-compliant tool server can be consumed by any MCP-compliant client, regardless of the LLM provider.

### What is the PMTracker MCP Server?

PMTracker is a Jira-compatible MCP tool server that exposes **34 project management tools** (issues, sprints, comments, transitions, etc.). It uses **stdio transport** — the consuming agent launches it as a subprocess and communicates over stdin/stdout using the MCP JSON-RPC protocol.

The PMTracker MCP server acts as a **thin proxy**: each tool call is forwarded via HTTP to a FastAPI backend running on Azure, which is the single source of truth for all project data.

### What does this guide cover?

How to wire the PMTracker MCP server into a **LangChain/LangGraph agent** so that your LLM can read, create, update, and manage project issues, sprints, comments, and more — using natural language.

---

## 2. Architecture

```
+--------------------------+
|    Your LangChain Agent  |
|  (Python application)    |
+-----------+--------------+
            |
            | LangChain tool calls
            v
+---------------------------+
| langchain-mcp-adapters    |
| (converts MCP <-> LC)     |
+-----------+---------------+
            |
            | MCP JSON-RPC (stdin/stdout)
            v
+---------------------------+
| PMTracker MCP Server      |
| python server.py          |
| (subprocess, stdio)       |
+-----------+---------------+
            |
            | HTTP + X-Internal-Key header
            v
+---------------------------+
| FastAPI Backend           |
| (Azure Web App)           |
| pmtracker-app-xxx.azure   |
| websites.net              |
+---------------------------+
            |
            v
     JSON data store
```

**Data flow in detail:**

1. User sends a natural language message to the LangChain agent
2. The LLM decides which PMTracker tool to call (e.g., `get_project_issues`)
3. LangChain invokes the tool via `langchain-mcp-adapters`
4. The adapter sends a JSON-RPC message over stdin to the PMTracker subprocess
5. PMTracker's tool handler makes an HTTP request to the Azure FastAPI backend
6. The backend returns JSON data
7. The response travels back through stdout -> adapter -> LangChain -> LLM
8. The LLM formulates a natural language answer for the user

---

## 3. Prerequisites

Before you begin, ensure you have:

| Requirement | Details |
|-------------|---------|
| **Python** | 3.11 or higher |
| **PMTracker source code** | Cloned from the repo, located at a known path (e.g., `c:/Siva/projects/JiraMCP/`) |
| **PMTracker dependencies installed** | Run `pip install -e .` in the PMTracker repo root |
| **Azure backend running** | The FastAPI backend must be deployed and accessible at the configured URL |
| **LLM API key** | An API key for your chosen LLM provider (OpenAI, Anthropic, etc.) |
| **Network access** | The machine running the agent must be able to reach the Azure backend URL |

---

## Step 1 — Install Dependencies

Install the required Python packages in your agent project's virtual environment:

```bash
pip install langchain-mcp-adapters langgraph langchain-core
```

Then install your LLM provider package. Pick one:

```bash
# For OpenAI (GPT-4o, GPT-4, etc.)
pip install langchain-openai

# For Anthropic (Claude)
pip install langchain-anthropic

# For Azure OpenAI
pip install langchain-openai   # same package, different config
```

**Package summary:**

| Package | Purpose |
|---------|---------|
| `langchain-mcp-adapters` | Official LangChain adapter that converts MCP tools into LangChain-compatible tools |
| `langgraph` | Agent framework for building ReAct agents and custom tool-using workflows |
| `langchain-core` | Core LangChain abstractions (messages, tools, runnables) |
| `langchain-openai` / `langchain-anthropic` | LLM provider bindings |

---

## Step 2 — Understand What the MCP Server Exposes

When your LangChain agent connects to PMTracker via MCP, it automatically discovers all 34 tools through the MCP `tools/list` handshake. You do not need to manually define tool schemas — the adapter handles this.

Here is what gets exposed:

### Issues (9 tools)
| Tool Name | What it does |
|-----------|-------------|
| `get_issue` | Fetch a single issue by key (e.g., `RFP-1`) |
| `search` | Search issues using JQL-like queries |
| `get_project_issues` | List all issues in a project |
| `create_issue` | Create a new issue |
| `batch_create_issues` | Create multiple issues at once |
| `update_issue` | Update fields on an existing issue |
| `delete_issue` | Delete an issue |
| `get_issue_dates` | Get created/updated dates and transition history |
| `batch_get_changelogs` | Get changelogs for multiple issues |

### Comments & Worklogs (4 tools)
| Tool Name | What it does |
|-----------|-------------|
| `add_comment` | Add a comment to an issue |
| `edit_comment` | Edit an existing comment |
| `add_worklog` | Log time against an issue |
| `get_worklog` | Get all worklogs for an issue |

### Transitions (2 tools)
| Tool Name | What it does |
|-----------|-------------|
| `get_transitions` | Get available status transitions for an issue |
| `transition_issue` | Move an issue to a new status |

### Sprints & Boards (7 tools)
| Tool Name | What it does |
|-----------|-------------|
| `get_agile_boards` | List agile boards |
| `get_board_issues` | Get issues on a specific board |
| `get_sprints_from_board` | List sprints for a board |
| `get_sprint_issues` | Get all issues in a sprint |
| `create_sprint` | Create a new sprint |
| `update_sprint` | Update sprint details (name, dates, state) |
| `add_issues_to_sprint` | Move issues into a sprint |

### Projects (5 tools)
| Tool Name | What it does |
|-----------|-------------|
| `get_all_projects` | List all projects |
| `get_project_versions` | Get release versions for a project |
| `get_project_components` | Get components for a project |
| `create_version` | Create a new release version |
| `batch_create_versions` | Create multiple versions at once |

### Linking (5 tools)
| Tool Name | What it does |
|-----------|-------------|
| `get_link_types` | List available link types (Blocks, Relates, etc.) |
| `link_to_epic` | Link an issue to an epic |
| `create_issue_link` | Create a link between two issues |
| `create_remote_issue_link` | Create an external link on an issue |
| `remove_issue_link` | Remove a link between issues |

### Users (4 tools)
| Tool Name | What it does |
|-----------|-------------|
| `get_user_profile` | Look up a user by ID, email, or name |
| `get_issue_watchers` | Get watchers on an issue |
| `add_watcher` | Add a watcher to an issue |
| `remove_watcher` | Remove a watcher from an issue |

### Fields (2 tools)
| Tool Name | What it does |
|-----------|-------------|
| `search_fields` | Search available fields by keyword |
| `get_field_options` | Get allowed values for a custom field |

### Attachments (2 tools — simulated)
| Tool Name | What it does |
|-----------|-------------|
| `download_attachments` | Returns simulated empty response |
| `get_issue_images` | Returns simulated empty response |

---

## Step 3 — Configure the MCP Server Connection (stdio)

The PMTracker MCP server uses **stdio transport**. This means:

- Your LangChain agent **launches `python server.py` as a child process**
- Communication happens over **stdin (input) and stdout (output)** of that process
- The subprocess stays alive for the duration of your agent session
- When the agent session ends, the subprocess is terminated

You need to know two things:

1. **The command to launch the server:** `python`
2. **The path to `server.py`:** e.g., `c:/Siva/projects/JiraMCP/server.py`

The connection is configured using `StdioServerParameters` from the `mcp` SDK:

```python
from mcp import StdioServerParameters

server_params = StdioServerParameters(
    command="python",
    args=["c:/Siva/projects/JiraMCP/server.py"],
    # Optional: set environment variables for the subprocess
    env={
        "PMTRACKER_API_URL": "https://pmtracker-app-g5c5fkgshwbyd5f4.southindia-01.azurewebsites.net",
        "PMTRACKER_INTERNAL_KEY": "pmtracker-mcp-internal",
    },
)
```

**Notes on the `env` parameter:**
- If omitted, the subprocess inherits the parent process's environment
- The Azure URL and internal key have sensible defaults baked into `api_client.py`, so you typically don't need to set them
- Use `env` if you need to point to a different backend (e.g., localhost for development)

---

## Step 4 — Load MCP Tools into LangChain (Single Server)

This is the simplest approach when you only need tools from PMTracker.

```python
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from langchain_mcp_adapters.tools import load_mcp_tools

async def get_pmtracker_tools():
    server_params = StdioServerParameters(
        command="python",
        args=["c:/Siva/projects/JiraMCP/server.py"],
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # MCP handshake — discovers all 34 tools
            await session.initialize()

            # Convert MCP tools to LangChain tool objects
            tools = await load_mcp_tools(session)

            # Each tool is now a LangChain BaseTool with:
            #   - .name (e.g., "get_issue")
            #   - .description (from the MCP tool docstring)
            #   - .args_schema (auto-generated from MCP parameter schema)
            return tools
```

**What `load_mcp_tools()` does:**

1. Calls the MCP server's `tools/list` endpoint
2. For each tool, creates a LangChain `BaseTool` object
3. Maps MCP parameter schemas to LangChain's `args_schema`
4. Wires the tool's `invoke()` method to send MCP `tools/call` requests
5. Returns a flat list of LangChain tools ready for use in any agent

**Important:** The tools are only valid within the `async with` context. The MCP session and subprocess are cleaned up when the context exits. Your agent must run inside this context.

---

## Step 5 — Load MCP Tools into LangChain (Multi-Server)

If your agent needs tools from **multiple MCP servers** (e.g., PMTracker + a file system server + a web search server), use `MultiServerMCPClient`:

```python
from langchain_mcp_adapters.client import MultiServerMCPClient

async def get_all_tools():
    async with MultiServerMCPClient(
        {
            "pmtracker": {
                "command": "python",
                "args": ["c:/Siva/projects/JiraMCP/server.py"],
                "transport": "stdio",
            },
            # Add more servers as needed:
            "filesystem": {
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
                "transport": "stdio",
            },
            "remote_tool_server": {
                "url": "http://localhost:9000/mcp",
                "transport": "http",
            },
        }
    ) as client:
        # Returns tools from ALL configured servers in a single flat list
        tools = await client.get_tools()
        return tools
```

**Key behaviors of `MultiServerMCPClient`:**

- Launches all stdio servers as subprocesses in parallel
- Connects to all HTTP/SSE servers concurrently
- Aggregates tools from all servers into one list
- Handles tool name collisions by optionally prefixing tool names with the server key
- Manages lifecycle — all subprocesses are terminated when the context exits

---

## Step 6 — Create a ReAct Agent with the Tools

A **ReAct agent** is an LLM that reasons about which tool to call, calls it, observes the result, and repeats until it has enough information to answer. LangGraph provides a prebuilt ReAct agent:

```python
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI

# Choose your LLM
model = ChatOpenAI(model="gpt-4o", temperature=0)

# Create the agent (tools come from Step 4 or Step 5)
agent = create_react_agent(model, tools)
```

**What `create_react_agent` does:**

1. Wraps the LLM with a system prompt that describes the available tools
2. Creates a LangGraph state machine with two nodes: "agent" (LLM reasoning) and "tools" (tool execution)
3. The agent loop: LLM decides -> call tool -> observe result -> decide again -> ... -> final answer
4. Returns a compiled LangGraph `Runnable` that you can `.ainvoke()` or `.astream()`

**Choosing a model:**

The LLM must support **tool calling** (function calling). Recommended models:

| Provider | Model | Notes |
|----------|-------|-------|
| OpenAI | `gpt-4o` | Best general-purpose, fast |
| OpenAI | `gpt-4-turbo` | Strong reasoning |
| Anthropic | `claude-sonnet-4-20250514` | Excellent tool use |
| Anthropic | `claude-opus-4-20250514` | Most capable |

---

## Step 7 — Run the Agent with a User Query

Putting it all together — a complete runnable script:

```python
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from langchain_mcp_adapters.tools import load_mcp_tools
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI

async def main():
    # 1. Configure the LLM
    model = ChatOpenAI(model="gpt-4o", temperature=0)

    # 2. Configure the MCP server
    server_params = StdioServerParameters(
        command="python",
        args=["c:/Siva/projects/JiraMCP/server.py"],
    )

    # 3. Connect and load tools
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await load_mcp_tools(session)

            # 4. Create the agent
            agent = create_react_agent(model, tools)

            # 5. Run a query
            result = await agent.ainvoke({
                "messages": [
                    ("user", "List all issues in the RFP project")
                ]
            })

            # 6. Print the final answer
            final_message = result["messages"][-1]
            print(final_message.content)

asyncio.run(main())
```

**What happens when this runs:**

1. Python launches `server.py` as a subprocess
2. MCP handshake completes — 34 tools discovered
3. The LLM receives the user query + tool descriptions
4. The LLM decides to call `get_project_issues` with `project_key="RFP"`
5. The tool call goes through MCP -> PMTracker -> Azure backend
6. The backend returns the 3 RFP issues (RFP-1, RFP-2, RFP-3)
7. The LLM reads the results and composes a human-readable summary
8. The agent returns the final answer

---

## Step 8 — Advanced: Custom LangGraph Workflow

For more control, build a custom LangGraph workflow instead of using the prebuilt ReAct agent:

```python
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI

def build_agent(tools):
    model = ChatOpenAI(model="gpt-4o", temperature=0)
    model_with_tools = model.bind_tools(tools)

    def agent_node(state: MessagesState):
        response = model_with_tools.invoke(state["messages"])
        return {"messages": [response]}

    def should_continue(state: MessagesState):
        last = state["messages"][-1]
        if last.tool_calls:
            return "tools"
        return END

    graph = StateGraph(MessagesState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", ToolNode(tools))

    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
    graph.add_edge("tools", "agent")

    return graph.compile()
```

**When to use a custom graph:**

- You need to add pre-processing or post-processing steps
- You want to inject a system prompt with project-specific context
- You need human-in-the-loop approval before write operations (create, update, delete)
- You want to add memory (conversation history) across sessions
- You need to chain multiple agents together (e.g., a planning agent + an execution agent)

---

## Step 9 — Using a Different LLM Provider

### Anthropic (Claude)

```python
from langchain_anthropic import ChatAnthropic

model = ChatAnthropic(model="claude-sonnet-4-20250514", temperature=0)
# Everything else stays the same
agent = create_react_agent(model, tools)
```

Environment variable: `ANTHROPIC_API_KEY`

### Azure OpenAI

```python
from langchain_openai import AzureChatOpenAI

model = AzureChatOpenAI(
    azure_deployment="gpt-4o",
    api_version="2024-08-01-preview",
    temperature=0,
)
agent = create_react_agent(model, tools)
```

Environment variables: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`

### Google Gemini

```python
from langchain_google_genai import ChatGoogleGenerativeAI

model = ChatGoogleGenerativeAI(model="gemini-pro", temperature=0)
agent = create_react_agent(model, tools)
```

Environment variable: `GOOGLE_API_KEY`

**The key point:** The MCP tools are LLM-agnostic. Once converted to LangChain tools by the adapter, they work with any LangChain-supported LLM that supports tool calling.

---

## Step 10 — Deployment Considerations

### 10.1 — Subprocess Lifecycle

The PMTracker MCP server runs as a **subprocess** of your agent. This means:

- The server starts when you enter the `async with stdio_client(...)` block
- The server stops when you exit the block
- If your agent crashes, the subprocess is orphaned — use proper error handling

For long-running agents (e.g., a web service), keep the MCP session alive for the lifetime of the service, not per-request.

### 10.2 — Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PMTRACKER_API_URL` | `https://pmtracker-app-xxx.azurewebsites.net` | Azure backend URL |
| `PMTRACKER_INTERNAL_KEY` | `pmtracker-mcp-internal` | Service-to-service auth key |

Pass these via the `env` parameter in `StdioServerParameters` if the defaults don't apply.

### 10.3 — Concurrency

- The MCP stdio transport is **single-session** — one client per subprocess
- If you need multiple concurrent agent sessions, launch **separate PMTracker subprocesses** for each
- The Azure backend handles concurrent HTTP requests from multiple MCP server instances

### 10.4 — Error Handling

PMTracker tools raise `ValueError` with descriptive messages when things go wrong (e.g., issue not found, invalid project key). The MCP SDK surfaces these as tool errors, which the LangChain adapter converts into `ToolMessage` objects with error content. The LLM then sees the error and can:

- Retry with different parameters
- Ask the user for clarification
- Report the error gracefully

### 10.5 — Security

- The `X-Internal-Key` header provides basic service-to-service authentication
- For production deployments, consider:
  - Rotating the internal key
  - Restricting network access to the Azure backend (IP whitelisting, VNet)
  - Using Azure Managed Identity instead of a static key
  - Adding rate limiting

---

## Troubleshooting

### "Connection refused" or "subprocess failed to start"

- Verify Python is in your PATH: `python --version`
- Verify the path to `server.py` is correct and absolute
- Verify PMTracker dependencies are installed: `pip install -e .` in the repo root
- Check that the `mcp` package is installed: `pip show mcp`

### "API error 401: Unauthorized"

- The `X-Internal-Key` header value doesn't match the backend's expected value
- Check the `PMTRACKER_INTERNAL_KEY` environment variable on both sides

### "API error 404" or empty results

- The Azure backend may not have data for the requested project/issue
- Verify the backend is running: visit `https://pmtracker-app-xxx.azurewebsites.net/api/health`

### Tools not appearing in the agent

- Ensure `await session.initialize()` completes without error
- Check that `load_mcp_tools(session)` returns a non-empty list
- Print `[t.name for t in tools]` to verify tool discovery

### LLM not calling the right tools

- Use a stronger model (GPT-4o or Claude Sonnet) — weaker models may not reason well about 34 tools
- Add a system prompt that guides the LLM toward the right tools for common queries
- Consider exposing only a subset of tools relevant to your use case

### SSL errors

- PMTracker's `api_client.py` already disables SSL verification for corporate proxy environments
- If your agent makes direct calls to the Azure backend (bypassing MCP), you'll need similar SSL handling

---

## Appendix A — Full Tool Reference

All 34 tools with their parameter signatures:

### Issues
```
get_issue(issue_key: str, fields: str?, expand: str?, comment_limit: int = 10)
search(jql: str, fields: str?, start_at: int = 0, limit: int = 10)
get_project_issues(project_key: str, status: str?, issue_type: str?, start: int = 0, limit: int = 50)
create_issue(project_key: str, summary: str, issue_type: str = "Task", description: str?, priority: str?, assignee: str?, labels: str?, components: str?, sprint: str?)
batch_create_issues(project_key: str, issues_json: str)
update_issue(issue_key: str, fields: str)
delete_issue(issue_key: str)
get_issue_dates(issue_key: str)
batch_get_changelogs(issue_keys: str)
```

### Comments & Worklogs
```
add_comment(issue_key: str, body: str)
edit_comment(issue_key: str, comment_id: str, body: str)
add_worklog(issue_key: str, time_spent: str, comment: str?)
get_worklog(issue_key: str)
```

### Transitions
```
get_transitions(issue_key: str)
transition_issue(issue_key: str, transition_id: str?, transition_name: str?, comment: str?)
```

### Sprints & Boards
```
get_agile_boards(board_name: str?, project_key: str?, board_type: str?, start_at: int = 0, limit: int = 50)
get_board_issues(board_id: str, jql: str?, start_at: int = 0, limit: int = 50)
get_sprints_from_board(board_id: str, state: str?, start_at: int = 0, limit: int = 50)
get_sprint_issues(sprint_id: str, start_at: int = 0, limit: int = 50)
create_sprint(board_id: str, name: str, start_date: str?, end_date: str?, goal: str?)
update_sprint(sprint_id: str, name: str?, state: str?, start_date: str?, end_date: str?, goal: str?)
add_issues_to_sprint(sprint_id: str, issue_keys: str)
```

### Projects
```
get_all_projects(include_archived: bool = False)
get_project_versions(project_key: str)
get_project_components(project_key: str)
create_version(project_key: str, name: str, description: str?, start_date: str?, release_date: str?)
batch_create_versions(project_key: str, versions_json: str)
```

### Linking
```
get_link_types(name_filter: str?)
link_to_epic(issue_key: str, epic_key: str)
create_issue_link(source_key: str, link_type: str, target_key: str)
create_remote_issue_link(issue_key: str, url: str, title: str)
remove_issue_link(link_id: str)
```

### Users
```
get_user_profile(account_id: str?, email_address: str?, display_name: str?)
get_issue_watchers(issue_key: str)
add_watcher(issue_key: str, user_identifier: str)
remove_watcher(issue_key: str, username: str?, account_id: str?)
```

### Fields
```
search_fields(keyword: str, limit: int = 20)
get_field_options(field_id: str)
```

### Attachments (simulated)
```
download_attachments(issue_key: str)
get_issue_images(issue_key: str)
```

---

## Appendix B — Example Prompts and Expected Behavior

These are natural language queries you can send to the LangChain agent and what tools the LLM should invoke:

| User Query | Expected Tool Calls |
|------------|-------------------|
| "List all projects" | `get_all_projects()` |
| "Show me all issues in the RFP project" | `get_project_issues(project_key="RFP")` |
| "Get details of issue RFP-1" | `get_issue(issue_key="RFP-1")` |
| "Create a bug in RFP: Login fails on mobile" | `create_issue(project_key="RFP", summary="Login fails on mobile", issue_type="Bug")` |
| "Move RFP-1 to In Progress" | `get_transitions(issue_key="RFP-1")` then `transition_issue(issue_key="RFP-1", transition_name="In Progress")` |
| "Add a comment to RFP-2: Needs review" | `add_comment(issue_key="RFP-2", body="Needs review")` |
| "What sprints are on the RFP board?" | `get_agile_boards(project_key="RFP")` then `get_sprints_from_board(board_id="...")` |
| "Log 2 hours on RFP-1" | `add_worklog(issue_key="RFP-1", time_spent="2h")` |
| "Who is watching RFP-3?" | `get_issue_watchers(issue_key="RFP-3")` |
| "Search for all bugs in To Do status" | `search(jql="issuetype = Bug AND status = \"To Do\"")` |

---

## Summary

| Step | Action |
|------|--------|
| 1 | Install `langchain-mcp-adapters`, `langgraph`, and your LLM provider package |
| 2 | Configure `StdioServerParameters` pointing to PMTracker's `server.py` |
| 3 | Use `stdio_client` + `ClientSession` to connect and `load_mcp_tools()` to convert tools |
| 4 | Pass the tools to `create_react_agent()` with your chosen LLM |
| 5 | Call `agent.ainvoke()` with user messages — the LLM handles tool selection automatically |

No changes to the PMTracker codebase are required. The MCP protocol handles discovery, schema exchange, and invocation transparently.

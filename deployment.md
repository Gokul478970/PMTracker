# PMTracker MCP — Agent Integration & Deployment Guide

This guide covers how to connect an LLM-based agent to the PMTracker MCP server.
Two options are provided: **Local Demo** (quick, no infrastructure) and **Production** (persistent, scalable).

---

## How It Works (Conceptual)

```
Your Agent Code
     │
     ▼
  LLM (Claude API)
     │  ← sends tool_use blocks
     ▼
Your Agent Code (tool dispatcher)
     │  ← calls MCP tool
     ▼
PMTracker MCP Server
     │  ← reads/writes JSON store
     ▼
  Response → back to LLM → final answer
```

The LLM never calls the MCP server directly. Your agent:
1. Sends a prompt + tool definitions to the LLM
2. LLM responds with a `tool_use` block (which tool to call, with what args)
3. Your agent executes the tool via the MCP client
4. Your agent sends the tool result back to the LLM
5. LLM produces the final answer

---

## Option A — Local Demo (stdio transport)

Best for: development, testing, running on your own machine.

### How it works
- Your agent spawns `python server.py` as a child process
- Communication happens over **stdin/stdout** (stdio)
- Server lives only as long as your agent process lives
- No ports, no network, no authentication needed

---

### Step 1 — Prerequisites

- Python 3.11+ installed
- PMTracker installed: `pip install -e .` from the `JiraMCP/` directory
- The `mcp` Python SDK installed: `pip install mcp`
- An Anthropic API key (set as `ANTHROPIC_API_KEY` environment variable)

Verify installation:
```
python server.py
```
It should hang (waiting for MCP input over stdio) — that means it's working. Press Ctrl+C to exit.

---

### Step 2 — Install the MCP Python client

The official MCP SDK ships with both server AND client support.

```
pip install mcp
```

---

### Step 3 — Understand the connection pattern

To use stdio transport from your agent code:

- Use `mcp.client.stdio.stdio_client()` context manager
- Pass it a `StdioServerParameters` object pointing to `python server.py`
- This gives you a `ClientSession` — use it to call `list_tools()` and `call_tool()`
- Wrap tool results and send them back to the Claude API as `tool_result` blocks

---

### Step 4 — Get the tool definitions

Before calling the LLM, you need the tool schemas. The MCP client's `list_tools()` returns all 40 tool definitions in MCP format. You convert these to Anthropic API format:

- MCP `inputSchema` → Anthropic `input_schema`
- MCP `name` → Anthropic `name`
- MCP `description` → Anthropic `description`

Pass the converted list as the `tools` parameter in your `client.messages.create()` call.

---

### Step 5 — The agent loop

Your agent must implement a loop:

1. Send messages + tools to Claude API
2. If response `stop_reason == "tool_use"` → extract tool name + input
3. Call `session.call_tool(name, arguments)` on the MCP client
4. Append the `tool_result` to messages
5. Send again to Claude API
6. If response `stop_reason == "end_turn"` → done, return final text

Repeat until `end_turn` or max iterations reached.

---

### Step 6 — Run your agent

Set your API key:
```
export ANTHROPIC_API_KEY=sk-ant-...   # Linux/Mac
set ANTHROPIC_API_KEY=sk-ant-...      # Windows
```

Run your agent script:
```
python my_agent.py
```

The agent will:
- Spawn `python server.py` as a child process automatically
- List all 40 pmtracker tools
- Pass them to Claude
- Execute tool calls as Claude requests them
- Return the final answer

---

### Step 7 — Test with a simple prompt

Try prompts like:
- `"List all projects"`
- `"Show me all In Progress issues in ECOM"`
- `"Create a new bug in MOB called 'Login crash on iOS'"`
- `"What sprint is ECOM-3 in?"`

---

### Limitations of Local Demo
- Server restarts every time your agent script runs (cold start each time)
- Not accessible from other machines or services
- No authentication, logging, or monitoring
- Not suitable for concurrent requests from multiple agents

---

---

## Option B — Production (SSE/HTTP transport)

Best for: cloud deployments, multiple agents, always-on service, team use.

### How it works
- PMTracker MCP server runs as a **persistent HTTP service** using SSE (Server-Sent Events) transport
- Your agent connects over HTTP — no subprocess spawning
- Server runs independently of your agent process
- Multiple agents can connect simultaneously
- Can be deployed on any server, container, or cloud VM

---

### Step 1 — Switch server.py to SSE transport

The MCP Python SDK supports SSE transport via `mcp.server.sse.SseServerTransport`.

You will need to modify `server.py` to:
- Accept HTTP connections on a configurable port (default: `8000`)
- Use `SseServerTransport` instead of `stdio_server`
- Optionally accept a `--port` argument
- Add a `/sse` endpoint for MCP communication
- Add a `/messages` endpoint for client-to-server messages

This requires the `starlette` and `uvicorn` packages in addition to `mcp`.

Install additional dependencies:
```
pip install starlette uvicorn
```

---

### Step 2 — Process management

For production, the server must run continuously and restart on failure.

**Option B1 — systemd (Linux)**

Create a systemd service unit file at `/etc/systemd/system/pmtracker.service`:
- Set `ExecStart` to your Python executable and `server.py` path
- Set `WorkingDirectory` to the `JiraMCP/` directory
- Set `Restart=always` and `RestartSec=5`
- Set environment variables (e.g., `PORT=8000`)

Enable and start:
```
sudo systemctl enable pmtracker
sudo systemctl start pmtracker
sudo systemctl status pmtracker
```

**Option B2 — Docker**

Create a `Dockerfile`:
- Base image: `python:3.11-slim`
- Copy project files
- Run `pip install -e .` and `pip install starlette uvicorn`
- Expose port `8000`
- `CMD ["python", "server.py", "--port", "8000"]`

Build and run:
```
docker build -t pmtracker .
docker run -d -p 8000:8000 --name pmtracker pmtracker
```

For persistence across container restarts, mount the `pmtracker/store/data/` directory as a Docker volume:
```
docker run -d -p 8000:8000 -v /host/data:/app/pmtracker/store/data pmtracker
```

**Option B3 — Cloud (Railway / Render / Fly.io)**

These platforms auto-detect a `Dockerfile` or `pyproject.toml` and deploy with zero config.
- Set start command to: `python server.py --port $PORT`
- Set the `PORT` environment variable on the platform dashboard
- Enable persistent disk/volume for the `store/data/` directory

---

### Step 3 — Networking & security

In production, do not expose the MCP server directly to the internet without protection.

Add the following in front of the server:

1. **Reverse proxy** (nginx or Caddy):
   - Terminate TLS (HTTPS)
   - Forward `/sse` and `/messages` to `localhost:8000`
   - Add HTTP Basic Auth or API key header validation

2. **API key authentication**:
   - Validate an `Authorization: Bearer <token>` header in the server's HTTP middleware
   - Reject unauthenticated requests with `401`

3. **Firewall**:
   - Block direct access to port `8000`
   - Only allow traffic through the reverse proxy on port `443`

---

### Step 4 — Connect your agent via HTTP

Instead of `StdioServerParameters`, use `mcp.client.sse.sse_client()`:
- Pass the SSE endpoint URL: `http://your-server:8000/sse`
- Optionally pass headers (e.g., `Authorization: Bearer <token>`)
- The rest of the agent loop is identical to Option A

Your agent no longer needs to spawn any subprocess — it just connects to the URL.

---

### Step 5 — Health checks & monitoring

Add a `/health` HTTP endpoint to `server.py` that returns `{"status": "ok"}`.

Use this for:
- **Load balancer health checks** (AWS ALB, GCP Load Balancer)
- **Uptime monitoring** (UptimeRobot, Betterstack)
- **Container orchestration** (Docker health checks, Kubernetes liveness probes)

---

### Step 6 — Data persistence

The JSON store (`pmtracker/store/data/*.json`) is the source of truth.

In production:
- **Mount a persistent volume** so data survives container restarts
- **Back up the `data/` directory** regularly (cron job or cloud storage sync)
- **Consider replacing JSON files with SQLite** for concurrent write safety if multiple agents write simultaneously — the current JSON implementation is not safe for concurrent writes

---

### Step 7 — Logging

Add structured logging to `server.py`:
- Log every tool call with timestamp, tool name, args summary, and response time
- Log errors with full stack traces
- Ship logs to a log aggregator (Datadog, Grafana Loki, CloudWatch)

---

### Step 8 — Scaling

The current architecture is single-instance (one server process, file-based storage). For scale:

- **Horizontal scaling is NOT supported** with the current JSON store (file locks conflict)
- To scale horizontally: replace `json_store.py` with a shared database (PostgreSQL, Redis)
- Behind a load balancer, use **sticky sessions** (route each agent to the same instance) as a short-term workaround

---

## Summary

| Aspect | Option A (Local Demo) | Option B (Production) |
|--------|----------------------|----------------------|
| Transport | stdio (subprocess) | SSE over HTTP |
| Server lifetime | Per agent run | Always-on |
| Setup complexity | Low | Medium–High |
| Multi-agent support | No | Yes |
| Auth & security | None needed | Required |
| Data persistence | Local files | Mounted volume / DB |
| Deployable to cloud | No | Yes |
| Good for | Dev & testing | Real deployments |

---

## Quick Reference — Key Concepts

- **stdio transport**: Server is a child process. Your agent owns its lifecycle.
- **SSE transport**: Server is a standalone HTTP service. Your agent connects to it.
- **Tool discovery**: Call `session.list_tools()` to get all 40 tool schemas dynamically.
- **Tool dispatch**: Call `session.call_tool(name, args)` and pass the result back to the LLM.
- **Agent loop**: Repeat LLM call → tool execution → LLM call until `stop_reason == "end_turn"`.
- **No hardcoding**: Always use `list_tools()` to get definitions — never hardcode tool schemas in your agent.

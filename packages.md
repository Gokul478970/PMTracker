# PMTracker — Package Requirements

> All packages required for the full implementation of PMTracker.
> Design rule: minimal external dependencies — only what is strictly necessary.

---

## Python Version

| Requirement | Value |
|-------------|-------|
| Minimum | **Python 3.11** |
| Reason | Union type syntax (`dict | list`), `tomllib` in stdlib, modern `asyncio` |

---

## 1. Runtime Dependencies

Packages needed to **run** the MCP server in production.

| Package | Version | PyPI Name | Purpose |
|---------|---------|-----------|---------|
| `mcp` | `>=1.0.0` | [`mcp`](https://pypi.org/project/mcp/) | Official Anthropic MCP Python SDK — provides `Server`, `stdio_server`, and the `@app.tool()` decorator |

**That's it.** The entire server runs on a single external package.

### What `mcp` pulls in automatically (transitive deps — no action needed)

| Package | Role |
|---------|------|
| `anyio` | Async I/O primitives used internally by the MCP SDK |
| `pydantic` | Used internally by MCP for message schema validation |
| `httpx` | HTTP client used by the MCP SDK internals |
| `starlette` | Used by MCP for SSE transport (installed but unused in stdio mode) |
| `click` | CLI utilities used by MCP SDK internals |

> You do not install or import any of these directly. They arrive as dependencies of `mcp`.

---

## 2. Development & Testing Dependencies

Packages needed only during **development and testing** (not required at runtime).

| Package | Version | PyPI Name | Purpose |
|---------|---------|-----------|---------|
| `pytest` | `>=8.0` | [`pytest`](https://pypi.org/project/pytest/) | Test runner — used in Group 10 to run `tests/test_tools.py` |
| `pytest-asyncio` | `>=0.23` | [`pytest-asyncio`](https://pypi.org/project/pytest-asyncio/) | Enables `async def` test functions — needed because MCP tool handlers are `async` |

---

## 3. Standard Library Modules Used

These are part of Python itself — **no installation needed**.

| Module | Used In | Purpose |
|--------|---------|---------|
| `json` | `json_store.py` | `json.load()` / `json.dump()` for all file I/O |
| `asyncio` | `server.py` (root) | `asyncio.run()` to start the async MCP server |
| `uuid` | `comments.py`, `linking.py` | `uuid4()` to generate comment IDs, link IDs, worklog IDs |
| `re` | `issues.py` (JQL parser) | Regex matching for JQL clause parsing |
| `datetime` | `issues.py`, `comments.py`, `transitions.py`, `sprints.py` | UTC timestamps for `created`, `updated`, `started` fields |
| `pathlib` | `json_store.py` | `Path(__file__).parent` to resolve `store/data/` directory path |
| `os` | `json_store.py` (optional) | Fallback path resolution if `pathlib` is insufficient |

---

## 4. Installation Commands

### Install runtime (production):
```bash
pip install mcp
```

### Install in editable mode (recommended during development):
```bash
pip install -e .
```

### Install with dev/test tools:
```bash
pip install -e ".[dev]"
```

> For the `[dev]` extra to work, add the following to `pyproject.toml`:
> ```toml
> [project.optional-dependencies]
> dev = ["pytest>=8.0", "pytest-asyncio>=0.23"]
> ```

### Or install dev tools separately:
```bash
pip install pytest pytest-asyncio
```

---

## 5. Full `requirements.txt` (runtime only)

```
mcp>=1.0.0
```

## 6. Full `requirements-dev.txt` (development + testing)

```
mcp>=1.0.0
pytest>=8.0
pytest-asyncio>=0.23
```

---

## 7. `pyproject.toml` — Complete Dependencies Block

```toml
[project]
name = "pmtracker"
version = "0.1.0"
description = "Jira MCP Server Simulator"
requires-python = ">=3.11"
dependencies = [
    "mcp>=1.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
]

[project.scripts]
pmtracker = "server:main"
```

---

## 8. What Is Intentionally NOT Used

| Package | Why excluded |
|---------|-------------|
| `pydantic` (directly) | No schema validation layer needed — plain dicts are sufficient |
| `aiofiles` | All file I/O is synchronous by design (`json.load`/`json.dump`) |
| `fastapi` | Not needed — stdio transport, not HTTP |
| `uvicorn` | Not needed — stdio transport, not HTTP |
| `requests` / `httpx` (directly) | No outbound HTTP calls — this is a local simulator |
| `sqlalchemy` / `sqlite3` | Storage is JSON files, not a database |
| `black` / `ruff` / `mypy` | Optional linting/formatting tools — not required, user's preference |

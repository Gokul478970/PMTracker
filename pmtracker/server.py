import hashlib
import os

from mcp.server.fastmcp import FastMCP
from pmtracker.tools import register_all_tools
from pmtracker.store import json_store

mcp = FastMCP(
    "pmtracker",
    host=os.environ.get("MCP_HTTP_HOST", "0.0.0.0"),
    port=int(os.environ.get("MCP_HTTP_PORT", "8080")),
    stateless_http=True,
)
register_all_tools(mcp)


async def run():
    """Run stdio transport (for local agents like Claude Code)."""
    await mcp.run_stdio_async()


async def run_http():
    """Run Streamable HTTP transport (for remote agents).

    Wraps the FastMCP Starlette app with lightweight middleware that
    validates the X-Agent-Key header against stored agent keys.
    """
    import uvicorn
    from starlette.applications import Starlette
    from starlette.requests import Request as StarletteRequest
    from starlette.responses import JSONResponse as StarletteJSON
    from starlette.routing import Mount

    inner_app = mcp.streamable_http_app()

    async def agent_key_middleware(request: StarletteRequest, call_next):
        # Only protect the MCP endpoint path
        if request.url.path.startswith("/mcp"):
            agent_key = request.headers.get("x-agent-key", "")
            if not agent_key:
                return StarletteJSON(
                    {"detail": "Missing X-Agent-Key header"},
                    status_code=401,
                )
            key_hash = hashlib.sha256(agent_key.encode()).hexdigest()
            keys = json_store.get_agent_keys()
            agent = next(
                (k for k in keys if k["key_hash"] == key_hash and k.get("active", True)),
                None,
            )
            if not agent:
                return StarletteJSON(
                    {"detail": "Invalid or revoked agent key"},
                    status_code=401,
                )
        return await call_next(request)

    # Wrap with Starlette middleware
    from starlette.middleware import Middleware
    from starlette.middleware.base import BaseHTTPMiddleware

    class AgentKeyAuth(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            return await agent_key_middleware(request, call_next)

    app = Starlette(
        routes=[Mount("/", app=inner_app)],
        middleware=[Middleware(AgentKeyAuth)],
    )

    host = os.environ.get("MCP_HTTP_HOST", "0.0.0.0")
    port = int(os.environ.get("MCP_HTTP_PORT", "8080"))
    config = uvicorn.Config(app, host=host, port=port, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()

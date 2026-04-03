import os
import sys
from pathlib import Path

# Ensure project root is on sys.path so pmtracker is importable
_project_root = str(Path(__file__).resolve().parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse

import hashlib
from datetime import datetime, timezone

from api.routes import projects, issues, comments, transitions, sprints, users, search, chat, scope, agents, assignments
from api.routes import auth
from api.routes.auth import validate_token, DEMO_EMAIL, is_demo
from pmtracker.store import json_store

app = FastAPI(title="PMTracker API", version="0.1.0")

# CORS: allow localhost for dev + any production origins from env
_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5180",
    "http://localhost:3000",
    "http://127.0.0.1:5180",
    "https://cogniteer-pmtracker-endtbufkcdbbf5fj.southindia-01.azurewebsites.net",
    "https://cogniteer-pmtracker.azurewebsites.net",
]
_extra = os.environ.get("ALLOWED_ORIGINS", "")
if _extra:
    _origins.extend([o.strip() for o in _extra.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public paths that don't require auth
_PUBLIC_PREFIXES = ("/api/auth/", "/api/health", "/api/debug/", "/docs", "/openapi.json", "/redoc")

# Internal API key for MCP server (service-to-service auth)
_INTERNAL_API_KEY = os.environ.get("PMTRACKER_INTERNAL_KEY", "pmtracker-mcp-internal")


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path

    # Skip auth for public endpoints and non-API paths
    if any(path.startswith(p) for p in _PUBLIC_PREFIXES) or not path.startswith("/api/"):
        return await call_next(request)

    # Check for internal API key (MCP server calls)
    internal_key = request.headers.get("X-Internal-Key", "")
    if internal_key and internal_key == _INTERNAL_API_KEY:
        request.state.user_email = "mcp-internal@system"
        return await call_next(request)

    # Check for agent API key (remote agent calls)
    agent_key = request.headers.get("X-Agent-Key", "")
    if agent_key:
        key_hash = hashlib.sha256(agent_key.encode()).hexdigest()
        keys = json_store.get_agent_keys()
        agent = next((k for k in keys if k["key_hash"] == key_hash and k.get("active", True)), None)
        if not agent:
            return JSONResponse(status_code=401, content={"detail": "Invalid or revoked agent key"})
        request.state.user_email = f"agent:{agent['agent_name']}"
        agent["last_used"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        json_store.save_agent_keys(keys)
        return await call_next(request)

    # Check Authorization header
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

    token = auth_header[7:]
    session = validate_token(token)
    if not session:
        return JSONResponse(status_code=401, content={"detail": "Invalid or expired token"})

    request.state.user_email = session.get("email", "")

    # Demo mode: block all write operations
    if is_demo(request.state.user_email) and request.method in ("POST", "PUT", "DELETE", "PATCH"):
        if not path.startswith("/api/auth/logout"):
            return JSONResponse(status_code=403, content={"detail": "Demo mode is read-only"})

    return await call_next(request)


app.include_router(auth.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(issues.router, prefix="/api")
app.include_router(comments.router, prefix="/api")
app.include_router(transitions.router, prefix="/api")
app.include_router(sprints.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(scope.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(assignments.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/debug/paths")
def debug_paths():
    """Temporary debug endpoint — remove after deployment is stable."""
    _d = Path(__file__).resolve().parent.parent / "ui" / "dist"
    cwd = os.getcwd()
    cwd_dist = Path(cwd) / "ui" / "dist"
    dist_contents = os.listdir(str(_d)) if _d.exists() else []
    mount_routes = [{"path": r.path, "name": getattr(r, "name", "")} for r in app.routes if hasattr(r, "app")]
    return {
        "file": str(Path(__file__).resolve()),
        "project_root": _project_root,
        "dist_path": str(_d),
        "dist_exists": _d.exists(),
        "dist_contents": dist_contents,
        "cwd": cwd,
        "cwd_dist_exists": cwd_dist.exists(),
        "mounted_apps": mount_routes,
        "total_routes": len(app.routes),
    }


# Serve frontend via catch-all route (more reliable than StaticFiles mount on Azure)
_dist = Path(__file__).resolve().parent.parent / "ui" / "dist"
if not _dist.exists():
    _dist = Path(os.getcwd()) / "ui" / "dist"


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    if not _dist.exists():
        return JSONResponse({"detail": "Frontend not built"}, status_code=404)
    # Try to serve the exact file (e.g. /assets/index-xxx.js)
    file_path = _dist / full_path
    if file_path.exists() and file_path.is_file():
        return FileResponse(file_path)
    # For all other paths, serve index.html (SPA routing)
    index = _dist / "index.html"
    if index.exists():
        return FileResponse(index)
    return JSONResponse({"detail": "Not Found"}, status_code=404)

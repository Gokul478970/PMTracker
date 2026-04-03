import asyncio
import os
import sys
from pmtracker.server import run, run_http

# Wrap FastAPI (ASGI) as WSGI so gunicorn's default sync worker works.
# Azure App Service auto-detects "server:app" and runs gunicorn with sync workers.
from a2wsgi import ASGIMiddleware
from api.main import app as asgi_app

app = ASGIMiddleware(asgi_app)


def main():
    mode = os.environ.get("MCP_TRANSPORT", "stdio")
    if "--http" in sys.argv or mode == "http":
        asyncio.run(run_http())
    else:
        asyncio.run(run())


if __name__ == "__main__":
    main()

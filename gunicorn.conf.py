"""Gunicorn config — auto-loaded by gunicorn when present in the app directory."""

# Use UvicornWorker for ASGI (FastAPI) support
worker_class = "uvicorn.workers.UvicornWorker"

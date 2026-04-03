#!/bin/bash
# Azure App Service startup script for PMTracker

set -e
cd /home/site/wwwroot

# Build frontend if ui/ folder exists and dist/ doesn't
if [ -d "ui" ] && [ ! -d "ui/dist" ]; then
    cd ui
    npm install --production=false
    npm run build
    cd ..
fi

# Start the backend with gunicorn + uvicorn workers
PORT=${PORT:-8000}
exec gunicorn api.main:app -k uvicorn.workers.UvicornWorker --bind "0.0.0.0:$PORT" --timeout 120

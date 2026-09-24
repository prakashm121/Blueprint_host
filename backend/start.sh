#!/bin/bash

echo "Starting FastAPI..."
uvicorn main:app --host 0.0.0.0 --port "$PORT" &
API_PID=$!

echo "Starting Celery Worker..."
celery -A app.workers.celery_app worker --loglevel=info --pool=solo --without-gossip --without-mingle --without-heartbeat &
WORKER_PID=$!

echo "FastAPI PID: $API_PID"
echo "Worker PID: $WORKER_PID"

# No Celery Beat: the planner-reminder scan is triggered externally via
# GitHub Actions hitting POST /api/v1/internal/scan-planner-reminders.
trap "kill $API_PID $WORKER_PID" SIGTERM SIGINT

wait

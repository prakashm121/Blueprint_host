#!/bin/bash

echo "Starting FastAPI..."
uvicorn app.main:app --host 0.0.0.0 --port "$PORT" &
API_PID=$!

echo "Starting Celery Worker..."
celery -A app.workers.celery_app worker --loglevel=info &
WORKER_PID=$!

echo "Starting Celery Beat..."
celery -A app.workers.celery_app beat --loglevel=info &
BEAT_PID=$!

echo "FastAPI PID: $API_PID"
echo "Worker PID: $WORKER_PID"
echo "Beat PID: $BEAT_PID"

wait
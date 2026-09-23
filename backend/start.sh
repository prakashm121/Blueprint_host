#!/bin/bash
set -e

uvicorn app.main:app --host 0.0.0.0 --port "$PORT" &
API_PID=$!

celery -A app.workers.celery_app worker --loglevel=info &
WORKER_PID=$!

celery -A app.workers.celery_app beat --loglevel=info &
BEAT_PID=$!

trap "kill $API_PID $WORKER_PID $BEAT_PID" SIGTERM SIGINT

wait -n $API_PID $WORKER_PID $BEAT_PID

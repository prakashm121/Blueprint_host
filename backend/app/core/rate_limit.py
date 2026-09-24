"""
rate_limit.py — Rate limiting helpers.

Three tools, chosen to keep Redis usage (Upstash free tier: 500K commands/month) near zero:

* hit_window()   — in-memory fixed window. For short burst limits and the global per-IP flood guard.
                   Per-process, which is exact here because the API runs as a single instance.
* hit_daily()    — per-day counter (resets at IST midnight). Redis when available, in-memory fallback.
                   Used for AI features that have no database row to count.
* DB counts      — mentor messages and resume analyses are already stored, so their daily/session
                   quotas are counted straight from the tables (authoritative, survives restarts).
"""
import json
import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.core import cache
from app.core.config import settings

logger = logging.getLogger("placementos.rate_limit")

IST = ZoneInfo("Asia/Kolkata")

_lock = threading.Lock()
_windows: dict[str, tuple[int, float]] = {}   # key -> (count, window_end_monotonic)
_MAX_TRACKED_KEYS = 20_000


def ist_day_start_utc() -> datetime:
    """Start of the current IST calendar day, as an aware UTC datetime (for DB comparisons)."""
    now_ist = datetime.now(IST)
    return now_ist.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


def seconds_until_ist_midnight() -> int:
    now_ist = datetime.now(IST)
    midnight = (now_ist + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(int((midnight - now_ist).total_seconds()), 1)


def too_many_requests(detail: str, retry_after: int) -> HTTPException:
    return HTTPException(
        status_code=429,
        detail=detail,
        headers={"Retry-After": str(max(int(retry_after), 1))},
    )


def hit_window(key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
    """Count one hit in an in-memory fixed window. Returns (allowed, retry_after_seconds)."""
    now = time.monotonic()
    with _lock:
        if len(_windows) > _MAX_TRACKED_KEYS:
            for stale in [k for k, (_, end) in _windows.items() if end <= now]:
                del _windows[stale]
            if len(_windows) > _MAX_TRACKED_KEYS:
                _windows.clear()

        count, end = _windows.get(key, (0, 0.0))
        if end <= now:
            count, end = 0, now + window_seconds
        count += 1
        _windows[key] = (count, end)
        return count <= limit, int(end - now) + 1


def enforce_window(bucket: str, subject, limit: int, window_seconds: int, message: str) -> None:
    """Raise 429 if `subject` exceeded `limit` hits per `window_seconds` for `bucket`."""
    allowed, retry_after = hit_window(f"{bucket}:{subject}", limit, window_seconds)
    if not allowed:
        raise too_many_requests(message, retry_after)


def hit_daily(bucket: str, subject, limit: int) -> tuple[bool, int]:
    """Count one hit against a per-day quota (resets at IST midnight). Returns (allowed, retry_after)."""
    day = datetime.now(IST).strftime("%Y%m%d")
    key = f"rl:{bucket}:{subject}:{day}"
    retry_after = seconds_until_ist_midnight()

    client = cache.redis_client
    if client:
        try:
            count = client.incr(key)
            if count == 1:
                client.expire(key, retry_after + 60)
            return count <= limit, retry_after
        except Exception as exc:
            logger.warning("Redis unavailable for daily quota, using in-memory fallback: %s", exc)

    return hit_window(key, limit, retry_after)


def enforce_daily(bucket: str, subject, limit: int, message: str) -> None:
    """Raise 429 if `subject` exceeded `limit` uses per IST day for `bucket`."""
    allowed, retry_after = hit_daily(bucket, subject, limit)
    if not allowed:
        raise too_many_requests(message, retry_after)


class RateLimitMiddleware:
    """
    Pure-ASGI flood guard: at most `limit` requests per `window_seconds` per client IP.
    Pure ASGI (not BaseHTTPMiddleware) so SSE streaming responses are untouched.
    Register it BEFORE CORSMiddleware so its 429 responses still get CORS headers.
    """

    def __init__(self, app, limit: int, window_seconds: int = 60, exempt_paths: tuple[str, ...] = ()):
        self.app = app
        self.limit = limit
        self.window_seconds = window_seconds
        self.exempt_paths = exempt_paths

    async def __call__(self, scope, receive, send):
        if (
            self.limit <= 0
            or scope["type"] != "http"
            or scope["method"] == "OPTIONS"
            or scope["path"] in self.exempt_paths
        ):
            await self.app(scope, receive, send)
            return

        client = scope.get("client")
        ip = client[0] if client else "unknown"
        allowed, retry_after = hit_window(f"ip:{ip}", self.limit, self.window_seconds)
        if allowed:
            await self.app(scope, receive, send)
            return

        body = json.dumps({"detail": "Too many requests. Please slow down."}).encode()
        await send({
            "type": "http.response.start",
            "status": 429,
            "headers": [
                (b"content-type", b"application/json"),
                (b"retry-after", str(retry_after).encode()),
                (b"content-length", str(len(body)).encode()),
            ],
        })
        await send({"type": "http.response.body", "body": body})

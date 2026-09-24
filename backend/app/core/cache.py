"""
cache.py — Thin caching wrapper.
Uses Redis when available, falls back to an in-process dict for dev environments.
"""
import json
import time
import redis
from typing import Any
from app.core.config import settings

# Try connecting to Redis; silently fall back to memory cache if unavailable.
redis_client = None
if settings.REDIS_URL:
    try:
        kwargs = {"decode_responses": True}
        if settings.REDIS_URL.startswith("rediss://"):
            kwargs["ssl_cert_reqs"] = "required"
        redis_client = redis.Redis.from_url(settings.REDIS_URL, **kwargs)
        redis_client.ping()
    except Exception as e:
        print(f"Warning: Redis connection failed: {e}")
        redis_client = None

# In-process fallback cache: {key: (value, expiry_timestamp)}
_memory_cache: dict = {}


def get_cache(key: str) -> Any:
    if not redis_client:
        entry = _memory_cache.get(key)
        if entry:
            val, expiry = entry
            if time.time() < expiry:
                return val
            del _memory_cache[key]
        return None

    try:
        data = redis_client.get(key)
        return json.loads(data) if data else None
    except Exception:
        return None


def set_cache(key: str, value: Any, ttl_seconds: int = 300):
    if not redis_client:
        _memory_cache[key] = (value, time.time() + ttl_seconds)
        return

    try:
        redis_client.setex(key, ttl_seconds, json.dumps(value) if isinstance(value, (dict, list)) else value)
    except Exception:
        pass


def delete_cache(key: str):
    if not redis_client:
        _memory_cache.pop(key, None)
        return

    try:
        redis_client.delete(key)
    except Exception:
        pass

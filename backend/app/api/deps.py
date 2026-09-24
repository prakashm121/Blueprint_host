import hashlib
import logging
import threading
import time

import requests
from fastapi import Depends, HTTPException, status, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.user import User

logger = logging.getLogger("placementos.auth")

security = HTTPBearer(auto_error=False)

# Verified-token cache: short TTL so sign-out / revocation / bans in Supabase take effect quickly.
_TOKEN_CACHE_TTL_SECONDS = 60
_TOKEN_CACHE_MAX_ENTRIES = 1000
_token_cache: dict[str, tuple[float, dict]] = {}
_token_cache_lock = threading.Lock()


def verify_supabase_token_with_api(token: str) -> dict:
    """
    Verifies a Supabase JWT (including ES256 asymmetric ones) by calling the Supabase Auth API.
    Successful results are cached for a short TTL, keyed by a hash of the token.
    """
    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.monotonic()

    with _token_cache_lock:
        cached = _token_cache.get(key)
        if cached and cached[0] > now:
            return cached[1]

    resp = requests.get(
        f"{settings.SUPABASE_URL}/auth/v1/user",
        headers={
            "apikey": settings.SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
        },
        timeout=5,
    )
    if resp.status_code != 200:
        raise ValueError(f"Supabase rejected token (status {resp.status_code})")
    user_data = resp.json()

    with _token_cache_lock:
        if len(_token_cache) >= _TOKEN_CACHE_MAX_ENTRIES:
            for stale_key in [k for k, (exp, _) in _token_cache.items() if exp <= now]:
                del _token_cache[stale_key]
            if len(_token_cache) >= _TOKEN_CACHE_MAX_ENTRIES:
                _token_cache.clear()
        _token_cache[key] = (now + _TOKEN_CACHE_TTL_SECONDS, user_data)

    return user_data


def get_current_user(
    db: Session = Depends(get_db),
    auth_header: HTTPAuthorizationCredentials | None = Security(security),
) -> User:
    if not auth_header:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header.credentials

    try:
        user_data = verify_supabase_token_with_api(token)
    except Exception as e:
        logger.warning("Token verification failed: %s", type(e).__name__)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )

    supabase_id = user_data.get("id")
    email = user_data.get("email")
    if not supabase_id or not email:
        logger.warning("Verified token is missing id or email")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )

    user = db.query(User).filter(User.supabase_id == supabase_id).first()

    # Just-In-Time (JIT) Provisioning
    if not user:
        user = db.query(User).filter(User.email == email).first()
        if user:
            # Linking an existing local account by email is only safe for a verified email.
            if not user_data.get("email_confirmed_at"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Email address is not verified",
                )
            user.supabase_id = supabase_id
            db.commit()
        else:
            from app.models.profile import Profile
            metadata = user_data.get("user_metadata") or {}
            full_name = (metadata.get("full_name") or metadata.get("name") or "")[:120] or None
            user = User(
                supabase_id=supabase_id,
                email=email,
                full_name=full_name,
            )
            db.add(user)
            db.flush()
            profile = Profile(user_id=user.id, full_name=user.full_name)
            db.add(profile)
            db.commit()

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

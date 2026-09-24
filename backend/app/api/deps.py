from fastapi import Depends, HTTPException, status, Cookie, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt
from sqlalchemy.orm import Session
from functools import lru_cache
import requests

from app.core.config import settings
from app.db.session import get_db
from app.models.user import User

security = HTTPBearer(auto_error=False)

@lru_cache(maxsize=1000)
def verify_supabase_token_with_api(token: str) -> dict:
    """
    Verifies a Supabase JWT (especially ES256 asymmetric ones) by calling the Supabase Auth API.
    We use lru_cache so we only take the network hit once per token per application lifecycle.
    """
    headers = {
        "apikey": "sb_publishable_Rf2TcAUwPhvVSSBP6J73MQ_LzRNLoL6", # Using frontend anon key for now
        "Authorization": f"Bearer {token}"
    }
    url = f"{settings.SUPABASE_URL}/auth/v1/user"
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        raise Exception("Token verification failed at Supabase API")
    return resp.json()

def get_current_user(
    db: Session = Depends(get_db),
    sb_access_token: str | None = Cookie(default=None),
    auth_header: HTTPAuthorizationCredentials | None = Security(security)
) -> User:
    token = sb_access_token
    if not token and auth_header:
        token = auth_header.credentials
        
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        # 1. Verify token securely with Supabase API (cached)
        user_data = verify_supabase_token_with_api(token)
        supabase_id = user_data.get("id")
        email = user_data.get("email")
        
        # 2. Also decode locally to get user_metadata for JIT
        payload = jwt.get_unverified_claims(token)

        if not supabase_id or not email:
            print("Missing sub or email in payload:", payload)
            raise HTTPException(status_code=403, detail="Could not validate credentials")

    except Exception as e:
        print(f"JWT Verification Error: {e}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Could not validate credentials: {str(e)}",
        )

    user = db.query(User).filter(User.supabase_id == supabase_id).first()

    # Just-In-Time (JIT) Provisioning
    if not user:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.supabase_id = supabase_id
            db.commit()
        else:
            from app.models.profile import Profile
            user = User(
                supabase_id=supabase_id,
                email=email,
                full_name=payload.get("user_metadata", {}).get("full_name") or payload.get("name")
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


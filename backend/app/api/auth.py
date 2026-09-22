from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.models.user import User
from app.api import deps

router = APIRouter()

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str | None = None
    is_active: bool
    onboarding_step: str = "profile"
    onboarding_completed: bool = False
    supabase_id: str | None = None

    class Config:
        from_attributes = True

def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        onboarding_step=user.onboarding_step,
        onboarding_completed=user.onboarding_step == "completed",
        supabase_id=user.supabase_id
    )

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(deps.get_current_active_user)):
    return _user_response(current_user)

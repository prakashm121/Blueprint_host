import time
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.api import deps
from app.core.cache import redis_client
from app.db.session import get_db
from app.models.user import User
from app.models.mentor import MentorConversation, MentorMessage
from app.models.assessment import UserSkillAssessment
from app.services.context_builder import build_mentor_context, build_teacher_context
from app.services.mentor.classifier import resolve_conversation_state
from app.services.mentor.service import (
    generate_teacher_response_stream,
    generate_mentor_response_stream,
)


router = APIRouter()


def _update_skill_confidence(db: Session, user: User, topic: str, delta: int = 10) -> None:
    """Nudge self-rated confidence for a skill after a successful teaching session. Capped at 90."""
    if not topic:
        return
    try:
        topic_key = topic.lower().strip().replace(" ", "_")
        assessment = (
            db.query(UserSkillAssessment)
            .filter(
                UserSkillAssessment.user_id == user.id,
                UserSkillAssessment.skill_key == topic_key,
            )
            .first()
        )
        if assessment:
            assessment.self_rated_confidence = min(90, int(assessment.self_rated_confidence) + delta)
            db.commit()
    except Exception:
        pass  # Never crash the chat because of this side-effect

# ---------------------------------------------------------------------------
# Rate limiting helper
# ---------------------------------------------------------------------------

#def _check_rate_limit(user_id: int, limit: int = 15, window_seconds: int = 60):
#    """Sliding window rate limit. Raises 429 if exceeded."""
 #   if not redis_client:
 #       return  # Redis unavailable â€” skip rate limiting gracefully
#    key = f"mentor:ratelimit:{user_id}"
#    count = redis_client.incr(key)
#    if count == 1:
#        redis_client.expire(key, window_seconds)
#    if count > limit:
#        raise HTTPException(
#            status_code=429,
 #           detail="Message rate limit reached. Please wait a moment.",
#            headers={"Retry-After": str(window_seconds)},
#        )


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class CreateConversationRequest(BaseModel):
    title: Optional[str] = "New conversation"


class MessageRequest(BaseModel):
    content: str
    seed_context: Optional[dict] = None
    model_override: Optional[str] = None


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    created_at: str


class ConversationSummary(BaseModel):
    id: int
    title: str
    updated_at: str

    class Config:
        from_attributes = True


class ConversationDetail(BaseModel):
    id: int
    title: str
    messages: list[dict]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/conversations", response_model=list[ConversationSummary])
def list_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    convos = (
        db.query(MentorConversation)
        .filter(MentorConversation.user_id == current_user.id)
        .order_by(MentorConversation.updated_at.desc())
        .limit(20)
        .all()
    )
    return [
        ConversationSummary(
            id=c.id,
            title=c.title,
            updated_at=c.updated_at.isoformat() if c.updated_at else "",
        )
        for c in convos
    ]


@router.post("/conversations")
def create_conversation(
    body: CreateConversationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    convo = MentorConversation(
        user_id=current_user.id,
        title=body.title or "New conversation",
    )
    db.add(convo)
    db.commit()
    db.refresh(convo)
    return {"id": convo.id, "title": convo.title}


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    convo = db.query(MentorConversation).filter(
        MentorConversation.id == conversation_id,
        MentorConversation.user_id == current_user.id,
    ).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = (
        db.query(MentorMessage)
        .filter(MentorMessage.conversation_id == convo.id)
        .order_by(MentorMessage.created_at.asc(), MentorMessage.id.asc())
        .all()
    )
    return ConversationDetail(
        id=convo.id,
        title=convo.title,
        messages=[
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ],
    )


@router.post("/conversations/{conversation_id}/stream")
async def stream_message(
    conversation_id: int,
    body: MessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    """
    SSE streaming endpoint. Returns text/event-stream.
    Full assistant reply is persisted to DB once streaming completes.
    """
    import json as _json

    trimmed = (body.content or "").strip()
    if not trimmed:
        raise HTTPException(status_code=422, detail="Message cannot be empty")

    convo = db.query(MentorConversation).filter(
        MentorConversation.id == conversation_id,
        MentorConversation.user_id == current_user.id,
    ).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")

    history_msgs = (
        db.query(MentorMessage)
        .filter(MentorMessage.conversation_id == convo.id)
        .order_by(MentorMessage.created_at.asc(), MentorMessage.id.asc())
        .limit(20)
        .all()
    )
    history = [{"role": m.role, "content": m.content} for m in history_msgs]

    t0 = time.perf_counter()
    state = resolve_conversation_state(
        current_mode=convo.agent_mode,
        current_topic=convo.active_topic,
        message=trimmed
    )
    print(f"[Latency] Router: {time.perf_counter() - t0:.3f}s")
    convo.agent_mode = state["mode"]
    convo.active_topic = state["topic"]
    convo.current_task = state["task"]
    db.commit()

    user_msg = MentorMessage(
        conversation_id=convo.id,
        user_id=current_user.id,
        role="user",
        content=trimmed,
    )
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    async def event_generator():
        full_reply = []
        try:
            t1 = time.perf_counter()
            if convo.agent_mode == "teacher":
                teacher_ctx = build_teacher_context(db, current_user, convo.active_topic)
                print(f"[Latency] DB/Context (Teacher): {time.perf_counter() - t1:.3f}s")
                gen = generate_teacher_response_stream(
                    context=teacher_ctx,
                    topic=convo.active_topic or "General",
                    message=trimmed,
                    history=history,
                    model_override=body.model_override,
                )
            else:
                mentor_ctx = build_mentor_context(db, current_user)
                print(f"[Latency] DB/Context (Mentor): {time.perf_counter() - t1:.3f}s")
                gen = generate_mentor_response_stream(
                    context=mentor_ctx,
                    message=trimmed,
                    history=history,
                    model_override=body.model_override,
                )

            t2 = time.perf_counter()
            async for chunk in gen:
                full_reply.append(chunk)
                yield f"data: {_json.dumps({'chunk': chunk})}\n\n"
                
            print(f"[Latency] AI Generation Stream ({convo.agent_mode.capitalize()}): {time.perf_counter() - t2:.3f}s")
            print(f"[Latency] Total Stream Request Time: {time.perf_counter() - t0:.3f}s")

        except Exception as e:
            import traceback
            print(f"[Stream] event_generator ERROR: {e}")
            traceback.print_exc()
            yield f"data: {_json.dumps({'error': str(e)})}\n\n"
            return
        finally:
            if full_reply:
                reply_text = "".join(full_reply)
                assistant_msg = MentorMessage(
                    conversation_id=convo.id,
                    user_id=current_user.id,
                    role="assistant",
                    content=reply_text,
                )
                db.add(assistant_msg)
                db.commit()
                db.refresh(assistant_msg)
                yield f"data: {_json.dumps({'done': True, 'id': assistant_msg.id, 'created_at': assistant_msg.created_at.isoformat()})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Legacy endpoint (kept for backwards compat if anything still calls /message)
# ---------------------------------------------------------------------------

@router.post("/message")
async def send_message_legacy(
    body,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_active_user),
):
    raise HTTPException(
        status_code=410,
        detail="Use POST /api/v1/mentor/conversations/{id}/message instead.",
    )






from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel

from app.db.session import get_db
from app.models.vault import VaultItem, VaultItemType, VaultReferenceType
from app.models.user import User
from app.api.deps import get_current_user
from app.core.cache import get_cache, set_cache, delete_cache

router = APIRouter()

@router.get("/")
def get_vault_items(
    last_id: int = Query(0, description="Cursor for keyset pagination"),
    limit: int = Query(20, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cache_key = f"vault:{current_user.id}:list:{last_id}:{limit}"
    cached = get_cache(cache_key)
    if cached:
        return cached

    query = db.query(VaultItem).filter(
        VaultItem.user_id == current_user.id
    )
    if last_id > 0:
        query = query.filter(VaultItem.id < last_id)
        
    query = query.order_by(VaultItem.id.desc()).limit(limit).all()
    
    items = []
    for r in query:
        items.append({
            "id": r.id,
            "item_type": r.item_type,
            "reference_type": r.reference_type,
            "reference_id": r.reference_id,
            "title": r.title,
            "content": r.content,
            "created_at": r.created_at.isoformat() if r.created_at else None
        })
        
    next_cursor = items[-1]["id"] if items else None
    
    response_data = {
        "items": items,
        "next_cursor": next_cursor
    }
    
    set_cache(cache_key, response_data, 300)  # 5 mins TTL
    return response_data


@router.get("/saved-ids")
def get_saved_ids_by_type(
    reference_type: str = Query(..., description="e.g. DSA, INTERVIEW, QUIZ, NONE"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """One-shot bulk query: returns a map of { reference_id -> vault_id }
    for all BOOKMARK items of a given reference_type for the current user.
    One call per page load replaces per-card /check calls.
    """
    cache_key = f"vault:{current_user.id}:saved_ids:{reference_type}"
    cached = get_cache(cache_key)
    if cached is not None:
        return cached

    rows = db.query(VaultItem.reference_id, VaultItem.id).filter(
        VaultItem.user_id == current_user.id,
        VaultItem.reference_type == reference_type,
        VaultItem.item_type == VaultItemType.BOOKMARK,
        VaultItem.reference_id.isnot(None),
    ).all()

    result = {str(row.reference_id): row.id for row in rows}
    set_cache(cache_key, result, 120)  # 2 min TTL
    return result


class VaultItemCreate(BaseModel):
    item_type: VaultItemType
    reference_type: VaultReferenceType = VaultReferenceType.NONE
    reference_id: Optional[int] = None
    title: str
    content: Optional[str] = None


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_vault_item(
    item_in: VaultItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Dedup guard: if a BOOKMARK for the same reference already exists, return it.
    if item_in.reference_id is not None and item_in.item_type == VaultItemType.BOOKMARK:
        existing = db.query(VaultItem).filter(
            VaultItem.user_id == current_user.id,
            VaultItem.item_type == item_in.item_type,
            VaultItem.reference_type == item_in.reference_type,
            VaultItem.reference_id == item_in.reference_id,
        ).first()
        if existing:
            return {"id": existing.id, "message": "Already saved"}

    new_item = VaultItem(
        user_id=current_user.id,
        item_type=item_in.item_type,
        reference_type=item_in.reference_type,
        reference_id=item_in.reference_id,
        title=item_in.title,
        content=item_in.content
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    
    # Invalidate both caches
    delete_cache(f"vault:{current_user.id}:list:0:20")
    if item_in.reference_type:
        ref_val = item_in.reference_type.value if hasattr(item_in.reference_type, 'value') else item_in.reference_type
        delete_cache(f"vault:{current_user.id}:saved_ids:{ref_val}")
    
    return {"id": new_item.id, "message": "Item saved to vault"}


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vault_item(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(VaultItem).filter(VaultItem.id == id, VaultItem.user_id == current_user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    ref_type = item.reference_type
    db.delete(item)
    db.commit()
    
    # Invalidate both caches
    delete_cache(f"vault:{current_user.id}:list:0:20")
    if ref_type:
        ref_val = ref_type.value if hasattr(ref_type, 'value') else ref_type
        delete_cache(f"vault:{current_user.id}:saved_ids:{ref_val}")

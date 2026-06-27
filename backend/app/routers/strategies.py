from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, List
from app.services import combined_store

router = APIRouter()


class CombinedCreate(BaseModel):
    name: str
    members: List[str]
    params: Optional[Dict[str, float]] = None


class CombinedUpdate(BaseModel):
    name: Optional[str] = None
    members: Optional[List[str]] = None
    params: Optional[Dict[str, float]] = None


@router.get("/combined")
async def list_combined():
    return combined_store.list_combined()


@router.post("/combined")
async def create_combined(req: CombinedCreate):
    members = list(dict.fromkeys(req.members))  # dedupe, keep order
    if len(members) < 2:
        raise HTTPException(status_code=400, detail="Pick at least two different strategies")
    try:
        return combined_store.create_combined(req.name, members, req.params)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/combined/{combo_id}")
async def update_combined(combo_id: str, req: CombinedUpdate):
    fields = {k: v for k, v in req.dict().items() if v is not None}
    if "members" in fields:
        fields["members"] = list(dict.fromkeys(fields["members"]))
        if len(fields["members"]) < 2:
            raise HTTPException(status_code=400, detail="Pick at least two different strategies")
    if not fields:
        raise HTTPException(status_code=400, detail="Nothing to update")
    try:
        return combined_store.update_combined(combo_id, fields)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/combined/{combo_id}")
async def delete_combined(combo_id: str):
    try:
        combined_store.delete_combined(combo_id)
        return {"deleted": combo_id}
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

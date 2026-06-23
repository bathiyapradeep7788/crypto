from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict
from app.services import combined_store

router = APIRouter()


class CombinedCreate(BaseModel):
    name: str
    strategy_a: str
    strategy_b: str
    params: Optional[Dict[str, float]] = None


class CombinedUpdate(BaseModel):
    name: Optional[str] = None
    strategy_a: Optional[str] = None
    strategy_b: Optional[str] = None
    params: Optional[Dict[str, float]] = None


@router.get("/combined")
async def list_combined():
    return combined_store.list_combined()


@router.post("/combined")
async def create_combined(req: CombinedCreate):
    if req.strategy_a == req.strategy_b:
        raise HTTPException(status_code=400, detail="Pick two different strategies")
    try:
        return combined_store.create_combined(
            req.name, req.strategy_a, req.strategy_b, req.params
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/combined/{combo_id}")
async def update_combined(combo_id: str, req: CombinedUpdate):
    fields = {k: v for k, v in req.dict().items() if v is not None}
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

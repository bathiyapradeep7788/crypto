from fastapi import APIRouter
from app.models.trade_session import TradeSessionRequest
from app.core.paper_engine import start_paper_session, stop_paper_session, get_session, get_all_sessions

router = APIRouter()


@router.post("/start")
async def start(req: TradeSessionRequest):
    session_id = await start_paper_session(req.model_dump())
    return {"session_id": session_id, "status": "running"}


@router.post("/stop/{session_id}")
async def stop(session_id: str):
    await stop_paper_session(session_id)
    return {"session_id": session_id, "status": "stopped"}


@router.get("/status/{session_id}")
async def status(session_id: str):
    session = get_session(session_id)
    if not session:
        return {"status": "not_found"}
    return session


@router.get("/sessions")
async def sessions():
    return list(get_all_sessions().values())

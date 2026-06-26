from fastapi import APIRouter
from app.models.trade_session import TradeSessionRequest
from app.core.paper_engine import start_paper_session, stop_paper_session, get_session, get_all_sessions
from app.config import settings

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


@router.get("/history")
async def history(limit: int = 20):
    """Return past sessions + their trades from Supabase."""
    if not settings.supabase_url or not settings.supabase_key:
        return {"sessions": [], "error": "DB not configured"}
    try:
        from supabase import create_client
        db = create_client(settings.supabase_url, settings.supabase_key)
        sessions = db.table("paper_trade_sessions") \
            .select("*") \
            .order("started_at", desc=True) \
            .limit(limit) \
            .execute().data
        return {"sessions": sessions}
    except Exception as e:
        return {"sessions": [], "error": str(e)}


@router.get("/history/{session_id}/trades")
async def session_trades(session_id: str):
    """Return all trades for a session from Supabase."""
    if not settings.supabase_url or not settings.supabase_key:
        return {"trades": [], "error": "DB not configured"}
    try:
        from supabase import create_client
        db = create_client(settings.supabase_url, settings.supabase_key)
        trades = db.table("paper_trades") \
            .select("*") \
            .eq("session_id", session_id) \
            .order("closed_at", desc=True) \
            .execute().data
        return {"trades": trades}
    except Exception as e:
        return {"trades": [], "error": str(e)}


@router.get("/summary")
async def summary():
    """Overall paper trade summary across all sessions."""
    if not settings.supabase_url or not settings.supabase_key:
        return {"error": "DB not configured"}
    try:
        from supabase import create_client
        db = create_client(settings.supabase_url, settings.supabase_key)
        result = db.table("paper_trades") \
            .select("profit_usdt, profit_pct, direction, exit_reason, coin") \
            .execute().data
        total_trades = len(result)
        wins = sum(1 for t in result if (t.get("profit_usdt") or 0) > 0)
        total_pnl = sum((t.get("profit_usdt") or 0) for t in result)
        return {
            "total_trades": total_trades,
            "wins": wins,
            "losses": total_trades - wins,
            "win_rate": round(wins / total_trades * 100, 1) if total_trades else 0,
            "total_pnl_usdt": round(total_pnl, 2),
        }
    except Exception as e:
        return {"error": str(e)}

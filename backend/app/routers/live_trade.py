from fastapi import APIRouter, HTTPException
from app.models.trade_session import TradeSessionRequest
from app.core.live_engine import start_live_session, stop_live_session, get_session, get_all_sessions
from app.core.monitor_engine import check_monitor
from app.config import settings
from pydantic import BaseModel
from typing import List

router = APIRouter()


class MonitorConfig(BaseModel):
    coins: List[str]
    interval: str = "15m"
    strategy: str = "rsi_macd"
    tp_pct: float = 2.0
    tp2_pct: float = 4.0
    sl_pct: float = 1.5
    trade_usdt: float = 100.0
    ai_min_confidence: int = 65


def _get_client():
    if not settings.supabase_url or not settings.supabase_key:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    from supabase import create_client
    return create_client(settings.supabase_url, settings.supabase_key)


# ── Legacy single-session endpoints ───────────────────────────

@router.post("/start")
async def start(req: TradeSessionRequest):
    session_id = await start_live_session(req.model_dump())
    return {"session_id": session_id, "status": "running"}


@router.post("/stop/{session_id}")
async def stop(session_id: str):
    await stop_live_session(session_id)
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


# ── Multi-coin monitor endpoints (serverless-safe) ─────────────

@router.post("/monitor/check")
async def monitor_check(config: MonitorConfig):
    return await check_monitor("live", config.model_dump())


@router.get("/monitor/positions")
async def monitor_positions():
    client = _get_client()
    res = client.table("monitor_positions").select("*").eq("mode", "live").order("opened_at", desc=True).execute()
    return {"positions": res.data or []}


@router.get("/monitor/trades")
async def monitor_trades():
    client = _get_client()
    res = client.table("monitor_trades").select("*").eq("mode", "live").order("closed_at", desc=True).limit(200).execute()
    return {"trades": res.data or []}


@router.post("/monitor/close/{position_id}")
async def monitor_close(position_id: str):
    client = _get_client()
    pos_res = client.table("monitor_positions").select("*").eq("id", position_id).execute()
    if not pos_res.data:
        raise HTTPException(status_code=404, detail="Position not found")
    pos = pos_res.data[0]
    client.table("monitor_trades").insert({
        "mode": pos["mode"],
        "coin": pos["coin"],
        "strategy": pos["strategy"],
        "direction": pos["direction"],
        "entry_price": pos["entry_price"],
        "tp": pos["tp"],
        "tp2": pos["tp2"],
        "sl": pos["sl"],
        "exit_price": pos["entry_price"],
        "exit_reason": "manual-close",
        "trade_usdt": pos.get("trade_usdt", 100),
        "profit_pct": 0,
        "profit_usdt": 0,
        "win": False,
        "status": "closed",
        "ai_confidence": pos.get("ai_confidence"),
        "opened_at": pos.get("opened_at"),
    }).execute()
    client.table("monitor_positions").delete().eq("id", position_id).execute()
    return {"closed": position_id}


@router.post("/monitor/think/{position_id}")
async def monitor_think(position_id: str):
    client = _get_client()
    client.table("monitor_positions").update({"status": "think"}).eq("id", position_id).execute()
    return {"status": "think", "id": position_id}

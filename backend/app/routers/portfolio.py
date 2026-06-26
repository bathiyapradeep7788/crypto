from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from app.core.portfolio_engine import (
    start_portfolio, stop_portfolio,
    get_portfolio, get_all_portfolios, ALL_COINS,
)
from app.config import settings

router = APIRouter()


class PortfolioStartRequest(BaseModel):
    coins: List[str] = ALL_COINS
    interval: str = "15m"          # upgraded default: 4x more signals
    virtual_balance: float = 2000.0
    trade_usdt: float = 100.0
    tp_pct: float = 3.0            # upgraded default: 1:2 R:R
    tp2_pct: float = 4.5
    sl_pct: float = 1.5
    use_trend_filter: bool = True   # keep EMA200 for quality
    use_session_filter: bool = False # upgraded default: 24/7 trading
    use_demo_binance: bool = False


@router.post("/start")
async def start(req: PortfolioStartRequest):
    pid = await start_portfolio(req.model_dump())
    return {"portfolio_id": pid, "status": "running", "coins": req.coins}


@router.post("/stop/{pid}")
async def stop(pid: str):
    await stop_portfolio(pid)
    return {"portfolio_id": pid, "status": "stopped"}


@router.get("/status/{pid}")
async def status(pid: str):
    p = get_portfolio(pid)
    if not p:
        return {"status": "not_found"}
    return p


@router.get("/active")
async def active():
    """Return all in-memory portfolio sessions."""
    return list(get_all_portfolios().values())


@router.get("/history")
async def history(limit: int = 20):
    """Return past portfolio sessions from Supabase."""
    if not settings.supabase_url or not settings.supabase_key:
        return {"sessions": []}
    try:
        from supabase import create_client
        db = create_client(settings.supabase_url, settings.supabase_key)
        sessions = db.table("portfolio_sessions") \
            .select("*") \
            .order("started_at", desc=True) \
            .limit(limit) \
            .execute().data
        return {"sessions": sessions}
    except Exception as e:
        return {"sessions": [], "error": str(e)}


@router.get("/history/{pid}/trades")
async def portfolio_trades(pid: str):
    if not settings.supabase_url or not settings.supabase_key:
        return {"trades": []}
    try:
        from supabase import create_client
        db = create_client(settings.supabase_url, settings.supabase_key)
        trades = db.table("portfolio_trades") \
            .select("*") \
            .eq("portfolio_id", pid) \
            .order("closed_at", desc=True) \
            .execute().data
        return {"trades": trades}
    except Exception as e:
        return {"trades": [], "error": str(e)}


@router.get("/summary")
async def summary():
    if not settings.supabase_url or not settings.supabase_key:
        return {"error": "DB not configured"}
    try:
        from supabase import create_client
        db = create_client(settings.supabase_url, settings.supabase_key)
        trades = db.table("portfolio_trades").select("profit_usdt, coin").execute().data
        total  = len(trades)
        wins   = sum(1 for t in trades if (t.get("profit_usdt") or 0) > 0)
        pnl    = sum((t.get("profit_usdt") or 0) for t in trades)
        # Per-coin breakdown
        coin_pnl: dict = {}
        for t in trades:
            c = t.get("coin", "")
            coin_pnl[c] = round(coin_pnl.get(c, 0) + (t.get("profit_usdt") or 0), 2)
        return {
            "total_trades":   total,
            "wins":           wins,
            "losses":         total - wins,
            "win_rate":       round(wins / total * 100, 1) if total else 0,
            "total_pnl_usdt": round(pnl, 2),
            "coin_pnl":       coin_pnl,
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/coins")
async def coins():
    """Return all supported coins with their strategy config."""
    from app.core.portfolio_engine import COIN_STRATEGIES
    return {"coins": COIN_STRATEGIES}

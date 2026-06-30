"""
Signal Logger — scan 15m candles for a single coin, persist every signal,
verify outcomes on demand.

All endpoints are designed to complete within Vercel/Render's 10-second
serverless limit: the frontend calls /scan once per coin (not all at once).
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from app.services.strategy_engine import STRATEGY_MAP, get_signal
from app.services.binance_client import fetch_klines
from app.services.trade_simulator import simulate_trade
from app.config import settings

router = APIRouter()

STRATEGY_LABELS = {
    "rsi_macd":            "RSI + MACD",
    "ema_crossover":       "EMA 21/55 Crossover",
    "bollinger_squeeze":   "Bollinger Band Squeeze",
    "vwap_mean_reversion": "VWAP Mean Reversion",
    "support_resistance":  "S/R Bounce",
    "ichimoku":            "Ichimoku Cloud",
    "stoch_rsi_volume":    "Stoch RSI + Volume",
    "ict_order_block":     "ICT Order Block + FVG",
    "fibonacci":           "Fibonacci Retracement",
    "volume_momentum":     "Volume-Momentum Breakout",
}

TARGET_COINS = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    "ADAUSDT", "TRXUSDT", "LINKUSDT", "DOGEUSDT", "XLMUSDT",
]

INTERVAL = "15m"
WINDOW = 60
DEFAULT_TP   = 2.0
DEFAULT_TP2  = 4.0
DEFAULT_SL   = 1.5


def _supabase():
    if not settings.supabase_url or not settings.supabase_key:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    from supabase import create_client
    return create_client(settings.supabase_url, settings.supabase_key)


def _ts(val) -> str:
    return val.isoformat() if hasattr(val, "isoformat") else str(val)


@router.get("/scan")
async def scan_signals(
    coin: str = Query(..., description="e.g. BTCUSDT"),
    start_dt: str = Query(..., description="ISO datetime"),
    end_dt:   str = Query(..., description="ISO datetime"),
    tp_pct:   float = Query(default=DEFAULT_TP),
    tp2_pct:  float = Query(default=DEFAULT_TP2),
    sl_pct:   float = Query(default=DEFAULT_SL),
):
    """
    Scan historical 15m candles for ONE coin across ALL strategies.
    Every signal found is saved to signal_logs.
    Returns count of signals logged.
    """
    coin = coin.upper()
    if coin not in TARGET_COINS:
        raise HTTPException(status_code=400, detail=f"{coin} not in target coin list")

    try:
        start = datetime.fromisoformat(start_dt)
        end   = datetime.fromisoformat(end_dt)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format — use ISO 8601")

    candles = await fetch_klines(coin, INTERVAL, start, end)
    if not candles or len(candles) < WINDOW + 1:
        return {"coin": coin, "signals_found": 0, "message": "Insufficient candle data"}

    rows = []
    for strategy_id in STRATEGY_MAP:
        label = STRATEGY_LABELS.get(strategy_id, strategy_id)
        for i in range(WINDOW, len(candles) - 1):
            window_candles = candles[max(0, i - WINDOW): i + 1]
            sig = get_signal(strategy_id, {}, window_candles)
            if sig is None:
                continue
            direction, _ = sig
            entry_candle  = candles[i]
            future        = candles[i + 1:]
            sim           = simulate_trade(entry_candle, future, direction, tp_pct, tp2_pct, sl_pct)
            rows.append({
                "coin":        coin,
                "signal_date": _ts(entry_candle["open_time"]),
                "strategy":    label,
                "strategy_id": strategy_id,
                "direction":   direction,
                "entry":       sim["entry"],
                "tp":          sim["tp"],
                "tp2":         sim["tp2"],
                "sl":          sim["sl"],
                "start_dt":    start_dt,
                "end_dt":      end_dt,
                "outcome":     None,
                "profit_pct":  None,
                "end_position": None,
            })

    if rows:
        client = _supabase()
        client.table("signal_logs").insert(rows).execute()

    return {"coin": coin, "signals_found": len(rows)}


@router.get("/list")
async def list_signals(
    coin:    Optional[str] = Query(default=None),
    outcome: Optional[str] = Query(default=None, description="Win | Loss | null"),
    limit:   int           = Query(default=200, le=500),
):
    """Return signal_logs ordered by signal_date descending."""
    client = _supabase()
    q = client.table("signal_logs").select("*").order("signal_date", desc=True).limit(limit)
    if coin:
        q = q.eq("coin", coin.upper())
    if outcome == "null":
        q = q.is_("outcome", "null")
    elif outcome:
        q = q.eq("outcome", outcome)
    res = q.execute()
    return {"signals": res.data or []}


@router.post("/check/{signal_id}")
async def check_signal(signal_id: str):
    """
    Evaluate the trade for an existing signal_log entry.
    Re-fetches candles from signal_date onward and simulates the trade.
    Updates outcome, profit_pct, end_position, checked_at in DB.
    """
    client = _supabase()
    res = client.table("signal_logs").select("*").eq("id", signal_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Signal not found")

    sig = res.data
    try:
        signal_dt = datetime.fromisoformat(sig["signal_date"].replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="Cannot parse signal_date")

    end_dt = datetime.fromisoformat(sig["end_dt"].replace("Z", "+00:00"))
    candles = await fetch_klines(sig["coin"], INTERVAL, signal_dt, end_dt)

    if not candles or len(candles) < 2:
        raise HTTPException(status_code=400, detail="Not enough candle data to verify")

    entry_candle = candles[0]
    future       = candles[1:]
    tp_pct  = round(abs(sig["tp"]  - sig["entry"]) / sig["entry"] * 100, 4)
    tp2_pct = round(abs(sig["tp2"] - sig["entry"]) / sig["entry"] * 100, 4)
    sl_pct  = round(abs(sig["sl"]  - sig["entry"]) / sig["entry"] * 100, 4)

    sim = simulate_trade(entry_candle, future, sig["direction"], tp_pct, tp2_pct, sl_pct)

    update = {
        "outcome":      sim["win_loss_rate"],
        "profit_pct":   sim["profit_rate"],
        "end_position": sim["end_position"],
        "checked_at":   datetime.now(timezone.utc).isoformat(),
    }
    client.table("signal_logs").update(update).eq("id", signal_id).execute()

    return {**sig, **update}


@router.delete("/clear")
async def clear_signals(coin: Optional[str] = Query(default=None)):
    """Delete all signal_logs (or for a specific coin). Hard reset."""
    client = _supabase()
    q = client.table("signal_logs").delete()
    if coin:
        q = q.eq("coin", coin.upper())
    else:
        q = q.neq("id", "00000000-0000-0000-0000-000000000000")
    q.execute()
    return {"cleared": True, "coin": coin or "all"}

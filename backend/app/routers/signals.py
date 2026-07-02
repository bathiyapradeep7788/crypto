"""
Signal Logger — scan 15m candles for a single coin, persist every signal,
verify outcomes on demand.

All endpoints are designed to complete within Vercel/Render's serverless
limit: the frontend calls /scan once per coin+month (not all at once).
"""
import json
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from app.services.strategy_engine import STRATEGY_MAP, get_signal
from app.services.combined_store import COMBO_PREFIX, get_combined, list_combined
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


def _strategy_label(strategy_id: str) -> str:
    if strategy_id.startswith(COMBO_PREFIX):
        combo = get_combined(strategy_id[len(COMBO_PREFIX):])
        return combo["name"] if combo else strategy_id
    return STRATEGY_LABELS.get(strategy_id, strategy_id)


@router.get("/scan")
async def scan_signals(
    coin: str = Query(..., description="e.g. BTCUSDT — any Binance USDT pair"),
    start_dt: str = Query(..., description="ISO datetime"),
    end_dt:   str = Query(..., description="ISO datetime"),
    tp_pct:   float = Query(default=DEFAULT_TP),
    tp2_pct:  float = Query(default=DEFAULT_TP2),
    sl_pct:   float = Query(default=DEFAULT_SL),
    strategies: Optional[str] = Query(default=None, description="comma list of strategy ids (built-in or combo_<id>); default = all built-in"),
    params: Optional[str] = Query(default=None, description='JSON: {"rsi_macd": {"rsi_period": 14}, ...} per-strategy overrides'),
):
    """
    Scan historical 15m candles for ONE coin across the selected strategies.
    Every signal found is saved to signal_logs with its close date + duration.
    Returns count of signals logged.
    """
    coin = coin.upper()
    if not coin.endswith("USDT") or len(coin) < 6:
        raise HTTPException(status_code=400, detail=f"{coin} is not a valid USDT pair symbol")

    try:
        start = datetime.fromisoformat(start_dt)
        end   = datetime.fromisoformat(end_dt)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format — use ISO 8601")

    strategy_ids = [s.strip() for s in strategies.split(",") if s.strip()] if strategies else list(STRATEGY_MAP.keys())

    param_map: dict = {}
    if params:
        try:
            param_map = json.loads(params)
            if not isinstance(param_map, dict):
                raise ValueError
        except ValueError:
            raise HTTPException(status_code=400, detail="params must be a JSON object")

    candles = await fetch_klines(coin, INTERVAL, start, end)
    if not candles or len(candles) < WINDOW + 1:
        return {"coin": coin, "signals_found": 0, "message": "Insufficient candle data"}

    rows = []
    for strategy_id in strategy_ids:
        label = _strategy_label(strategy_id)
        strat_params = param_map.get(strategy_id) or {}
        for i in range(WINDOW, len(candles) - 1):
            window_candles = candles[max(0, i - WINDOW): i + 1]
            sig = get_signal(strategy_id, strat_params, window_candles)
            if sig is None:
                continue
            direction, _ = sig
            entry_candle  = candles[i]
            future        = candles[i + 1:]
            sim           = simulate_trade(entry_candle, future, direction, tp_pct, tp2_pct, sl_pct)

            open_time  = entry_candle["open_time"]
            close_time = sim["end_time"]
            try:
                dur_min = round((close_time - open_time).total_seconds() / 60, 1)
            except Exception:
                dur_min = None

            rows.append({
                "coin":         coin,
                "signal_date":  _ts(open_time),
                "strategy":     label,
                "strategy_id":  strategy_id,
                "direction":    direction,
                "entry":        sim["entry"],
                "tp":           sim["tp"],
                "tp2":          sim["tp2"],
                "sl":           sim["sl"],
                "start_dt":     start_dt,
                "end_dt":       end_dt,
                "outcome":      sim["win_loss_rate"],
                "profit_pct":   sim["profit_rate"],
                "end_position": sim["end_position"],
                "close_date":   _ts(close_time),
                "duration_min": dur_min,
                "checked_at":   datetime.now(timezone.utc).isoformat(),
            })

    if rows:
        client = _supabase()
        for i in range(0, len(rows), 1000):
            client.table("signal_logs").insert(rows[i:i + 1000]).execute()

    return {"coin": coin, "signals_found": len(rows)}


@router.get("/list")
async def list_signals(
    coin:       Optional[str] = Query(default=None),
    outcome:    Optional[str] = Query(default=None, description="Win | Loss | null"),
    close_from: Optional[str] = Query(default=None, description="ISO date — filter close_date >= this"),
    close_to:   Optional[str] = Query(default=None, description="ISO date — filter close_date < this"),
    sort_by:    str           = Query(default="signal_date"),
    sort_dir:   str           = Query(default="desc"),
    limit:      int           = Query(default=1000, le=1000),
    offset:     int           = Query(default=0, ge=0),
):
    """Return one page of signal_logs + total count matching the filters."""
    client = _supabase()

    allowed_sort = {"signal_date", "close_date", "coin", "strategy", "direction",
                    "outcome", "profit_pct", "duration_min", "entry"}
    if sort_by not in allowed_sort:
        sort_by = "signal_date"

    q = client.table("signal_logs").select("*", count="exact") \
        .order(sort_by, desc=(sort_dir != "asc")) \
        .range(offset, offset + limit - 1)
    if coin:
        q = q.eq("coin", coin.upper())
    if outcome == "null":
        q = q.is_("outcome", "null")
    elif outcome:
        q = q.eq("outcome", outcome)
    if close_from:
        q = q.gte("close_date", close_from)
    if close_to:
        q = q.lt("close_date", close_to)

    res = q.execute()
    return {"signals": res.data or [], "total": res.count or 0}


@router.get("/stats")
async def signal_stats(
    close_from: Optional[str] = Query(default=None),
    close_to:   Optional[str] = Query(default=None),
):
    """Per-strategy aggregate stats (win rate, PnL, duration) — best strategy finder."""
    client = _supabase()
    res = client.rpc("strategy_stats", {"close_from": close_from, "close_to": close_to}).execute()
    return {"stats": res.data or []}


@router.get("/methods")
async def list_methods():
    """Built-in strategies + user-created combined methods, for the scanner UI."""
    builtin = [{"id": sid, "label": STRATEGY_LABELS.get(sid, sid), "type": "builtin"}
               for sid in STRATEGY_MAP]
    combos  = [{"id": f"{COMBO_PREFIX}{c['id']}", "label": c["name"], "type": "combo",
                "strategy_a": c["strategy_a"], "strategy_b": c["strategy_b"]}
               for c in (list_combined() or [])]
    return {"methods": builtin + combos}


@router.post("/check/{signal_id}")
async def check_signal(signal_id: str):
    """
    Evaluate the trade for an existing signal_log entry.
    Re-fetches candles from signal_date onward and simulates the trade.
    Updates outcome, profit_pct, end_position, close_date, duration, checked_at.
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

    try:
        dur_min = round((sim["end_time"] - entry_candle["open_time"]).total_seconds() / 60, 1)
    except Exception:
        dur_min = None

    update = {
        "outcome":      sim["win_loss_rate"],
        "profit_pct":   sim["profit_rate"],
        "end_position": sim["end_position"],
        "close_date":   _ts(sim["end_time"]),
        "duration_min": dur_min,
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

"""
Stateless monitor engine — called by the frontend every ~15 min.
All state lives in Supabase (monitor_positions + monitor_trades).
No background asyncio tasks; each call does full work and returns.
"""
from datetime import datetime
from typing import List, Dict, Any
from app.config import settings
from app.core.logger import emit_log
from app.services.strategy_engine import get_signal


def _get_client():
    from supabase import create_client
    return create_client(settings.supabase_url, settings.supabase_key)


async def _fetch_klines(symbol: str, interval: str, limit: int = 120) -> List[Dict]:
    """Fetch recent klines using httpx (same approach as binance_client)."""
    import httpx
    url = f"{settings.binance_base_url}/api/v3/klines"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, params={
                "symbol": symbol,
                "interval": interval,
                "limit": limit,
            })
            resp.raise_for_status()
            raw = resp.json()
            return [
                {
                    "open_time": datetime.utcfromtimestamp(c[0] / 1000),
                    "open":  float(c[1]),
                    "high":  float(c[2]),
                    "low":   float(c[3]),
                    "close": float(c[4]),
                    "volume": float(c[5]),
                }
                for c in raw
            ]
    except Exception as e:
        await emit_log("ERROR", f"[Monitor] klines fetch failed for {symbol}: {e}")
        return []


def _check_exit(open_pos: Dict, last_candle: Dict):
    """
    Check whether last_candle's high/low hit TP1, TP2 or SL.
    Returns (exit_reason, exit_price) or (None, None).
    """
    direction = open_pos["direction"]
    tp  = float(open_pos["tp"])
    tp2 = float(open_pos["tp2"])
    sl  = float(open_pos["sl"])
    high = last_candle["high"]
    low  = last_candle["low"]

    if direction == "long":
        if low <= sl:
            return "Hit SL", sl
        if high >= tp2:
            return "Hit TP2", tp2
        if high >= tp:
            return "Hit TP1", tp
    else:
        if high >= sl:
            return "Hit SL", sl
        if low <= tp2:
            return "Hit TP2", tp2
        if low <= tp:
            return "Hit TP1", tp
    return None, None


def _check_think_verify(open_pos: Dict, candles: List[Dict]) -> tuple:
    """
    For 'think' positions: scan last 10 candles to see if TP was hit.
    Returns (exit_reason, exit_price) or (None, None).
    """
    direction = open_pos["direction"]
    tp  = float(open_pos["tp"])
    tp2 = float(open_pos["tp2"])
    sl  = float(open_pos["sl"])

    for candle in candles[-10:]:
        high = candle["high"]
        low  = candle["low"]
        if direction == "long":
            if high >= tp2:
                return "think-verified-TP2", tp2
            if high >= tp:
                return "think-verified-TP", tp
        else:
            if low <= tp2:
                return "think-verified-TP2", tp2
            if low <= tp:
                return "think-verified-TP", tp
    return None, None


async def check_monitor(mode: str, config: dict) -> dict:
    """
    Stateless check for all monitored coins.
    mode: 'paper' or 'live'
    config keys: coins, interval, strategy, tp_pct, tp2_pct, sl_pct, trade_usdt, ai_min_confidence
    """
    if not settings.supabase_url or not settings.supabase_key:
        await emit_log("ERROR", "[Monitor] Supabase not configured")
        return {"error": "Supabase not configured", "checked": 0, "new_entries": [], "closed": [], "errors": []}

    client = _get_client()
    coins: List[str] = config.get("coins", [])
    interval: str    = config.get("interval", "15m")
    strategy: str    = config.get("strategy", "rsi_macd")
    tp_pct: float    = float(config.get("tp_pct", 2.0))
    tp2_pct: float   = float(config.get("tp2_pct", 4.0))
    sl_pct: float    = float(config.get("sl_pct", 1.5))
    trade_usdt: float = float(config.get("trade_usdt", 100.0))

    new_entries: List[Dict] = []
    closed_list: List[Dict] = []
    errors: List[str]       = []

    # Load all open positions for this mode
    try:
        pos_res = client.table("monitor_positions").select("*").eq("mode", mode).eq("status", "open").execute()
        open_positions: List[Dict] = pos_res.data or []
    except Exception as e:
        err = f"[Monitor] Failed to load positions: {e}"
        await emit_log("ERROR", err)
        return {"error": err, "checked": 0, "new_entries": [], "closed": [], "errors": [err]}

    open_by_coin: Dict[str, Dict] = {p["coin"]: p for p in open_positions}

    # Load 'think' positions too
    try:
        think_res = client.table("monitor_positions").select("*").eq("mode", mode).eq("status", "think").execute()
        think_positions: List[Dict] = think_res.data or []
    except Exception:
        think_positions = []

    think_by_coin: Dict[str, Dict] = {p["coin"]: p for p in think_positions}

    for coin in coins:
        try:
            candles = await _fetch_klines(coin, interval, limit=120)
            if not candles or len(candles) < 2:
                errors.append(f"No candle data for {coin}")
                await emit_log("WARN", f"[Monitor] No candle data for {coin}")
                continue

            last_candle = candles[-1]
            current_price = last_candle["close"]

            # --- Check think positions ---
            if coin in think_by_coin:
                think_pos = think_by_coin[coin]
                exit_reason, exit_price = _check_think_verify(think_pos, candles)
                if exit_reason and exit_price:
                    entry = float(think_pos["entry_price"])
                    mult = 1 if think_pos["direction"] == "long" else -1
                    profit_pct = (exit_price - entry) / entry * 100 * mult
                    profit_usdt = trade_usdt * profit_pct / 100
                    win = profit_pct > 0

                    try:
                        client.table("monitor_trades").insert({
                            "mode": mode,
                            "coin": coin,
                            "strategy": think_pos["strategy"],
                            "direction": think_pos["direction"],
                            "entry_price": entry,
                            "tp": think_pos["tp"],
                            "tp2": think_pos["tp2"],
                            "sl": think_pos["sl"],
                            "exit_price": round(exit_price, 8),
                            "exit_reason": exit_reason,
                            "trade_usdt": trade_usdt,
                            "profit_pct": round(profit_pct, 4),
                            "profit_usdt": round(profit_usdt, 4),
                            "win": win,
                            "status": "closed",
                            "ai_confidence": think_pos.get("ai_confidence"),
                            "opened_at": think_pos.get("opened_at"),
                            "closed_at": datetime.utcnow().isoformat(),
                        }).execute()
                        client.table("monitor_positions").delete().eq("id", think_pos["id"]).execute()
                        closed_list.append({"coin": coin, "reason": exit_reason, "profit_pct": round(profit_pct, 4)})
                        await emit_log("INFO", f"[Monitor/{mode}] {coin} think-verified {exit_reason} @ {exit_price:.4f} | PnL: {profit_pct:+.2f}%")
                    except Exception as e:
                        err = f"[Monitor] DB error closing think position for {coin}: {e}"
                        errors.append(err)
                        await emit_log("ERROR", err)
                continue  # coin has think position, skip entry check

            # --- Check open positions ---
            if coin in open_by_coin:
                open_pos = open_by_coin[coin]
                exit_reason, exit_price = _check_exit(open_pos, last_candle)
                if exit_reason and exit_price:
                    entry = float(open_pos["entry_price"])
                    mult = 1 if open_pos["direction"] == "long" else -1
                    profit_pct = (exit_price - entry) / entry * 100 * mult
                    profit_usdt = trade_usdt * profit_pct / 100
                    win = profit_pct > 0

                    try:
                        client.table("monitor_trades").insert({
                            "mode": mode,
                            "coin": coin,
                            "strategy": open_pos["strategy"],
                            "direction": open_pos["direction"],
                            "entry_price": entry,
                            "tp": open_pos["tp"],
                            "tp2": open_pos["tp2"],
                            "sl": open_pos["sl"],
                            "exit_price": round(exit_price, 8),
                            "exit_reason": exit_reason,
                            "trade_usdt": trade_usdt,
                            "profit_pct": round(profit_pct, 4),
                            "profit_usdt": round(profit_usdt, 4),
                            "win": win,
                            "status": "closed",
                            "ai_confidence": open_pos.get("ai_confidence"),
                            "opened_at": open_pos.get("opened_at"),
                            "closed_at": datetime.utcnow().isoformat(),
                        }).execute()
                        client.table("monitor_positions").delete().eq("id", open_pos["id"]).execute()
                        closed_list.append({"coin": coin, "reason": exit_reason, "profit_pct": round(profit_pct, 4)})
                        await emit_log("INFO", f"[Monitor/{mode}] {coin} {exit_reason} @ {exit_price:.4f} | PnL: {profit_pct:+.2f}%")
                    except Exception as e:
                        err = f"[Monitor] DB error closing position for {coin}: {e}"
                        errors.append(err)
                        await emit_log("ERROR", err)
                continue  # had open position, skip entry check

            # --- No open position: check for new signal ---
            window_candles = candles[-60:] if len(candles) >= 60 else candles
            signal = get_signal(strategy, {}, window_candles)
            if signal:
                direction, meta = signal
                mult = 1 if direction == "long" else -1
                entry_price = current_price
                tp  = round(entry_price * (1 + mult * tp_pct / 100), 8)
                tp2 = round(entry_price * (1 + mult * tp2_pct / 100), 8)
                sl  = round(entry_price * (1 - mult * sl_pct / 100), 8)

                try:
                    client.table("monitor_positions").insert({
                        "mode": mode,
                        "coin": coin,
                        "strategy": strategy,
                        "direction": direction,
                        "entry_price": round(entry_price, 8),
                        "tp": tp,
                        "tp2": tp2,
                        "sl": sl,
                        "trade_usdt": trade_usdt,
                        "status": "open",
                        "opened_at": datetime.utcnow().isoformat(),
                    }).execute()
                    new_entries.append({"coin": coin, "direction": direction, "entry_price": round(entry_price, 8)})
                    await emit_log("INFO", f"[Monitor/{mode}] NEW {direction.upper()} {coin} @ {entry_price:.4f} | TP: {tp:.4f} SL: {sl:.4f}")
                except Exception as e:
                    err = f"[Monitor] DB error inserting position for {coin}: {e}"
                    errors.append(err)
                    await emit_log("ERROR", err)

        except Exception as e:
            err = f"[Monitor] Error processing {coin}: {e}"
            errors.append(err)
            await emit_log("ERROR", err)

    return {
        "checked": len(coins),
        "new_entries": new_entries,
        "closed": closed_list,
        "errors": errors,
        "timestamp": datetime.utcnow().isoformat(),
    }

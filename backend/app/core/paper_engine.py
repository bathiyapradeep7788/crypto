import asyncio
import uuid
from datetime import datetime
from app.core.logger import emit_log
from app.services.binance_trader import fetch_recent_klines
from app.services.strategy_engine import get_signal, get_voted_signal
from app.services.filters import trend_direction, in_active_session
from app.config import settings

_INTERVAL_SECONDS = {
    "1m": 60, "3m": 180, "5m": 300, "15m": 900,
    "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400,
}

# Candles needed: 300 covers EMA200 + strategy warm-up
_CANDLE_LIMIT = 300

_sessions: dict = {}


def _get_supabase():
    if not settings.supabase_url or not settings.supabase_key:
        return None
    from supabase import create_client
    return create_client(settings.supabase_url, settings.supabase_key)


def get_all_sessions() -> dict:
    return _sessions


def get_session(session_id: str) -> dict:
    return _sessions.get(session_id)


async def start_paper_session(config: dict) -> str:
    session_id = str(uuid.uuid4())[:8]
    strategies = config.get("strategies") or [config["strategy_primary"]]
    _sessions[session_id] = {
        "session_id": session_id,
        "mode": "paper",
        "status": "running",
        "coin": config["coin"],
        "strategy": strategies,
        "interval": config["interval"],
        "balance": config["virtual_balance"],
        "initial_balance": config["virtual_balance"],
        "trade_usdt": config["trade_usdt"],
        "open_position": None,
        "closed_trades": [],
        "total_pnl_pct": 0.0,
        "total_pnl_usdt": 0.0,
        "wins": 0,
        "losses": 0,
        "started_at": datetime.utcnow().isoformat(),
        "last_check": None,
        "current_price": None,
        "filters": {
            "trend_filter": config.get("use_trend_filter", True),
            "session_filter": config.get("use_session_filter", True),
            "min_confluence": config.get("min_confluence", 1),
        },
        "ai_min_confidence": config.get("ai_min_confidence", 60),
    }
    # Save session to DB
    try:
        db = _get_supabase()
        if db:
            db.table("paper_trade_sessions").insert({
                "id": session_id,
                "coin": config["coin"],
                "strategies": strategies,
                "interval": config["interval"],
                "initial_balance": config["virtual_balance"],
                "final_balance": config["virtual_balance"],
                "trade_usdt": config["trade_usdt"],
                "tp_pct": config.get("tp_pct", 2.0),
                "sl_pct": config.get("sl_pct", 1.5),
                "status": "running",
                "started_at": datetime.utcnow().isoformat(),
            }).execute()
    except Exception as e:
        await emit_log("ERROR", f"[Paper] Session DB save failed: {str(e)}")

    asyncio.create_task(_paper_loop(session_id, config))
    await emit_log("INFO", f"[Paper {session_id}] Started — {config['coin']} / {','.join(strategies)} / {config['interval']}")
    return session_id


async def stop_paper_session(session_id: str):
    if session_id in _sessions:
        _sessions[session_id]["status"] = "stopped"
        await emit_log("INFO", f"[Paper {session_id}] Stopped by user")
        await _update_session_summary(session_id, "stopped")


async def _update_session_summary(session_id: str, status: str = "running"):
    s = _sessions.get(session_id)
    if not s:
        return
    try:
        db = _get_supabase()
        if db:
            update = {
                "final_balance": round(s["balance"], 2),
                "total_pnl_usdt": round(s["total_pnl_usdt"], 2),
                "total_pnl_pct": round(s["total_pnl_pct"], 4),
                "wins": s["wins"],
                "losses": s["losses"],
                "total_trades": s["wins"] + s["losses"],
                "status": status,
            }
            if status in ("stopped", "completed"):
                update["stopped_at"] = datetime.utcnow().isoformat()
            db.table("paper_trade_sessions").update(update).eq("id", session_id).execute()
    except Exception as e:
        await emit_log("ERROR", f"[Paper] Session summary update failed: {str(e)}")


async def _paper_loop(session_id: str, config: dict):
    interval_sec = _INTERVAL_SECONDS.get(config["interval"], 900)
    symbol       = config["coin"]
    strategies   = config.get("strategies") or [config["strategy_primary"]]
    strategy2    = config.get("strategy_secondary")
    tp_pct       = config["tp_pct"]
    tp2_pct      = config["tp2_pct"]
    sl_pct       = config["sl_pct"]
    trade_usdt   = config["trade_usdt"]
    position_pct = config.get("position_pct", 0.0)
    use_trend    = config.get("use_trend_filter", True)
    ema_period   = config.get("trend_ema_period", 200)
    use_session  = config.get("use_session_filter", True)
    min_conf     = config.get("min_confluence", 1)

    while _sessions.get(session_id, {}).get("status") == "running":
        try:
            candles = await fetch_recent_klines(symbol, config["interval"], limit=_CANDLE_LIMIT)
            if not candles:
                await asyncio.sleep(30)
                continue

            current_price = candles[-1]["close"]
            now = candles[-1]["open_time"]
            _sessions[session_id]["current_price"] = current_price
            _sessions[session_id]["last_check"] = datetime.utcnow().isoformat()

            # ── Check open position ──────────────────────────────────────────
            open_pos = _sessions[session_id]["open_position"]
            if open_pos:
                high = candles[-1]["high"]
                low  = candles[-1]["low"]
                direction = open_pos["direction"]
                entry = open_pos["entry"]
                tp  = open_pos["tp"]
                tp2 = open_pos["tp2"]
                sl  = open_pos["sl"]

                exit_reason = None
                exit_price  = current_price

                if direction == "long":
                    if low <= sl:
                        exit_reason, exit_price = "Hit SL",  sl
                    elif high >= tp2:
                        exit_reason, exit_price = "Hit TP2", tp2
                    elif high >= tp:
                        exit_reason, exit_price = "Hit TP1", tp
                else:
                    if high >= sl:
                        exit_reason, exit_price = "Hit SL",  sl
                    elif low <= tp2:
                        exit_reason, exit_price = "Hit TP2", tp2
                    elif low <= tp:
                        exit_reason, exit_price = "Hit TP1", tp

                if exit_reason:
                    mult       = 1 if direction == "long" else -1
                    profit_pct = (exit_price - entry) / entry * 100 * mult
                    profit_usdt = trade_usdt * profit_pct / 100
                    win = profit_pct > 0

                    _sessions[session_id]["balance"] += trade_usdt + profit_usdt
                    _sessions[session_id]["total_pnl_pct"] += profit_pct
                    _sessions[session_id]["total_pnl_usdt"] += profit_usdt
                    if win:
                        _sessions[session_id]["wins"] += 1
                    else:
                        _sessions[session_id]["losses"] += 1

                    closed = {
                        **open_pos,
                        "exit_price":  round(exit_price, 8),
                        "exit_reason": exit_reason,
                        "profit_pct":  round(profit_pct, 4),
                        "profit_usdt": round(profit_usdt, 4),
                        "win": win,
                        "closed_at": datetime.utcnow().isoformat(),
                    }
                    _sessions[session_id]["closed_trades"].append(closed)
                    _sessions[session_id]["open_position"] = None
                    await emit_log("INFO", f"[Paper {session_id}] {symbol} {exit_reason} @ {exit_price:.4f} | PnL: {profit_pct:+.2f}% (${profit_usdt:+.2f})")
                    await _save_paper_trade(session_id, closed)
                    await _update_session_summary(session_id, "running")

            # ── Look for new entry ───────────────────────────────────────────
            if not _sessions[session_id]["open_position"] and _sessions[session_id]["status"] == "running":
                balance = _sessions[session_id]["balance"]
                actual_trade = round(balance * position_pct, 2) if position_pct > 0 else trade_usdt
                if balance < actual_trade or actual_trade < 1:
                    await emit_log("WARN", f"[Paper {session_id}] Low balance ${balance:.2f}")
                else:
                    if use_session and not in_active_session(now):
                        await asyncio.sleep(interval_sec)
                        continue

                    if min_conf > 1 and len(strategies) > 1:
                        result = get_voted_signal(strategies, {}, candles, min_conf)
                    else:
                        result = get_signal(strategies[0], {}, candles, strategy2)

                    if result:
                        direction, meta = result

                        if use_trend:
                            trend = trend_direction(candles, ema_period)
                            if trend is not None:
                                if (direction == "long" and trend != "bull") or \
                                   (direction == "short" and trend != "bear"):
                                    await asyncio.sleep(interval_sec)
                                    continue

                        mult = 1 if direction == "long" else -1
                        ep   = current_price
                        tp   = round(ep * (1 + mult * tp_pct  / 100), 8)
                        tp2  = round(ep * (1 + mult * tp2_pct / 100), 8)
                        sl   = round(ep * (1 - mult * sl_pct  / 100), 8)

                        _sessions[session_id]["balance"] -= actual_trade
                        _sessions[session_id]["open_position"] = {
                            "symbol":    symbol,
                            "direction": direction,
                            "entry":     round(ep, 8),
                            "tp": tp, "tp2": tp2, "sl": sl,
                            "trade_usdt": actual_trade,
                            "signal_meta": meta,
                            "opened_at": datetime.utcnow().isoformat(),
                        }
                        mode_note = f"({position_pct*100:.0f}% compound)" if position_pct > 0 else ""
                        await emit_log("INFO", f"[Paper {session_id}] ENTER {direction.upper()} {symbol} @ {ep:.4f} ${actual_trade:.0f} {mode_note} | TP:{tp:.4f} SL:{sl:.4f}")

        except Exception as e:
            await emit_log("ERROR", f"[Paper {session_id}] Error: {str(e)}")

        await asyncio.sleep(interval_sec)


async def mark_as_think(session_id: str) -> dict:
    """Close current open position at current price, save as 'Think' — for manual/auto review."""
    s = _sessions.get(session_id)
    if not s:
        return {"error": "Session not found"}
    open_pos = s.get("open_position")
    if not open_pos:
        return {"error": "No open position to mark as think"}

    current_price = s.get("current_price") or open_pos["entry"]
    direction = open_pos["direction"]
    entry     = open_pos["entry"]
    mult      = 1 if direction == "long" else -1
    profit_pct  = round((current_price - entry) / entry * 100 * mult, 4)
    trade_usdt  = open_pos.get("trade_usdt", 100)
    profit_usdt = round(trade_usdt * profit_pct / 100, 4)

    closed = {
        **open_pos,
        "exit_price":  round(current_price, 8),
        "exit_reason": "Think",
        "profit_pct":  profit_pct,
        "profit_usdt": profit_usdt,
        "win":         profit_pct > 0,
        "closed_at":   datetime.utcnow().isoformat(),
    }

    s["balance"] += trade_usdt + profit_usdt
    s["total_pnl_pct"]  += profit_pct
    s["total_pnl_usdt"] += profit_usdt
    if profit_pct > 0:
        s["wins"] += 1
    else:
        s["losses"] += 1

    s["closed_trades"].append(closed)
    s["open_position"] = None

    await emit_log("INFO", f"[Paper {session_id}] THINK close {open_pos['symbol']} @ {current_price:.4f} | PnL: {profit_pct:+.2f}%")
    await _save_paper_trade(session_id, closed)
    await _update_session_summary(session_id, "running")

    return {"status": "ok", "exit_price": current_price, "profit_pct": profit_pct, "profit_usdt": profit_usdt}


async def _save_paper_trade(session_id: str, trade: dict):
    try:
        db = _get_supabase()
        if db:
            db.table("paper_trades").insert({
                "session_id":  session_id,
                "coin":        trade["symbol"],
                "direction":   trade["direction"],
                "entry_price": trade["entry"],
                "tp":          trade["tp"],
                "tp2":         trade["tp2"],
                "sl":          trade["sl"],
                "exit_price":  trade["exit_price"],
                "exit_reason": trade["exit_reason"],
                "profit_pct":  trade["profit_pct"],
                "profit_usdt": trade["profit_usdt"],
                "trade_usdt":  trade.get("trade_usdt", 100),
                "opened_at":   trade["opened_at"],
                "closed_at":   trade["closed_at"],
            }).execute()
    except Exception as e:
        await emit_log("ERROR", f"[Paper] DB save failed: {str(e)}")

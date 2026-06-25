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


def get_all_sessions() -> dict:
    return _sessions


def get_session(session_id: str) -> dict:
    return _sessions.get(session_id)


async def start_paper_session(config: dict) -> str:
    session_id = str(uuid.uuid4())[:8]
    _sessions[session_id] = {
        "session_id": session_id,
        "mode": "paper",
        "status": "running",
        "coin": config["coin"],
        "strategy": config.get("strategies") or [config["strategy_primary"]],
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
    asyncio.create_task(_paper_loop(session_id, config))
    strats = config.get("strategies") or [config["strategy_primary"]]
    await emit_log("INFO", f"[Paper {session_id}] Started — {config['coin']} / {','.join(strats)} / {config['interval']}")
    return session_id


async def stop_paper_session(session_id: str):
    if session_id in _sessions:
        _sessions[session_id]["status"] = "stopped"
        await emit_log("INFO", f"[Paper {session_id}] Stopped by user")


async def _paper_loop(session_id: str, config: dict):
    interval_sec = _INTERVAL_SECONDS.get(config["interval"], 900)
    symbol       = config["coin"]
    strategies   = config.get("strategies") or [config["strategy_primary"]]
    strategy2    = config.get("strategy_secondary")
    tp_pct       = config["tp_pct"]
    tp2_pct      = config["tp2_pct"]
    sl_pct       = config["sl_pct"]
    trade_usdt   = config["trade_usdt"]
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

            # ── Look for new entry ───────────────────────────────────────────
            if not _sessions[session_id]["open_position"] and _sessions[session_id]["status"] == "running":
                balance = _sessions[session_id]["balance"]
                if balance < trade_usdt:
                    await emit_log("WARN", f"[Paper {session_id}] Low balance ${balance:.2f}")
                else:
                    # Session filter
                    if use_session and not in_active_session(now):
                        await asyncio.sleep(interval_sec)
                        continue

                    # Get signal
                    if min_conf > 1 and len(strategies) > 1:
                        result = get_voted_signal(strategies, {}, candles, min_conf)
                    else:
                        result = get_signal(strategies[0], {}, candles, strategy2)

                    if result:
                        direction, meta = result

                        # Trend filter
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

                        _sessions[session_id]["balance"] -= trade_usdt
                        _sessions[session_id]["open_position"] = {
                            "symbol":    symbol,
                            "direction": direction,
                            "entry":     round(ep, 8),
                            "tp": tp, "tp2": tp2, "sl": sl,
                            "trade_usdt": trade_usdt,
                            "signal_meta": meta,
                            "opened_at": datetime.utcnow().isoformat(),
                        }
                        await emit_log("INFO", f"[Paper {session_id}] ENTER {direction.upper()} {symbol} @ {ep:.4f} | TP:{tp:.4f} SL:{sl:.4f}")

        except Exception as e:
            await emit_log("ERROR", f"[Paper {session_id}] Error: {str(e)}")

        await asyncio.sleep(interval_sec)


async def _save_paper_trade(session_id: str, trade: dict):
    if not settings.supabase_url or not settings.supabase_key:
        return
    try:
        from supabase import create_client
        client = create_client(settings.supabase_url, settings.supabase_key)
        client.table("paper_trades").insert({
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
            "opened_at":   trade["opened_at"],
            "closed_at":   trade["closed_at"],
        }).execute()
    except Exception as e:
        await emit_log("ERROR", f"[Paper] DB save failed: {str(e)}")

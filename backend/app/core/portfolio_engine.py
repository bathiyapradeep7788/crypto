"""
Portfolio Engine — runs all 20 coins simultaneously.
Each coin gets its own asyncio task.
One shared balance pool; $100 fixed per trade (or user-configured).
Saves sessions + trades to Supabase.
If demo Binance API keys are set → places real testnet futures orders.
"""
import asyncio
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from app.core.logger import emit_log
from app.services.binance_trader import fetch_recent_klines
from app.services.strategy_engine import get_signal, get_voted_signal
from app.services.filters import trend_direction, in_active_session
from app.services.futures_testnet import setup_symbol, place_order, close_position
from app.config import settings

_INTERVAL_SECONDS = {
    "1m": 60, "3m": 180, "5m": 300, "15m": 900,
    "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400,
}
_CANDLE_LIMIT = 300

# Best strategies per coin (matches frontend COIN_BEST_SETTINGS)
COIN_STRATEGIES: Dict[str, dict] = {
    "OPUSDT":   {"strategies": ["support_resistance", "ichimoku", "volume_momentum"],      "confluence": 1},
    "NEARUSDT": {"strategies": ["volume_momentum", "ichimoku", "bollinger_squeeze"],       "confluence": 1},
    "INJUSDT":  {"strategies": ["volume_momentum", "ichimoku", "bollinger_squeeze"],       "confluence": 1},
    "TIAUSDT":  {"strategies": ["volume_momentum", "ichimoku", "bollinger_squeeze"],       "confluence": 1},
    "LINKUSDT": {"strategies": ["ema_crossover", "volume_momentum", "ichimoku"],           "confluence": 1},
    "SOLUSDT":  {"strategies": ["volume_momentum", "ichimoku", "bollinger_squeeze"],       "confluence": 1},
    "XRPUSDT":  {"strategies": ["ema_crossover", "ichimoku"],                             "confluence": 1},
    "MATICUSDT":{"strategies": ["volume_momentum", "bollinger_squeeze", "fibonacci"],      "confluence": 1},
    "ETHUSDT":  {"strategies": ["bollinger_squeeze", "volume_momentum", "ichimoku"],       "confluence": 2},
    "ATOMUSDT": {"strategies": ["volume_momentum", "ichimoku", "ict_order_block"],         "confluence": 2},
    "BNBUSDT":  {"strategies": ["volume_momentum", "ichimoku", "bollinger_squeeze"],       "confluence": 1},
    "AVAXUSDT": {"strategies": ["volume_momentum", "ema_crossover", "bollinger_squeeze"],  "confluence": 2},
    "ADAUSDT":  {"strategies": ["ema_crossover", "volume_momentum", "support_resistance"], "confluence": 1},
    "ARBUSDT":  {"strategies": ["ichimoku", "volume_momentum", "support_resistance"],      "confluence": 2},
    "DOTUSDT":  {"strategies": ["stoch_rsi_volume", "ema_crossover"],                     "confluence": 1},
    "APTUSDT":  {"strategies": ["volume_momentum", "bollinger_squeeze", "ichimoku"],       "confluence": 2},
    "DOGEUSDT": {"strategies": ["ict_order_block", "volume_momentum", "bollinger_squeeze"],"confluence": 2},
    "LTCUSDT":  {"strategies": ["volume_momentum", "ict_order_block", "bollinger_squeeze"],"confluence": 2},
    "UNIUSDT":  {"strategies": ["ema_crossover", "volume_momentum", "support_resistance"], "confluence": 1},
    "BTCUSDT":  {"strategies": ["support_resistance", "bollinger_squeeze", "fibonacci"],   "confluence": 2},
}

ALL_COINS = list(COIN_STRATEGIES.keys())

# Active portfolio sessions: portfolio_id → session state
_portfolios: Dict[str, dict] = {}


def get_portfolio(pid: str) -> Optional[dict]:
    return _portfolios.get(pid)


def get_all_portfolios() -> Dict[str, dict]:
    return _portfolios


def _db():
    if not settings.supabase_url or not settings.supabase_key:
        return None
    from supabase import create_client
    return create_client(settings.supabase_url, settings.supabase_key)


async def start_portfolio(config: dict) -> str:
    """Start all-coin portfolio session."""
    pid = str(uuid.uuid4())[:8]
    coins      = config.get("coins", ALL_COINS)
    balance    = float(config.get("virtual_balance", 2000.0))
    trade_usdt = float(config.get("trade_usdt", 100.0))
    interval   = config.get("interval", "1h")
    use_demo   = config.get("use_demo_binance", False)

    coin_states: Dict[str, dict] = {}
    for coin in coins:
        coin_states[coin] = {
            "status":       "waiting",   # waiting | open | closed
            "open_position": None,
            "closed_trades": [],
            "wins":  0,
            "losses": 0,
            "pnl_usdt": 0.0,
            "current_price": None,
            "last_signal": None,
            "last_check": None,
        }

    _portfolios[pid] = {
        "portfolio_id":   pid,
        "status":         "running",
        "mode":           "demo" if use_demo else "paper",
        "coins":          coins,
        "coin_states":    coin_states,
        "balance":        balance,
        "initial_balance": balance,
        "trade_usdt":     trade_usdt,
        "interval":       interval,
        "total_pnl_usdt": 0.0,
        "wins":  0,
        "losses": 0,
        "total_trades": 0,
        "started_at":     datetime.utcnow().isoformat(),
        "use_demo_binance": use_demo,
    }

    # Save session to DB
    try:
        db = _db()
        if db:
            db.table("portfolio_sessions").insert({
                "id":              pid,
                "mode":            "demo" if use_demo else "paper",
                "status":          "running",
                "initial_balance": balance,
                "balance":         balance,
                "coins":           coins,
                "use_demo_binance": use_demo,
                "started_at":      datetime.utcnow().isoformat(),
            }).execute()
    except Exception as e:
        await emit_log("ERROR", f"[Portfolio] DB session save failed: {e}")

    await emit_log("INFO", f"[Portfolio {pid}] Started — {len(coins)} coins / {interval} / {'DEMO BINANCE' if use_demo else 'virtual'}")

    # Launch coin tasks
    for coin in coins:
        cfg = {**config, "coin": coin, "portfolio_id": pid}
        asyncio.create_task(_coin_loop(pid, coin, cfg))

    return pid


async def stop_portfolio(pid: str):
    if pid not in _portfolios:
        return
    _portfolios[pid]["status"] = "stopped"
    await emit_log("INFO", f"[Portfolio {pid}] Stopped by user")
    await _update_portfolio_db(pid, "stopped")


async def _update_portfolio_db(pid: str, status: str = "running"):
    p = _portfolios.get(pid)
    if not p:
        return
    try:
        db = _db()
        if db:
            upd = {
                "balance":       round(p["balance"], 2),
                "total_pnl_usdt": round(p["total_pnl_usdt"], 2),
                "wins":          p["wins"],
                "losses":        p["losses"],
                "total_trades":  p["total_trades"],
                "active_positions": sum(
                    1 for cs in p["coin_states"].values() if cs.get("open_position")
                ),
                "status": status,
            }
            if status in ("stopped", "completed"):
                upd["stopped_at"] = datetime.utcnow().isoformat()
            db.table("portfolio_sessions").update(upd).eq("id", pid).execute()
    except Exception as e:
        await emit_log("ERROR", f"[Portfolio] DB update failed: {e}")


async def _save_trade(pid: str, coin: str, trade: dict, strategies: List[str]):
    try:
        db = _db()
        if db:
            db.table("portfolio_trades").insert({
                "portfolio_id":  pid,
                "coin":          coin,
                "direction":     trade["direction"],
                "entry_price":   trade["entry"],
                "exit_price":    trade["exit_price"],
                "tp":            trade["tp"],
                "tp2":           trade["tp2"],
                "sl":            trade["sl"],
                "exit_reason":   trade["exit_reason"],
                "profit_pct":    trade["profit_pct"],
                "profit_usdt":   trade["profit_usdt"],
                "trade_usdt":    trade.get("trade_usdt", 100),
                "strategies":    strategies,
                "binance_order_id": trade.get("binance_order_id"),
                "opened_at":     trade["opened_at"],
                "closed_at":     trade["closed_at"],
            }).execute()
    except Exception as e:
        await emit_log("ERROR", f"[Portfolio] Trade DB save failed: {e}")


async def _coin_loop(pid: str, coin: str, config: dict):
    interval_sec = _INTERVAL_SECONDS.get(config.get("interval", "1h"), 3600)
    trade_usdt   = float(config.get("trade_usdt", 100.0))
    tp_pct       = float(config.get("tp_pct", 2.0))
    tp2_pct      = float(config.get("tp2_pct", 4.0))
    sl_pct       = float(config.get("sl_pct", 1.5))
    use_trend    = config.get("use_trend_filter", True)
    use_session  = config.get("use_session_filter", True)
    use_demo     = config.get("use_demo_binance", False)

    strat_cfg    = COIN_STRATEGIES.get(coin, {"strategies": ["ichimoku"], "confluence": 1})
    strategies   = strat_cfg["strategies"]
    min_conf     = strat_cfg["confluence"]

    # Setup demo Binance symbol (set leverage + margin type)
    if use_demo:
        await setup_symbol(coin, leverage=1)

    while _portfolios.get(pid, {}).get("status") == "running":
        try:
            candles = await fetch_recent_klines(coin, config.get("interval", "1h"), limit=_CANDLE_LIMIT)
            if not candles:
                await asyncio.sleep(30)
                continue

            current_price = candles[-1]["close"]
            now           = candles[-1]["open_time"]
            p             = _portfolios[pid]
            cs            = p["coin_states"][coin]

            cs["current_price"] = current_price
            cs["last_check"]    = datetime.utcnow().isoformat()

            # ── Check open position exit ─────────────────────────────────────
            open_pos = cs["open_position"]
            if open_pos:
                high      = candles[-1]["high"]
                low       = candles[-1]["low"]
                direction = open_pos["direction"]
                entry     = open_pos["entry"]
                tp        = open_pos["tp"]
                tp2       = open_pos["tp2"]
                sl        = open_pos["sl"]

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
                    mult        = 1 if direction == "long" else -1
                    profit_pct  = (exit_price - entry) / entry * 100 * mult
                    profit_usdt = open_pos["trade_usdt"] * profit_pct / 100
                    win         = profit_pct > 0

                    # Close testnet position
                    order_id = None
                    if use_demo:
                        ord = await close_position(coin, direction, open_pos["trade_usdt"], exit_price)
                        order_id = str(ord.get("orderId", ""))

                    # Update balances
                    p["balance"]        += open_pos["trade_usdt"] + profit_usdt
                    p["total_pnl_usdt"] += profit_usdt
                    p["total_trades"]   += 1
                    if win:
                        p["wins"]  += 1; cs["wins"] += 1
                    else:
                        p["losses"] += 1; cs["losses"] += 1
                    cs["pnl_usdt"] += profit_usdt

                    closed = {
                        **open_pos,
                        "exit_price":       round(exit_price, 8),
                        "exit_reason":      exit_reason,
                        "profit_pct":       round(profit_pct, 4),
                        "profit_usdt":      round(profit_usdt, 4),
                        "win":              win,
                        "closed_at":        datetime.utcnow().isoformat(),
                        "binance_order_id": order_id,
                    }
                    cs["closed_trades"].append(closed)
                    cs["open_position"] = None
                    cs["status"]        = "waiting"

                    await emit_log(
                        "INFO" if win else "WARN",
                        f"[Portfolio {pid}] {coin} {exit_reason} @ {exit_price:.4f} | "
                        f"{'WIN' if win else 'LOSS'} {profit_pct:+.2f}% (${profit_usdt:+.2f}) | "
                        f"Balance: ${p['balance']:.0f}"
                    )
                    await _save_trade(pid, coin, closed, strategies)
                    await _update_portfolio_db(pid, "running")

            # ── Look for new entry ───────────────────────────────────────────
            if not cs["open_position"] and p["status"] == "running":
                bal = p["balance"]
                if bal < trade_usdt:
                    cs["status"] = "low_balance"
                    await asyncio.sleep(interval_sec)
                    continue

                if use_session and not in_active_session(now):
                    cs["status"] = "waiting"
                    await asyncio.sleep(interval_sec)
                    continue

                # Get signal
                if min_conf > 1 and len(strategies) > 1:
                    result = get_voted_signal(strategies, {}, candles, min_conf)
                else:
                    result = get_signal(strategies[0], {}, candles, None)

                cs["last_signal"] = result[0] if result else None

                if result:
                    direction, meta = result

                    if use_trend:
                        trend = trend_direction(candles, 200)
                        if trend is not None:
                            if (direction == "long" and trend != "bull") or \
                               (direction == "short" and trend != "bear"):
                                cs["status"] = "waiting"
                                await asyncio.sleep(interval_sec)
                                continue

                    mult = 1 if direction == "long" else -1
                    ep   = current_price
                    tp   = round(ep * (1 + mult * tp_pct  / 100), 8)
                    tp2  = round(ep * (1 + mult * tp2_pct / 100), 8)
                    sl   = round(ep * (1 - mult * sl_pct  / 100), 8)

                    # Reserve balance
                    p["balance"] -= trade_usdt

                    # Place testnet order
                    order_id = None
                    if use_demo:
                        side = "BUY" if direction == "long" else "SELL"
                        ord  = await place_order(coin, side, trade_usdt, ep)
                        order_id = str(ord.get("orderId", ""))

                    cs["open_position"] = {
                        "symbol":    coin,
                        "direction": direction,
                        "entry":     round(ep, 8),
                        "tp": tp, "tp2": tp2, "sl": sl,
                        "trade_usdt": trade_usdt,
                        "signal_meta": meta,
                        "opened_at": datetime.utcnow().isoformat(),
                        "binance_order_id": order_id,
                    }
                    cs["status"] = "open"

                    await emit_log(
                        "INFO",
                        f"[Portfolio {pid}] ENTER {direction.upper()} {coin} @ {ep:.4f} "
                        f"${trade_usdt} | TP:{tp:.4f} SL:{sl:.4f}"
                        + (f" | orderId={order_id}" if order_id else "")
                    )
                else:
                    cs["status"] = "waiting"

        except Exception as e:
            await emit_log("ERROR", f"[Portfolio {pid}] {coin} error: {e}")

        await asyncio.sleep(interval_sec)

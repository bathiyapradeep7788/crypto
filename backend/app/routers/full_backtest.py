"""
Full Backtest router — 20 coins × N months, web-driven with live progress.
POST /full-backtest/start   — start a run
GET  /full-backtest/status  — poll progress
POST /full-backtest/stop    — cancel
DELETE /full-backtest/clear-db — wipe backtest_results
"""
import asyncio, uuid
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from datetime import datetime, timezone

from app.config import settings
from app.core.task_runner import run_backtest_pipeline
from app.models.backtest_request import BacktestRequest
from app.services import job_store

router = APIRouter()

# ── In-memory state ───────────────────────────────────────────────────────────
_state: dict = {
    "status":   "idle",      # idle | running | done | stopped | error
    "job_id":   None,
    "total":    0,
    "done":     0,
    "current":  "",
    "log":      [],          # last 50 lines
    "results":  {},          # coin -> {month -> stat}
    "error":    None,
    "_stop":    False,
}

COIN_BEST_STRATEGIES = {
    "BTCUSDT":   ["support_resistance", "bollinger_squeeze", "fibonacci"],
    "ETHUSDT":   ["bollinger_squeeze", "volume_momentum", "ichimoku"],
    "SOLUSDT":   ["volume_momentum", "ichimoku", "bollinger_squeeze"],
    "BNBUSDT":   ["volume_momentum", "ichimoku", "bollinger_squeeze"],
    "XRPUSDT":   ["ema_crossover", "ichimoku"],
    "ADAUSDT":   ["ema_crossover", "volume_momentum", "support_resistance"],
    "DOGEUSDT":  ["ict_order_block", "volume_momentum", "bollinger_squeeze"],
    "AVAXUSDT":  ["volume_momentum", "ema_crossover", "bollinger_squeeze"],
    "DOTUSDT":   ["stoch_rsi_volume", "ema_crossover"],
    "LINKUSDT":  ["ema_crossover", "volume_momentum", "ichimoku"],
    "NEARUSDT":  ["volume_momentum", "ichimoku", "bollinger_squeeze"],
    "INJUSDT":   ["volume_momentum", "ichimoku", "bollinger_squeeze"],
    "ARBUSDT":   ["ichimoku", "volume_momentum", "support_resistance"],
    "OPUSDT":    ["support_resistance", "ichimoku", "volume_momentum"],
    "APTUSDT":   ["volume_momentum", "bollinger_squeeze", "ichimoku"],
    "ATOMUSDT":  ["volume_momentum", "ichimoku", "ict_order_block"],
    "MATICUSDT": ["volume_momentum", "bollinger_squeeze", "fibonacci"],
    "TIAUSDT":   ["volume_momentum", "ichimoku", "bollinger_squeeze"],
    "LTCUSDT":   ["volume_momentum", "ict_order_block", "bollinger_squeeze"],
    "UNIUSDT":   ["ema_crossover", "volume_momentum", "support_resistance"],
}
ALL_COINS = list(COIN_BEST_STRATEGIES.keys())


def _log(msg: str):
    _state["log"].append(msg)
    if len(_state["log"]) > 100:
        _state["log"] = _state["log"][-100:]


def _months(years: list[int]):
    months = []
    for year in years:
        for m in range(1, 13):
            if m == 12:
                start = datetime(year, 12,  1, tzinfo=timezone.utc)
                end   = datetime(year, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
            else:
                start = datetime(year, m,     1, tzinfo=timezone.utc)
                end   = datetime(year, m + 1, 1, tzinfo=timezone.utc)
            months.append((start, end, f"{year}-{m:02d}"))
    return months


async def _run_one(coin, start, end, tp, sl, interval, trend, session):
    req = BacktestRequest(
        coins=[coin],
        start_dt=start,
        end_dt=end,
        strategies=COIN_BEST_STRATEGIES[coin],
        tp_pct=tp,
        tp2_pct=round(tp * 1.5, 2),
        sl_pct=sl,
        interval=interval,
        use_trend_filter=trend,
        use_session_filter=session,
        min_confluence=1,
    )
    try:
        job_id = str(uuid.uuid4())
        job_store.create_job(job_id, len(req.resolved_strategies()))
        results = await run_backtest_pipeline(job_id, req)
        return results
    except Exception as e:
        _log(f"  ERROR {coin} {start.strftime('%Y-%m')}: {e}")
        return []


def _stat(results):
    wins = losses = 0
    pnl  = 0.0
    for r in results:
        if r["win_loss_rate"] == "Win":
            wins += 1
        else:
            losses += 1
        pnl += r["profit_rate"]
    return {"trades": wins + losses, "wins": wins, "losses": losses, "pnl": round(pnl, 2)}


async def _full_run(job_id, years, tp, sl, interval, trend, session, batch_size):
    _state.update({"status": "running", "job_id": job_id, "_stop": False,
                   "done": 0, "log": [], "results": {}, "error": None})

    months = _months(years)
    _state["total"] = len(ALL_COINS) * len(months)
    _log(f"Starting {_state['total']} calls ({len(ALL_COINS)} coins x {len(months)} months)")

    try:
        for start, end, label in months:
            if _state["_stop"]:
                break
            _log(f"=== {label} ===")
            for i in range(0, len(ALL_COINS), batch_size):
                if _state["_stop"]:
                    break
                batch = ALL_COINS[i:i + batch_size]
                _state["current"] = f"{label} — {', '.join(c.replace('USDT','') for c in batch)}"
                tasks = [_run_one(c, start, end, tp, sl, interval, trend, session) for c in batch]
                batch_res = await asyncio.gather(*tasks, return_exceptions=True)
                for coin, res in zip(batch, batch_res):
                    if isinstance(res, Exception):
                        _log(f"  SKIP {coin}: {res}")
                        res = []
                    stat = _stat(res)
                    if coin not in _state["results"]:
                        _state["results"][coin] = {}
                    _state["results"][coin][label] = stat
                    _state["done"] += 1
                    wr = stat["wins"] / stat["trades"] * 100 if stat["trades"] else 0
                    _log(f"  {coin.replace('USDT',''):<8} {label}  {stat['trades']:4d} trades  {wr:.1f}% WR")

        _state["status"] = "stopped" if _state["_stop"] else "done"
        _log("Complete!" if not _state["_stop"] else "Stopped by user.")
    except Exception as e:
        _state["status"] = "error"
        _state["error"]  = str(e)
        _log(f"FATAL: {e}")


# ── Endpoints ─────────────────────────────────────────────────────────────────
class StartRequest(BaseModel):
    years:      list[int]   = [2024, 2025]
    tp_pct:     float       = 3.0
    sl_pct:     float       = 1.5
    interval:   str         = "15m"
    trend:      bool        = True
    session:    bool        = False
    batch_size: int         = 4
    clear_db:   bool        = True


@router.post("/start")
async def start(req: StartRequest, bg: BackgroundTasks):
    if _state["status"] == "running":
        return {"error": "Already running", "job_id": _state["job_id"]}

    # Optionally clear DB
    if req.clear_db and settings.supabase_url and settings.supabase_key:
        try:
            from supabase import create_client
            db = create_client(settings.supabase_url, settings.supabase_key)
            db.table("backtest_results").delete().neq("id", 0).execute()
            _log("DB cleared.")
        except Exception as e:
            _log(f"DB clear failed: {e}")

    job_id = str(uuid.uuid4())[:8]
    bg.add_task(_full_run, job_id, req.years, req.tp_pct, req.sl_pct,
                req.interval, req.trend, req.session, req.batch_size)
    return {"job_id": job_id, "status": "starting", "total": len(ALL_COINS) * len(req.years) * 12}


@router.get("/status")
def status():
    s = _state
    done    = s["done"]
    total   = s["total"] or 1
    results = s["results"]

    # Build summary rows
    coins_summary = []
    for coin in ALL_COINS:
        monthly = results.get(coin, {})
        if not monthly:
            continue
        all_trades = sum(v["trades"] for v in monthly.values())
        all_wins   = sum(v["wins"]   for v in monthly.values())
        all_pnl    = sum(v["pnl"]    for v in monthly.values())
        wr = all_wins / all_trades * 100 if all_trades else 0
        ev = round((wr / 100 * s.get("tp_pct", 3.0)) - ((1 - wr / 100) * s.get("sl_pct", 1.5)), 3)
        grade = "A" if wr >= 58 else "B" if wr >= 50 else "C" if wr >= 45 else "D" if wr >= 33.4 else "F"
        coins_summary.append({
            "coin":    coin,
            "trades":  all_trades,
            "wins":    all_wins,
            "losses":  all_trades - all_wins,
            "wr":      round(wr, 1),
            "ev":      ev,
            "pnl":     round(all_pnl, 1),
            "grade":   grade,
            "monthly": monthly,
        })

    coins_summary.sort(key=lambda x: x["wr"], reverse=True)

    return {
        "status":   s["status"],
        "job_id":   s["job_id"],
        "done":     done,
        "total":    s["total"],
        "pct":      round(done / total * 100, 1),
        "current":  s["current"],
        "log":      s["log"][-30:],
        "error":    s["error"],
        "coins":    coins_summary,
    }


@router.post("/stop")
def stop():
    _state["_stop"] = True
    return {"status": "stopping"}


@router.delete("/clear-db")
def clear_db_endpoint():
    if not settings.supabase_url or not settings.supabase_key:
        return {"error": "DB not configured"}
    try:
        from supabase import create_client
        db = create_client(settings.supabase_url, settings.supabase_key)
        db.table("backtest_results").delete().neq("id", 0).execute()
        return {"status": "cleared"}
    except Exception as e:
        return {"error": str(e)}

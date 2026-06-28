import uuid
from datetime import datetime
from typing import Optional
from fastapi import BackgroundTasks, APIRouter, Query, HTTPException
from app.models.backtest_request import BacktestRequest
from app.core.task_runner import run_backtest_pipeline
from app.services.strategy_engine import STRATEGY_MAP, get_signal
from app.services.binance_client import fetch_klines
from app.services.trade_simulator import simulate_trade
from app.services.db_writer import bulk_save_trades, save_coin_optimization
from app.config import settings

router = APIRouter()
_active_jobs: dict = {}

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


@router.post("/run")
async def run_backtest(req: BacktestRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    total = max(1, len(req.resolved_strategies())) * len(req.coins)
    _active_jobs[job_id] = {"status": "running", "processed": 0, "total": total}
    background_tasks.add_task(run_backtest_pipeline, job_id, req, _active_jobs)
    return {"job_id": job_id}


@router.get("/status/{job_id}")
async def get_status(job_id: str):
    return _active_jobs.get(job_id, {"status": "not_found"})


@router.get("/best-per-coin")
async def best_per_coin(
    coin: str = Query(..., description="Single coin symbol"),
    start_dt: str = Query(...),
    end_dt: str = Query(...),
    interval: str = Query(default="15m"),
    tp_pct: float = Query(default=2.0),
    tp2_pct: float = Query(default=4.0),
    sl_pct: float = Query(default=1.5),
):
    """Run all 10 strategies for ONE coin. Frontend calls this per-coin to avoid serverless timeout."""
    try:
        start = datetime.fromisoformat(start_dt)
        end = datetime.fromisoformat(end_dt)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO format.")

    candles = await fetch_klines(coin, interval, start, end)
    if not candles or len(candles) < 60:
        return {
            "coin": coin,
            "best_strategy": None,
            "best_strategy_label": None,
            "win_rate": 0,
            "total_pnl_pct": 0,
            "total_trades": 0,
            "all_strategies": [],
            "error": "Insufficient candle data",
        }

    all_strats = []
    window = 60

    for strategy_id in STRATEGY_MAP:
        coin_results = []
        for i in range(window, len(candles)):
            window_candles = candles[max(0, i - window):i + 1]
            signal = get_signal(strategy_id, {}, window_candles)
            if signal is None:
                continue
            direction, _ = signal
            future = candles[i + 1:]
            if not future:
                continue
            result = simulate_trade(candles[i], future, direction, tp_pct, tp2_pct, sl_pct)
            coin_results.append(result)

        total_trades = len(coin_results)
        wins = sum(1 for r in coin_results if r["win_loss_rate"] == "Win")
        total_pnl = sum(r["profit_rate"] for r in coin_results)
        win_rate = (wins / total_trades * 100) if total_trades > 0 else 0.0

        all_strats.append({
            "strategy": strategy_id,
            "strategy_label": STRATEGY_LABELS.get(strategy_id, strategy_id),
            "win_rate": round(win_rate, 2),
            "total_pnl_pct": round(total_pnl, 4),
            "total_trades": total_trades,
        })

    if not all_strats:
        return {"coin": coin, "best_strategy": None, "best_strategy_label": None,
                "win_rate": 0, "total_pnl_pct": 0, "total_trades": 0, "all_strategies": []}

    best = max(all_strats, key=lambda x: (x["win_rate"], x["total_pnl_pct"]))
    return {
        "coin": coin,
        "best_strategy": best["strategy"],
        "best_strategy_label": best["strategy_label"],
        "win_rate": best["win_rate"],
        "total_pnl_pct": best["total_pnl_pct"],
        "total_trades": best["total_trades"],
        "all_strategies": sorted(all_strats, key=lambda x: x["win_rate"], reverse=True),
    }


# ── TP/SL grid used for parameter optimisation ────────────────────────────────
_TP_GRID  = [1.5, 2.0, 2.5, 3.0]
_TP2_GRID = [3.0, 4.0, 5.0]
_SL_GRID  = [1.0, 1.5, 2.0]


@router.get("/optimize-coin")
async def optimize_coin(
    coin: str = Query(..., description="Single coin symbol e.g. BTCUSDT"),
    start_dt: str = Query(...),
    end_dt: str = Query(...),
    interval: str = Query(default="15m"),
    save: bool = Query(default=False, description="Persist results to Supabase"),
):
    """
    Full optimisation for ONE coin:
      1. Run all 10 strategies with default TP/SL → pick winner.
      2. Grid-search TP/SL combos on the winning strategy → pick optimal params.
      3. Re-run with optimal params to collect final trade signals.
      4. Optionally save trades (backtest_results) + summary (coin_best_strategies) to DB.
    Frontend calls this per-coin to stay within the 10-second serverless limit.
    """
    try:
        start = datetime.fromisoformat(start_dt)
        end = datetime.fromisoformat(end_dt)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO format.")

    candles = await fetch_klines(coin, interval, start, end)
    if not candles or len(candles) < 60:
        return {
            "coin": coin, "error": "Insufficient candle data",
            "best_strategy": None, "win_rate": 0, "total_pnl_pct": 0,
            "total_trades": 0, "all_strategies": [],
        }

    window = 60
    D_TP, D_TP2, D_SL = 2.0, 4.0, 1.5

    # ── 1. Find best strategy (default TP/SL) ────────────────────────────────
    all_strats = []
    signal_cache: dict = {}

    for strategy_id in STRATEGY_MAP:
        sigs = []
        for i in range(window, len(candles)):
            sig = get_signal(strategy_id, {}, candles[max(0, i - window): i + 1])
            if sig:
                direction, _ = sig
                sigs.append((candles[i], candles[i + 1:], direction))
        signal_cache[strategy_id] = sigs

        res = [simulate_trade(ec, fc, d, D_TP, D_TP2, D_SL) for ec, fc, d in sigs]
        total = len(res)
        wins = sum(1 for r in res if r["win_loss_rate"] == "Win")
        pnl = sum(r["profit_rate"] for r in res)
        wr = round((wins / total * 100) if total else 0.0, 2)
        all_strats.append({
            "strategy":       strategy_id,
            "strategy_label": STRATEGY_LABELS.get(strategy_id, strategy_id),
            "win_rate":       wr,
            "total_pnl_pct":  round(pnl, 4),
            "total_trades":   total,
        })

    if not all_strats:
        return {"coin": coin, "best_strategy": None, "error": "No signals generated",
                "win_rate": 0, "total_pnl_pct": 0, "total_trades": 0, "all_strategies": []}

    best_strat = max(all_strats, key=lambda x: (x["win_rate"], x["total_pnl_pct"]))
    best_id = best_strat["strategy"]
    sigs = signal_cache[best_id]

    # ── 2. Grid-search TP/SL on best strategy ────────────────────────────────
    opt_tp, opt_tp2, opt_sl = D_TP, D_TP2, D_SL
    opt_wr, opt_pnl = best_strat["win_rate"], best_strat["total_pnl_pct"]

    for tp in _TP_GRID:
        for tp2 in _TP2_GRID:
            if tp2 <= tp:
                continue
            for sl in _SL_GRID:
                res = [simulate_trade(ec, fc, d, tp, tp2, sl) for ec, fc, d in sigs]
                total = len(res)
                wins = sum(1 for r in res if r["win_loss_rate"] == "Win")
                pnl = sum(r["profit_rate"] for r in res)
                wr = round((wins / total * 100) if total else 0.0, 2)
                if (wr, pnl) > (opt_wr, opt_pnl):
                    opt_wr, opt_pnl, opt_tp, opt_tp2, opt_sl = wr, pnl, tp, tp2, sl

    # ── 3. Final run with optimal params ─────────────────────────────────────
    label = STRATEGY_LABELS.get(best_id, best_id)
    final_trades = []
    for ec, fc, direction in sigs:
        r = simulate_trade(ec, fc, direction, opt_tp, opt_tp2, opt_sl)
        r["coin"] = coin
        r["strategy"] = label
        r["complete_calculation"] = {}
        final_trades.append(r)

    # ── 4. Persist ────────────────────────────────────────────────────────────
    if save and final_trades:
        await bulk_save_trades(final_trades)
        await save_coin_optimization({
            "coin":           coin,
            "strategy_id":    best_id,
            "strategy_label": label,
            "tp_pct":         opt_tp,
            "tp2_pct":        opt_tp2,
            "sl_pct":         opt_sl,
            "win_rate":       round(opt_wr, 2),
            "total_pnl_pct":  round(opt_pnl, 4),
            "total_trades":   len(final_trades),
            "start_dt":       start_dt,
            "end_dt":         end_dt,
            "interval":       interval,
            "all_strategies": all_strats,
        })

    return {
        "coin":                coin,
        "best_strategy":       best_id,
        "best_strategy_label": label,
        "optimized_params":    {"tp_pct": opt_tp, "tp2_pct": opt_tp2, "sl_pct": opt_sl},
        "win_rate":            round(opt_wr, 2),
        "total_pnl_pct":       round(opt_pnl, 4),
        "total_trades":        len(final_trades),
        "all_strategies":      sorted(all_strats, key=lambda x: x["win_rate"], reverse=True),
    }


@router.get("/dashboard")
async def get_dashboard():
    """Return latest per-coin optimisation summary from coin_best_strategies table."""
    if not settings.supabase_url or not settings.supabase_key:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    try:
        from supabase import create_client
        client = create_client(settings.supabase_url, settings.supabase_key)
        res = (
            client.table("coin_best_strategies")
            .select("*")
            .order("win_rate", desc=True)
            .execute()
        )
        return {"rows": res.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

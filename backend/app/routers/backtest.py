import uuid
from datetime import datetime
from typing import Optional
from fastapi import BackgroundTasks, APIRouter, Query, HTTPException
from app.models.backtest_request import BacktestRequest
from app.core.task_runner import run_backtest_pipeline
from app.services.strategy_engine import STRATEGY_MAP, get_signal
from app.services.binance_client import fetch_klines
from app.services.trade_simulator import simulate_trade

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
    coins: str = Query(..., description="Comma-separated coin symbols"),
    start_dt: str = Query(...),
    end_dt: str = Query(...),
    interval: str = Query(default="15m"),
    tp_pct: float = Query(default=2.0),
    tp2_pct: float = Query(default=4.0),
    sl_pct: float = Query(default=1.5),
):
    try:
        start = datetime.fromisoformat(start_dt)
        end = datetime.fromisoformat(end_dt)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO format.")

    coin_list = [c.strip() for c in coins.split(",") if c.strip()]
    if not coin_list:
        raise HTTPException(status_code=400, detail="No coins provided")

    results = []

    for coin in coin_list:
        # Fetch candles once per coin
        candles = await fetch_klines(coin, interval, start, end)
        if not candles or len(candles) < 60:
            results.append({
                "coin": coin,
                "best_strategy": None,
                "best_strategy_label": None,
                "win_rate": 0,
                "total_pnl_pct": 0,
                "total_trades": 0,
                "all_strategies": [],
                "error": "Insufficient candle data",
            })
            continue

        all_strats = []
        window = 60

        for strategy_id, strategy_cls in STRATEGY_MAP.items():
            coin_results = []
            for i in range(window, len(candles)):
                window_candles = candles[max(0, i - window):i + 1]
                signal = get_signal(strategy_id, {}, window_candles)
                if signal is None:
                    continue
                direction, meta = signal
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
            results.append({
                "coin": coin,
                "best_strategy": None,
                "best_strategy_label": None,
                "win_rate": 0,
                "total_pnl_pct": 0,
                "total_trades": 0,
                "all_strategies": [],
            })
            continue

        best = max(all_strats, key=lambda x: (x["win_rate"], x["total_pnl_pct"]))
        results.append({
            "coin": coin,
            "best_strategy": best["strategy"],
            "best_strategy_label": best["strategy_label"],
            "win_rate": best["win_rate"],
            "total_pnl_pct": best["total_pnl_pct"],
            "total_trades": best["total_trades"],
            "all_strategies": sorted(all_strats, key=lambda x: x["win_rate"], reverse=True),
        })

    return {"results": results}

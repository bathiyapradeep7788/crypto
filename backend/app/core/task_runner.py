import asyncio
from app.models.backtest_request import BacktestRequest
from app.services.binance_client import fetch_klines
from app.services.strategy_engine import get_signal
from app.services.trade_simulator import simulate_trade
from app.services.db_writer import save_trade
from app.core.logger import emit_log

async def run_backtest_pipeline(job_id: str, req: BacktestRequest, jobs: dict):
    all_results = []
    params = {p.key: p.value for p in req.params}
    strategy_label = req.strategy_primary
    if req.strategy_secondary:
        strategy_label += f" + {req.strategy_secondary}"

    try:
        for idx, coin in enumerate(req.coins):
            await emit_log("INFO", f"[{job_id}] Starting {coin} ({idx+1}/{len(req.coins)})")

            candles = await fetch_klines(coin, req.interval, req.start_dt, req.end_dt)
            if not candles:
                await emit_log("WARN", f"[{job_id}] No candles for {coin} — skipping")
                continue

            window = 60  # minimum candles needed before checking signals
            coin_results = []

            for i in range(window, len(candles)):
                window_candles = candles[max(0, i - window):i + 1]
                signal = get_signal(
                    req.strategy_primary,
                    params,
                    window_candles,
                    req.strategy_secondary,
                )
                if signal is None:
                    continue

                direction, meta = signal
                future = candles[i + 1:]
                if not future:
                    continue

                result = simulate_trade(
                    candles[i], future,
                    direction, req.tp_pct, req.tp2_pct, req.sl_pct
                )
                result["coin"]                 = coin
                result["strategy"]             = strategy_label
                result["complete_calculation"] = meta

                await save_trade(result)
                coin_results.append(result)

            wins   = sum(1 for r in coin_results if r["win_loss_rate"] == "Win")
            losses = sum(1 for r in coin_results if r["win_loss_rate"] == "Loss")
            await emit_log("INFO", f"[{job_id}] {coin} done — {wins}W / {losses}L from {len(coin_results)} signals")

            all_results.extend(coin_results)
            jobs[job_id]["processed"] = idx + 1

        jobs[job_id]["status"]  = "done"
        jobs[job_id]["results"] = _serialize(all_results)
        await emit_log("INFO", f"[{job_id}] Backtest complete — {len(all_results)} total trades")

    except Exception as e:
        jobs[job_id]["status"] = "error"
        await emit_log("ERROR", f"[{job_id}] Pipeline crashed: {str(e)}")


def _serialize(results):
    out = []
    for r in results:
        row = dict(r)
        if hasattr(row.get("signal_date_time"), "isoformat"):
            row["signal_date_time"] = row["signal_date_time"].isoformat()
        if hasattr(row.get("end_time"), "isoformat"):
            row["end_time"] = row["end_time"].isoformat()
        out.append(row)
    return out

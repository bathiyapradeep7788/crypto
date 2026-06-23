import asyncio
from app.models.backtest_request import BacktestRequest
from app.services.binance_client import fetch_klines
from app.services.strategy_engine import get_signal, STRATEGY_MAP
from app.services.combined_store import COMBO_PREFIX, get_combined
from app.services.trade_simulator import simulate_trade
from app.services.db_writer import save_trades
from app.services import job_store
from app.core.logger import emit_log


def _strategy_label(strategy_id: str, secondary_id: str = None) -> str:
    """Human-friendly label stored on each trade row."""
    if strategy_id.startswith(COMBO_PREFIX):
        combo = get_combined(strategy_id[len(COMBO_PREFIX):])
        if combo:
            return f"{combo['name']} ({combo['strategy_a']} + {combo['strategy_b']})"
        return strategy_id
    label = strategy_id
    if secondary_id:
        label += f" + {secondary_id}"
    return label


async def run_backtest_pipeline(job_id: str, req: BacktestRequest):
    all_results = []
    params = {p.key: p.value for p in req.params}

    strategies = req.resolved_strategies()
    if not strategies:
        job_store.finish_job(job_id, "error")
        await emit_log("ERROR", f"[{job_id}] No strategies selected")
        return

    # Total work units = strategies × coins (drives the progress bar).
    total = len(strategies) * len(req.coins)
    processed = 0
    job_store.update_progress(job_id, 0, total)

    # Pre-fetch candles once per coin so every strategy reuses them.
    candle_cache: dict = {}

    try:
        for s_idx, strategy_id in enumerate(strategies):
            label = _strategy_label(strategy_id, req.strategy_secondary)
            await emit_log("INFO", f"[{job_id}] Strategy {s_idx+1}/{len(strategies)}: {label}")

            for coin in req.coins:
                if coin not in candle_cache:
                    candle_cache[coin] = await fetch_klines(
                        coin, req.interval, req.start_dt, req.end_dt
                    )
                candles = candle_cache[coin]

                if not candles:
                    await emit_log("WARN", f"[{job_id}] No candles for {coin} — skipping")
                    processed += 1
                    if processed % 5 == 0:
                        job_store.update_progress(job_id, processed, total)
                    continue

                window = 60  # minimum candles needed before checking signals
                coin_results = []

                for i in range(window, len(candles)):
                    window_candles = candles[max(0, i - window):i + 1]
                    signal = get_signal(
                        strategy_id,
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
                    result["strategy"]             = label
                    result["complete_calculation"] = meta

                    coin_results.append(result)

                # One bulk insert per coin instead of one round-trip per trade.
                await save_trades(coin_results)

                wins   = sum(1 for r in coin_results if r["win_loss_rate"] == "Win")
                losses = sum(1 for r in coin_results if r["win_loss_rate"] == "Loss")
                await emit_log("INFO", f"[{job_id}] {label} · {coin} — {wins}W / {losses}L from {len(coin_results)} signals")

                all_results.extend(coin_results)
                processed += 1
                if processed % 5 == 0:
                    job_store.update_progress(job_id, processed, total)

        serialized = _serialize(all_results)
        job_store.finish_job(job_id, "done", serialized)
        await emit_log("INFO", f"[{job_id}] Backtest complete — {len(all_results)} total trades across {len(strategies)} strategies")
        return serialized

    except Exception as e:
        job_store.finish_job(job_id, "error")
        await emit_log("ERROR", f"[{job_id}] Pipeline crashed: {str(e)}")
        return []


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

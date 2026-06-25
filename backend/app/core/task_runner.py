import asyncio
from app.models.backtest_request import BacktestRequest
from app.services.binance_client import fetch_klines
from app.services.strategy_engine import get_signal, get_voted_signal, STRATEGY_MAP
from app.services.combined_store import COMBO_PREFIX, get_combined, members_of
from app.services.trade_simulator import simulate_trade
from app.services.filters import trend_direction, in_active_session, compute_atr
from app.services.db_writer import save_trades
from app.services import job_store
from app.core.logger import emit_log, flush_to_db


def _strategy_label(strategy_id: str, secondary_id: str = None) -> str:
    if strategy_id.startswith(COMBO_PREFIX):
        combo = get_combined(strategy_id[len(COMBO_PREFIX):])
        if combo:
            return f"{combo['name']} ({' + '.join(members_of(combo))})"
        return strategy_id
    label = strategy_id
    if secondary_id:
        label += f" + {secondary_id}"
    return label


def _active_filters(req: BacktestRequest) -> list:
    active = []
    if req.use_trend_filter:
        active.append(f"TrendEMA{req.trend_ema_period}")
    if req.use_session_filter:
        active.append("SessionUTC8-20")
    if req.use_atr_tp_sl:
        active.append(f"ATR-TP/SL({req.atr_tp_mult}x/{req.atr_sl_mult}x)")
    return active


async def run_backtest_pipeline(job_id: str, req: BacktestRequest):
    all_results = []
    params = {p.key: p.value for p in req.params}
    strategies = req.resolved_strategies()

    if not strategies:
        job_store.finish_job(job_id, "error")
        await emit_log("ERROR", f"[{job_id}] No strategies selected")
        return

    filters = _active_filters(req)
    if filters:
        await emit_log("INFO", f"[{job_id}] Smart filters active: {', '.join(filters)}")

    use_voting = req.min_confluence > 1 and len(strategies) > 1

    if use_voting:
        voting_label = f"Vote≥{req.min_confluence} ({'+'.join(strategies)})"
        total = len(req.coins)
        await emit_log("INFO", f"[{job_id}] Voting mode: min {req.min_confluence}/{len(strategies)} strategies must agree")
    else:
        total = max(1, len(strategies)) * len(req.coins)

    processed = 0
    job_store.update_progress(job_id, 0, total)
    candle_cache: dict = {}

    try:
        if use_voting:
            # ── Voting mode: all strategies vote per candle, N must agree ──────
            for coin in req.coins:
                if coin not in candle_cache:
                    candle_cache[coin] = await fetch_klines(
                        coin, req.interval, req.start_dt, req.end_dt
                    )
                candles = candle_cache[coin]

                if not candles:
                    await emit_log("WARN", f"[{job_id}] No candles for {coin} — skipping")
                    processed += 1
                    job_store.update_progress(job_id, processed, total)
                    continue

                window = 60
                coin_results = []

                for i in range(window, len(candles)):
                    candle_time = candles[i]["open_time"]

                    if req.use_session_filter and not in_active_session(candle_time):
                        continue

                    window_candles = candles[max(0, i - window):i + 1]

                    signal = get_voted_signal(strategies, params, window_candles, req.min_confluence)
                    if signal is None:
                        continue

                    direction, meta = signal

                    if req.use_trend_filter:
                        trend = trend_direction(window_candles, req.trend_ema_period)
                        if trend is not None:
                            if (direction == "long" and trend != "bull") or \
                               (direction == "short" and trend != "bear"):
                                continue

                    future = candles[i + 1:]
                    if not future:
                        continue

                    atr_val = compute_atr(window_candles) if req.use_atr_tp_sl else None

                    result = simulate_trade(
                        candles[i], future, direction,
                        req.tp_pct, req.tp2_pct, req.sl_pct,
                        atr=atr_val, atr_tp_mult=req.atr_tp_mult, atr_sl_mult=req.atr_sl_mult,
                    )
                    result["coin"]                 = coin
                    result["strategy"]             = voting_label
                    result["complete_calculation"] = meta
                    result["params"]               = params
                    coin_results.append(result)

                await save_trades(coin_results)
                wins   = sum(1 for r in coin_results if r["win_loss_rate"] == "Win")
                losses = sum(1 for r in coin_results if r["win_loss_rate"] == "Loss")
                await emit_log(
                    "INFO",
                    f"[{job_id}] {voting_label} · {coin} — {wins}W / {losses}L from {len(coin_results)} signals",
                )
                all_results.extend(coin_results)
                processed += 1
                job_store.update_progress(job_id, processed, total)

        else:
            # ── Normal mode: one strategy at a time (original behaviour) ────────
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

                    window = 60
                    coin_results = []

                    for i in range(window, len(candles)):
                        candle_time = candles[i]["open_time"]

                        if req.use_session_filter and not in_active_session(candle_time):
                            continue

                        window_candles = candles[max(0, i - window):i + 1]

                        signal = get_signal(
                            strategy_id, params, window_candles, req.strategy_secondary
                        )
                        if signal is None:
                            continue

                        direction, meta = signal

                        if req.use_trend_filter:
                            trend = trend_direction(window_candles, req.trend_ema_period)
                            if trend is not None:
                                if (direction == "long" and trend != "bull") or \
                                   (direction == "short" and trend != "bear"):
                                    continue

                        future = candles[i + 1:]
                        if not future:
                            continue

                        atr_val = compute_atr(window_candles) if req.use_atr_tp_sl else None

                        result = simulate_trade(
                            candles[i], future, direction,
                            req.tp_pct, req.tp2_pct, req.sl_pct,
                            atr=atr_val, atr_tp_mult=req.atr_tp_mult, atr_sl_mult=req.atr_sl_mult,
                        )
                        result["coin"]                 = coin
                        result["strategy"]             = label
                        result["complete_calculation"] = meta
                        result["params"]               = params
                        coin_results.append(result)

                    await save_trades(coin_results)
                    wins   = sum(1 for r in coin_results if r["win_loss_rate"] == "Win")
                    losses = sum(1 for r in coin_results if r["win_loss_rate"] == "Loss")
                    await emit_log(
                        "INFO",
                        f"[{job_id}] {label} · {coin} — {wins}W / {losses}L from {len(coin_results)} signals",
                    )
                    all_results.extend(coin_results)
                    processed += 1
                    if processed % 5 == 0:
                        job_store.update_progress(job_id, processed, total)

        serialized = _serialize(all_results)
        job_store.finish_job(job_id, "done", serialized)
        filter_note = f" [filters: {', '.join(filters)}]" if filters else ""
        await emit_log(
            "INFO",
            f"[{job_id}] Backtest complete — {len(all_results)} total trades "
            f"across {len(strategies)} strategies{filter_note}",
        )
        flush_to_db()
        return serialized

    except Exception as e:
        job_store.finish_job(job_id, "error")
        await emit_log("ERROR", f"[{job_id}] Pipeline crashed: {str(e)}")
        flush_to_db()
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

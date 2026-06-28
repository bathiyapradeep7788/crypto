from app.config import settings
from app.core.logger import emit_log


def _ts(val) -> str:
    return val.isoformat() if hasattr(val, "isoformat") else str(val)


async def save_trade(trade: dict):
    if not settings.supabase_url or not settings.supabase_key:
        await emit_log("WARN", "Supabase not configured — skipping DB write")
        return

    try:
        from supabase import create_client
        client = create_client(settings.supabase_url, settings.supabase_key)

        data = {
            "coin":                 trade.get("coin", ""),
            "strategy":             trade.get("strategy", ""),
            "complete_calculation": trade.get("complete_calculation", {}),
            "signal_date_time":     _ts(trade["signal_date_time"]),
            "entry":                trade["entry"],
            "tp":                   trade["tp"],
            "tp2":                  trade["tp2"],
            "sl":                   trade["sl"],
            "end_time":             _ts(trade["end_time"]),
            "end_position":         trade["end_position"],
            "win_loss_rate":        trade["win_loss_rate"],
            "profit_rate":          trade["profit_rate"],
        }

        client.table("backtest_results").insert(data).execute()
        await emit_log("INFO", f"Saved trade: {trade['coin']} {trade['end_position']}")

    except Exception as e:
        await emit_log("ERROR", f"DB write failed: {str(e)}")


async def bulk_save_trades(trades: list):
    """Batch-insert trade signals into backtest_results (much faster than one-by-one)."""
    if not settings.supabase_url or not settings.supabase_key or not trades:
        return
    try:
        from supabase import create_client
        client = create_client(settings.supabase_url, settings.supabase_key)
        rows = [
            {
                "coin":                 t.get("coin", ""),
                "strategy":             t.get("strategy", ""),
                "complete_calculation": t.get("complete_calculation", {}),
                "signal_date_time":     _ts(t["signal_date_time"]),
                "entry":                t["entry"],
                "tp":                   t["tp"],
                "tp2":                  t["tp2"],
                "sl":                   t["sl"],
                "end_time":             _ts(t["end_time"]),
                "end_position":         t["end_position"],
                "win_loss_rate":        t["win_loss_rate"],
                "profit_rate":          t["profit_rate"],
            }
            for t in trades
        ]
        client.table("backtest_results").insert(rows).execute()
        await emit_log("INFO", f"Bulk saved {len(rows)} trades for {trades[0].get('coin','?')}")
    except Exception as e:
        await emit_log("ERROR", f"Bulk DB write failed: {str(e)}")


async def save_coin_optimization(data: dict):
    """Upsert per-coin best strategy + optimized TP/SL into coin_best_strategies."""
    if not settings.supabase_url or not settings.supabase_key:
        return
    try:
        from supabase import create_client
        client = create_client(settings.supabase_url, settings.supabase_key)
        client.table("coin_best_strategies").upsert(
            {
                "coin":           data["coin"],
                "strategy_id":    data["strategy_id"],
                "strategy_label": data["strategy_label"],
                "tp_pct":         data["tp_pct"],
                "tp2_pct":        data["tp2_pct"],
                "sl_pct":         data["sl_pct"],
                "win_rate":       data["win_rate"],
                "total_pnl_pct":  data["total_pnl_pct"],
                "total_trades":   data["total_trades"],
                "start_dt":       data["start_dt"],
                "end_dt":         data["end_dt"],
                "interval":       data["interval"],
                "all_strategies": data["all_strategies"],
                "updated_at":     "now()",
            },
            on_conflict="coin",
        ).execute()
        await emit_log("INFO", f"Saved optimization result for {data['coin']}: {data['strategy_label']} WR={data['win_rate']}%")
    except Exception as e:
        await emit_log("ERROR", f"save_coin_optimization failed: {str(e)}")

from app.config import settings
from app.core.logger import emit_log


def _row(trade: dict) -> dict:
    return {
        "coin":                 trade.get("coin", ""),
        "strategy":             trade.get("strategy", ""),
        "complete_calculation": trade.get("complete_calculation", {}),
        "signal_date_time":     trade["signal_date_time"].isoformat(),
        "entry":                trade["entry"],
        "tp":                   trade["tp"],
        "tp2":                  trade["tp2"],
        "sl":                   trade["sl"],
        "end_time":             trade["end_time"].isoformat(),
        "end_position":         trade["end_position"],
        "win_loss_rate":        trade["win_loss_rate"],
        "profit_rate":          trade["profit_rate"],
        "params":               trade.get("params", {}),
    }


async def save_trade(trade: dict):
    await save_trades([trade])


async def save_trades(trades: list):
    """Bulk-insert trades in one round-trip.

    Per-trade inserts were the backtest bottleneck — strategies that fire many
    signals (e.g. Bollinger ~150/coin) each did a separate Supabase round-trip
    (~150 × 250ms ≈ 40s). One bulk insert per batch keeps it to a single call.
    """
    if not trades:
        return
    if not settings.supabase_url or not settings.supabase_key:
        await emit_log("WARN", "Supabase not configured — skipping DB write")
        return

    try:
        from supabase import create_client
        client = create_client(settings.supabase_url, settings.supabase_key)
        client.table("backtest_results").insert([_row(t) for t in trades]).execute()
    except Exception as e:
        await emit_log("ERROR", f"DB write failed: {str(e)}")

from app.config import settings
from app.core.logger import emit_log

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
            "signal_date_time":     trade["signal_date_time"].isoformat(),
            "entry":                trade["entry"],
            "tp":                   trade["tp"],
            "tp2":                  trade["tp2"],
            "sl":                   trade["sl"],
            "end_time":             trade["end_time"].isoformat(),
            "end_position":         trade["end_position"],
            "win_loss_rate":        trade["win_loss_rate"],
            "profit_rate":          trade["profit_rate"],
        }

        client.table("backtest_results").insert(data).execute()
        await emit_log("INFO", f"Saved trade: {trade['coin']} {trade['end_position']}")

    except Exception as e:
        await emit_log("ERROR", f"DB write failed: {str(e)}")

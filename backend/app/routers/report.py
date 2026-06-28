from fastapi import APIRouter, HTTPException, Query
from app.config import settings
from datetime import datetime

router = APIRouter()


def _get_client():
    if not settings.supabase_url or not settings.supabase_key:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    from supabase import create_client
    return create_client(settings.supabase_url, settings.supabase_key)


@router.get("/coin")
async def get_coin_report(
    coin: str = Query(...),
    start_dt: str = Query(...),
    end_dt: str = Query(...),
):
    try:
        start = datetime.fromisoformat(start_dt)
        end   = datetime.fromisoformat(end_dt)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO format.")

    client = _get_client()

    # ── Backtest results ──────────────────────────────────────
    try:
        bt_res = (
            client.table("backtest_results")
            .select("*")
            .eq("coin", coin)
            .gte("created_at", start.isoformat())
            .lte("created_at", end.isoformat())
            .execute()
        )
        bt_rows = bt_res.data or []
    except Exception:
        bt_rows = []

    # ── Monitor trades ────────────────────────────────────────
    try:
        mt_res = (
            client.table("monitor_trades")
            .select("*")
            .eq("coin", coin)
            .gte("created_at", start.isoformat())
            .lte("created_at", end.isoformat())
            .execute()
        )
        mt_rows = mt_res.data or []
    except Exception:
        mt_rows = []

    # ── Paper trades ──────────────────────────────────────────
    try:
        pt_res = (
            client.table("paper_trades")
            .select("*")
            .eq("coin", coin)
            .gte("created_at", start.isoformat())
            .lte("created_at", end.isoformat())
            .execute()
        )
        pt_rows = pt_res.data or []
    except Exception:
        pt_rows = []

    # ── Live trades ───────────────────────────────────────────
    try:
        lt_res = (
            client.table("live_trades")
            .select("*")
            .eq("coin", coin)
            .gte("created_at", start.isoformat())
            .lte("created_at", end.isoformat())
            .execute()
        )
        lt_rows = lt_res.data or []
    except Exception:
        lt_rows = []

    # ── Backtest summary ──────────────────────────────────────
    bt_wins  = sum(1 for r in bt_rows if r.get("win_loss_rate") == "Win")
    bt_total = len(bt_rows)
    bt_pnl   = sum(r.get("profit_rate", 0) for r in bt_rows)
    bt_wr    = round(bt_wins / bt_total * 100, 2) if bt_total else 0

    # Group by strategy
    strat_map: dict = {}
    for r in bt_rows:
        s = r.get("strategy", "unknown")
        if s not in strat_map:
            strat_map[s] = {"wins": 0, "total": 0, "pnl": 0.0}
        strat_map[s]["total"] += 1
        strat_map[s]["pnl"]   += r.get("profit_rate", 0)
        if r.get("win_loss_rate") == "Win":
            strat_map[s]["wins"] += 1

    by_strategy = [
        {
            "strategy": s,
            "trades":   v["total"],
            "win_rate": round(v["wins"] / v["total"] * 100, 2) if v["total"] else 0,
            "pnl":      round(v["pnl"], 4),
        }
        for s, v in sorted(strat_map.items(), key=lambda x: x[1]["wins"] / max(x[1]["total"], 1), reverse=True)
    ]

    best_strategy = by_strategy[0]["strategy"] if by_strategy else None

    backtest_summary = {
        "total_trades": bt_total,
        "win_rate":     bt_wr,
        "total_pnl_pct": round(bt_pnl, 4),
        "best_strategy": best_strategy,
        "by_strategy":   by_strategy,
    }

    # ── Paper summary ─────────────────────────────────────────
    def _trade_summary(rows, pnl_field="profit_pct", usdt_field="profit_usdt", win_field="win"):
        total  = len(rows)
        wins   = sum(1 for r in rows if r.get(win_field))
        pnl_u  = sum(r.get(usdt_field, 0) or 0 for r in rows)
        wr     = round(wins / total * 100, 2) if total else 0
        return {"total_trades": total, "win_rate": wr, "total_pnl_usdt": round(pnl_u, 4)}

    paper_summary   = _trade_summary(pt_rows)
    live_summary    = _trade_summary(lt_rows)
    monitor_summary = _trade_summary(mt_rows)

    # ── Text report ───────────────────────────────────────────
    lines = [
        f"=== COIN REPORT: {coin} ===",
        f"Period: {start_dt} → {end_dt}",
        "",
        "--- BACKTEST SUMMARY ---",
        f"  Total Trades : {bt_total}",
        f"  Win Rate     : {bt_wr}%",
        f"  Total PnL    : {round(bt_pnl, 4)}%",
        f"  Best Strategy: {best_strategy or 'N/A'}",
    ]
    if by_strategy:
        lines.append("  Strategy Breakdown:")
        for s in by_strategy:
            lines.append(f"    {s['strategy']}: {s['trades']} trades, {s['win_rate']}% WR, {s['pnl']}% PnL")
    lines += [
        "",
        "--- PAPER TRADE SUMMARY ---",
        f"  Total Trades : {paper_summary['total_trades']}",
        f"  Win Rate     : {paper_summary['win_rate']}%",
        f"  Total PnL    : ${paper_summary['total_pnl_usdt']}",
        "",
        "--- LIVE TRADE SUMMARY ---",
        f"  Total Trades : {live_summary['total_trades']}",
        f"  Win Rate     : {live_summary['win_rate']}%",
        f"  Total PnL    : ${live_summary['total_pnl_usdt']}",
        "",
        "--- MONITOR TRADE SUMMARY ---",
        f"  Total Trades : {monitor_summary['total_trades']}",
        f"  Win Rate     : {monitor_summary['win_rate']}%",
        f"  Total PnL    : ${monitor_summary['total_pnl_usdt']}",
    ]
    text_report = "\n".join(lines)

    return {
        "coin": coin,
        "period": {"start": start_dt, "end": end_dt},
        "backtest_summary": backtest_summary,
        "paper_summary":    paper_summary,
        "live_summary":     live_summary,
        "monitor_summary":  monitor_summary,
        "text_report":      text_report,
    }

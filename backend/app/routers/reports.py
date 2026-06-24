"""
Per-coin strategy performance reports built from backtest_results.

For a coin, aggregates every strategy that was backtested on it — win rate,
PnL, trade counts — ranks them, finds the best-performing parameter set per
strategy, and renders a downloadable text report. This is what tells the user
which strategy + parameters to auto-trade each coin with.
"""
import json
from collections import defaultdict
from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from app.config import settings

router = APIRouter()

MIN_TRADES = 5  # ignore strategies with too few trades when recommending


def _client():
    if not settings.supabase_url or not settings.supabase_key:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    from supabase import create_client
    return create_client(settings.supabase_url, settings.supabase_key)


def _fetch_rows(coin: str) -> list:
    client = _client()
    rows, offset, page = [], 0, 1000
    while True:
        res = (client.table("backtest_results").select("*")
               .eq("coin", coin).range(offset, offset + page - 1).execute())
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


def _agg(trades: list) -> dict:
    n = len(trades)
    wins = sum(1 for t in trades if t.get("win_loss_rate") == "Win")
    losses = n - wins
    pnls = [float(t.get("profit_rate") or 0) for t in trades]
    total = sum(pnls)
    return {
        "trades": n,
        "wins": wins,
        "losses": losses,
        "win_rate": round(wins / n * 100, 1) if n else 0.0,
        "total_pnl": round(total, 2),
        "avg_pnl": round(total / n, 3) if n else 0.0,
        "best_trade": round(max(pnls), 2) if pnls else 0.0,
        "worst_trade": round(min(pnls), 2) if pnls else 0.0,
    }


def _analyze(coin: str) -> dict:
    rows = _fetch_rows(coin)
    by_strategy: dict = defaultdict(list)
    for r in rows:
        by_strategy[r.get("strategy", "?")].append(r)

    strategies = []
    for name, trades in by_strategy.items():
        stat = _agg(trades)
        # best parameter set within this strategy
        by_params: dict = defaultdict(list)
        for t in trades:
            by_params[json.dumps(t.get("params") or {}, sort_keys=True)].append(t)
        param_variants = []
        for pkey, ptrades in by_params.items():
            ps = _agg(ptrades)
            ps["params"] = json.loads(pkey)
            param_variants.append(ps)
        param_variants.sort(key=lambda x: (x["win_rate"], x["total_pnl"]), reverse=True)
        stat["name"] = name
        stat["best_params"] = param_variants[0] if param_variants else None
        stat["param_variants"] = param_variants
        strategies.append(stat)

    # Rank: prefer strategies with enough trades, then win_rate, then total_pnl.
    def score(s):
        eligible = s["trades"] >= MIN_TRADES
        return (1 if eligible else 0, s["win_rate"], s["total_pnl"])
    strategies.sort(key=score, reverse=True)

    return {
        "coin": coin,
        "total_trades": len(rows),
        "strategies": strategies,
        "recommended": strategies[0] if strategies else None,
    }


@router.get("/coins")
async def report_coins():
    client = _client()
    # Paginate — a single query is capped at ~1000 rows by PostgREST.
    coins: set = set()
    offset, page = 0, 1000
    while offset < 50000:
        res = client.table("backtest_results").select("coin").range(offset, offset + page - 1).execute()
        batch = res.data or []
        for r in batch:
            if r.get("coin"):
                coins.add(r["coin"])
        if len(batch) < page:
            break
        offset += page
    return {"coins": sorted(coins)}


@router.get("/coin/{coin}")
async def report_coin(coin: str):
    return _analyze(coin)


@router.get("/coin/{coin}/text", response_class=PlainTextResponse)
async def report_coin_text(coin: str):
    a = _analyze(coin)
    if not a["strategies"]:
        return f"No backtest data for {coin}. Run a backtest first."

    L = []
    L.append("=" * 60)
    L.append(f"  STRATEGY PERFORMANCE REPORT — {coin}")
    L.append(f"  Total trades analysed: {a['total_trades']}")
    L.append("=" * 60)
    L.append("")
    rec = a["recommended"]
    if rec:
        L.append(f"RECOMMENDED STRATEGY:  {rec['name']}")
        L.append(f"  Win rate {rec['win_rate']}%  |  Net PnL {rec['total_pnl']}%  "
                 f"|  {rec['wins']}W/{rec['losses']}L over {rec['trades']} trades")
        if rec.get("best_params") and rec["best_params"].get("params"):
            L.append(f"  Best parameters: {json.dumps(rec['best_params']['params'])}")
            bp = rec["best_params"]
            L.append(f"    → with these params: {bp['win_rate']}% win, {bp['total_pnl']}% PnL "
                     f"({bp['trades']} trades)")
        L.append("")
    L.append("-" * 60)
    L.append("ALL STRATEGIES (ranked best → worst)")
    L.append("-" * 60)
    for i, s in enumerate(a["strategies"], 1):
        L.append(f"{i}. {s['name']}")
        L.append(f"   Trades {s['trades']} | Win {s['win_rate']}% ({s['wins']}W/{s['losses']}L) "
                 f"| Net PnL {s['total_pnl']}% | Avg {s['avg_pnl']}% "
                 f"| Best {s['best_trade']}% | Worst {s['worst_trade']}%")
        if len(s.get("param_variants", [])) > 1:
            L.append(f"   Param sets tested: {len(s['param_variants'])} "
                     f"(best: {json.dumps(s['best_params']['params'])})")
    L.append("")
    L.append("=" * 60)
    L.append("Note: recommendation favours strategies with >= "
             f"{MIN_TRADES} trades, then highest win rate, then PnL.")
    L.append("=" * 60)
    return "\n".join(L)

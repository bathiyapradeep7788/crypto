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

# Textbook default parameters per built-in strategy — used to show concrete
# parameter values in reports for runs that used the standard settings (those
# trades were saved with an empty params object before per-trade params existed).
STRATEGY_DEFAULTS = {
    "rsi_macd": {"rsi_period": 14, "rsi_overbought": 70, "rsi_oversold": 30,
                 "macd_fast": 12, "macd_slow": 26, "macd_signal": 9},
    "ema_crossover": {"ema_fast": 21, "ema_slow": 55},
    "bollinger_squeeze": {"bb_period": 20, "bb_std": 2.0},
    "vwap_mean_reversion": {"vwap_deviation": 0.5},
    "support_resistance": {"sr_tolerance": 0.3},
    "ichimoku": {"tenkan": 9, "kijun": 26},
    "stoch_rsi_volume": {"stoch_overbought": 80, "stoch_oversold": 20},
    "ict_order_block": {},
    "fibonacci": {"fib_tolerance": 0.3},
    "volume_momentum": {"vol_spike_mult": 2.0},
}


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
    # How exits resolved — did price reach TP1, run all the way to TP2, or stop out?
    tp1 = sum(1 for t in trades if t.get("end_position") == "Hit TP1")
    tp2 = sum(1 for t in trades if t.get("end_position") == "Hit TP2")
    sl = sum(1 for t in trades if t.get("end_position") == "Hit SL")
    expired = n - tp1 - tp2 - sl
    return {
        "trades": n,
        "wins": wins,
        "losses": losses,
        "win_rate": round(wins / n * 100, 1) if n else 0.0,
        "total_pnl": round(total, 2),
        "avg_pnl": round(total / n, 3) if n else 0.0,
        "best_trade": round(max(pnls), 2) if pnls else 0.0,
        "worst_trade": round(min(pnls), 2) if pnls else 0.0,
        "tp1": tp1,
        "tp2": tp2,
        "sl": sl,
        "expired": expired,
        "tp2_rate": round(tp2 / n * 100, 1) if n else 0.0,
    }


def _analyze(coin: str) -> dict:
    rows = _fetch_rows(coin)
    by_strategy: dict = defaultdict(list)
    for r in rows:
        by_strategy[r.get("strategy", "?")].append(r)

    strategies = []
    for name, trades in by_strategy.items():
        stat = _agg(trades)
        # Balanced quality score: win-rate-weighted PnL — rewards strategies
        # that both win often AND make money. (win_rate fraction × total PnL)
        stat_score = round(stat["win_rate"] / 100 * stat["total_pnl"], 2)
        stat["score"] = stat_score
        # best parameter set within this strategy
        by_params: dict = defaultdict(list)
        for t in trades:
            by_params[json.dumps(t.get("params") or {}, sort_keys=True)].append(t)
        defaults = STRATEGY_DEFAULTS.get(name, {})
        param_variants = []
        for pkey, ptrades in by_params.items():
            ps = _agg(ptrades)
            used = json.loads(pkey)
            # Runs saved before per-trade params existed have {} — show the
            # textbook defaults that were actually in effect for that strategy.
            ps["params"] = used if used else dict(defaults)
            ps["used_defaults"] = not used
            param_variants.append(ps)
        param_variants.sort(key=lambda x: (x["win_rate"], x["total_pnl"]), reverse=True)
        stat["name"] = name
        stat["best_params"] = param_variants[0] if param_variants else None
        stat["param_variants"] = param_variants
        strategies.append(stat)

    # Rank: prefer strategies with enough trades, then the balanced score.
    def rank(s):
        eligible = s["trades"] >= MIN_TRADES
        return (1 if eligible else 0, s["score"], s["win_rate"])
    strategies.sort(key=rank, reverse=True)

    return {
        "coin": coin,
        "total_trades": len(rows),
        "strategies": strategies,
        "recommended": strategies[0] if strategies else None,
    }


def _distinct(rpc: str) -> list:
    """Distinct values via a DB function — correct regardless of row count
    (the table has hundreds of thousands of rows; client-side paging can't
    see them all)."""
    client = _client()
    res = client.rpc(rpc).execute()
    out = []
    for row in res.data or []:
        out.append(row if isinstance(row, str) else list(row.values())[0])
    return sorted(v for v in out if v)


@router.get("/coins")
async def report_coins():
    return {"coins": _distinct("distinct_backtest_coins")}


@router.get("/all-coins")
async def all_coins_summary(min_trades: int = 10):
    """Fetch all backtest results and return per-coin best-strategy ranking."""
    client = _client()
    rows: list = []
    offset, page_size = 0, 1000
    while True:
        res = (
            client.table("backtest_results")
            .select("coin,strategy,win_loss_rate,profit_rate")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    by_coin: dict = defaultdict(lambda: defaultdict(list))
    for r in rows:
        coin = r.get("coin") or ""
        strat = r.get("strategy") or ""
        if coin:
            by_coin[coin][strat].append(r)

    result = []
    for coin, strat_map in by_coin.items():
        all_coin_trades: list = []
        best_stat = None
        best_name = None

        for name, trades in strat_map.items():
            all_coin_trades.extend(trades)
            if len(trades) < min_trades:
                continue
            stat = _agg(trades)
            stat["name"] = name
            score = round(stat["win_rate"] / 100 * stat["total_pnl"], 2)
            stat["score"] = score
            if best_stat is None or score > best_stat["score"]:
                best_stat = stat
                best_name = name

        overall = _agg(all_coin_trades)
        result.append({
            "coin": coin,
            "total_trades": len(all_coin_trades),
            "best_strategy": best_name or "—",
            "best_win_rate": best_stat["win_rate"] if best_stat else overall["win_rate"],
            "best_total_pnl": best_stat["total_pnl"] if best_stat else overall["total_pnl"],
            "best_trades": best_stat["trades"] if best_stat else 0,
            "best_score": best_stat["score"] if best_stat else 0,
            "overall_win_rate": overall["win_rate"],
            "overall_total_pnl": overall["total_pnl"],
        })

    result.sort(key=lambda x: (x["best_win_rate"], x["best_total_pnl"]), reverse=True)
    return {"coins": result, "total_analyzed": len(rows)}


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
        L.append(f"{i}. {s['name']}  (score {s['score']})")
        L.append(f"   Trades {s['trades']} | Win {s['win_rate']}% ({s['wins']}W/{s['losses']}L) "
                 f"| Net PnL {s['total_pnl']}% | Avg {s['avg_pnl']}% "
                 f"| Best {s['best_trade']}% | Worst {s['worst_trade']}%")
        L.append(f"   Exits: TP1 {s['tp1']} | TP2 {s['tp2']} ({s['tp2_rate']}% ran to TP2) "
                 f"| SL {s['sl']} | Expired {s['expired']}")
        bp = s.get("best_params")
        if bp and bp.get("params"):
            tag = " (defaults)" if bp.get("used_defaults") else ""
            L.append(f"   Params{tag}: {json.dumps(bp['params'])}")
        if len(s.get("param_variants", [])) > 1:
            L.append(f"   Param sets tested: {len(s['param_variants'])} "
                     f"(best: {json.dumps(s['best_params']['params'])})")
    L.append("")
    L.append("=" * 60)
    L.append(f"Note: 'score' = win-rate-fraction x net PnL (balances winning often")
    L.append(f"and making money). Recommendation favours strategies with >= {MIN_TRADES}")
    L.append("trades, ranked by score.")
    L.append("=" * 60)
    return "\n".join(L)

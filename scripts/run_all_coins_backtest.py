"""
Auto Backtest — All 20 Coins, Best Strategies, Last 1 Month
Run: python scripts/run_all_coins_backtest.py
"""
import asyncio, httpx, json
from datetime import datetime, timedelta, timezone
from collections import defaultdict

API = "http://127.0.0.1:8000"

# Best strategies per coin (from DB analysis + historical tuning)
COIN_BEST_STRATEGIES = {
    "BTCUSDT":   ["support_resistance", "bollinger_squeeze", "fibonacci"],
    "ETHUSDT":   ["bollinger_squeeze", "volume_momentum", "ichimoku"],
    "SOLUSDT":   ["volume_momentum", "ichimoku", "bollinger_squeeze"],
    "BNBUSDT":   ["volume_momentum", "ichimoku", "bollinger_squeeze"],
    "XRPUSDT":   ["ema_crossover", "ichimoku"],
    "ADAUSDT":   ["ema_crossover", "volume_momentum", "support_resistance"],
    "DOGEUSDT":  ["ict_order_block", "volume_momentum", "bollinger_squeeze"],
    "AVAXUSDT":  ["volume_momentum", "ema_crossover", "bollinger_squeeze"],
    "DOTUSDT":   ["stoch_rsi_volume", "ema_crossover"],
    "LINKUSDT":  ["ema_crossover", "volume_momentum", "ichimoku"],
    "NEARUSDT":  ["volume_momentum", "ichimoku", "bollinger_squeeze"],
    "INJUSDT":   ["volume_momentum", "ichimoku", "bollinger_squeeze"],
    "ARBUSDT":   ["ichimoku", "volume_momentum", "support_resistance"],
    "OPUSDT":    ["support_resistance", "ichimoku", "volume_momentum"],
    "APTUSDT":   ["volume_momentum", "bollinger_squeeze", "ichimoku"],
    "ATOMUSDT":  ["volume_momentum", "ichimoku", "ict_order_block"],
    "MATICUSDT": ["volume_momentum", "bollinger_squeeze", "fibonacci"],
    "TIAUSDT":   ["volume_momentum", "ichimoku", "bollinger_squeeze"],
    "LTCUSDT":   ["volume_momentum", "ict_order_block", "bollinger_squeeze"],
    "UNIUSDT":   ["ema_crossover", "volume_momentum", "support_resistance"],
}

# Settings
INTERVAL         = "15m"
TP_PCT           = 3.0
TP2_PCT          = 4.5
SL_PCT           = 1.5
USE_TREND_FILTER = True
USE_SESSION      = False   # 24/7 trading
CAPITAL          = 100.0
RISK_PCT         = 5.0     # 5% of capital per trade
TRADE_USDT       = CAPITAL * RISK_PCT / 100  # $5 per trade

END_DT   = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
START_DT = END_DT - timedelta(days=30)


async def run_coin(client: httpx.AsyncClient, coin: str, strategies: list) -> dict:
    payload = {
        "coins":              [coin],
        "start_dt":           START_DT.isoformat(),
        "end_dt":             END_DT.isoformat(),
        "strategies":         strategies,
        "tp_pct":             TP_PCT,
        "tp2_pct":            TP2_PCT,
        "sl_pct":             SL_PCT,
        "interval":           INTERVAL,
        "use_trend_filter":   USE_TREND_FILTER,
        "use_session_filter": USE_SESSION,
        "min_confluence":     1,
    }
    try:
        r = await client.post(f"{API}/backtest/run", json=payload, timeout=300)
        data = r.json()
        return {"coin": coin, "results": data.get("results", []), "error": None}
    except Exception as e:
        return {"coin": coin, "results": [], "error": str(e)}


def analyze(coin: str, results: list) -> dict:
    if not results:
        return {"coin": coin, "trades": 0, "wins": 0, "losses": 0, "win_rate": 0,
                "total_pnl_pct": 0, "profit_usdt": 0, "best_strategy": "—", "grade": "—"}

    strat_map = defaultdict(lambda: {"wins": 0, "losses": 0})
    wins = losses = 0
    total_pnl = 0.0

    for r in results:
        s = r["strategy"]
        if r["win_loss_rate"] == "Win":
            wins += 1
            strat_map[s]["wins"] += 1
        else:
            losses += 1
            strat_map[s]["losses"] += 1
        total_pnl += r["profit_rate"]

    total = wins + losses
    wr = wins / total * 100 if total else 0

    # Best strategy by WR
    best_s = max(strat_map.items(),
                 key=lambda x: x[1]["wins"] / (x[1]["wins"] + x[1]["losses"])
                 if (x[1]["wins"] + x[1]["losses"]) > 0 else 0)
    best_name = best_s[0]
    bt = best_s[1]["wins"] + best_s[1]["losses"]
    best_wr = best_s[1]["wins"] / bt * 100 if bt else 0

    # Profit simulation: TRADE_USDT per signal
    profit_usdt = total_pnl / 100 * TRADE_USDT

    # EV per trade
    ev_pct = (wr / 100 * TP_PCT) - ((1 - wr / 100) * SL_PCT)

    # Grade
    if wr >= 58:   grade = "A"
    elif wr >= 50: grade = "B"
    elif wr >= 45: grade = "C"
    else:          grade = "D"

    return {
        "coin":          coin,
        "trades":        total,
        "wins":          wins,
        "losses":        losses,
        "win_rate":      round(wr, 1),
        "total_pnl_pct": round(total_pnl, 1),
        "profit_usdt":   round(profit_usdt, 2),
        "ev_pct":        round(ev_pct, 3),
        "best_strategy": best_name,
        "best_wr":       round(best_wr, 1),
        "grade":         grade,
    }


def print_report(all_stats: list):
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    print()
    print("=" * 95)
    print(f"  MONTHLY BACKTEST REPORT — All 20 Coins")
    print(f"  Period : {START_DT.strftime('%Y-%m-%d')} → {END_DT.strftime('%Y-%m-%d')}  |  Interval: {INTERVAL}  |  TP={TP_PCT}%  SL={SL_PCT}%  |  Generated: {now}")
    print(f"  Capital: ${CAPITAL}  |  Risk/trade: {RISK_PCT}% (${TRADE_USDT})  |  EMA200 Filter: {'ON' if USE_TREND_FILTER else 'OFF'}  |  Session: {'ON' if USE_SESSION else 'OFF (24/7)'}")
    print("=" * 95)
    print(f"{'Coin':<12} {'Grade':>5} {'Trades':>7} {'Wins':>5} {'Losses':>7} {'WR%':>7} {'EV%':>7} {'PnL%':>9} {'Profit$':>9}  Best Strategy")
    print("-" * 95)

    sorted_stats = sorted(all_stats, key=lambda x: x["win_rate"], reverse=True)
    total_profit = 0.0
    total_trades = 0
    total_wins   = 0

    grade_groups = {"A": [], "B": [], "C": [], "D": [], "—": []}

    for s in sorted_stats:
        if s["trades"] == 0:
            print(f"{s['coin']:<12} {'—':>5} {'0':>7} {'—':>5} {'—':>7} {'—':>7} {'—':>7} {'—':>9} {'—':>9}  no data")
            continue

        grade = s["grade"]
        grade_sym = {"A": "★ A", "B": "  B", "C": "  C", "D": "  D"}.get(grade, "  —")

        ev_str = (f"+{s['ev_pct']:.2f}%" if s["ev_pct"] >= 0 else f"{s['ev_pct']:.2f}%")
        pnl_str = (f"+{s['total_pnl_pct']:.1f}" if s["total_pnl_pct"] >= 0 else str(s["total_pnl_pct"]))
        prof_str = (f"+${s['profit_usdt']:.2f}" if s["profit_usdt"] >= 0 else f"-${abs(s['profit_usdt']):.2f}")

        print(f"{s['coin']:<12} {grade_sym:>5} {s['trades']:>7} {s['wins']:>5} {s['losses']:>7} "
              f"{s['win_rate']:>6.1f}% {ev_str:>7} {pnl_str:>9}% {prof_str:>9}  {s['best_strategy']} ({s['best_wr']}%)")

        total_profit += s["profit_usdt"]
        total_trades += s["trades"]
        total_wins   += s["wins"]
        grade_groups[grade].append(s["coin"])

    print("-" * 95)
    overall_wr = total_wins / total_trades * 100 if total_trades else 0
    overall_ev = (overall_wr / 100 * TP_PCT) - ((1 - overall_wr / 100) * SL_PCT)
    print(f"{'TOTAL':<12} {'':>5} {total_trades:>7} {total_wins:>5} {total_trades-total_wins:>7} "
          f"{overall_wr:>6.1f}% {overall_ev:>+6.2f}% {'':>9} {f'+${total_profit:.2f}' if total_profit>=0 else f'-${abs(total_profit):.2f}':>9}  (${TRADE_USDT}/trade fixed)")
    print("=" * 95)

    print()
    print("--- GRADE SUMMARY ---")
    for g, coins in grade_groups.items():
        if coins and g != "—":
            print(f"  Grade {g}: {', '.join(c.replace('USDT','') for c in coins)}")

    print()
    print("--- MONTHLY PROFIT ESTIMATE (portfolio, all coins simultaneously) ---")
    # EV-based estimate per coin
    portfolio_monthly = 0.0
    for s in sorted_stats:
        if s["trades"] == 0 or s["ev_pct"] <= 0:
            continue
        # trades_per_month = actual trades from 1-month backtest / 20 coins
        trades_per_month = s["trades"] / len([x for x in COIN_BEST_STRATEGIES[s["coin"]]]) if s["coin"] in COIN_BEST_STRATEGIES else s["trades"]
        # portfolio: 1 trade at a time per coin, so roughly trades/strategies count
        monthly_est = (s["ev_pct"] / 100) * TRADE_USDT * s["trades"]
        portfolio_monthly += monthly_est

    print(f"  Capital      : ${CAPITAL}")
    print(f"  Risk/trade   : ${TRADE_USDT} ({RISK_PCT}%)")
    print(f"  Overall WR   : {overall_wr:.1f}%")
    print(f"  Overall EV   : {overall_ev:+.2f}% per trade")
    print(f"  Total signals: {total_trades} across all coins")
    print()

    # Realistic portfolio estimate
    # 1 trade at a time per coin = much fewer signals
    # Approx: total_trades / 5 strategies / 20 coins = per-coin non-overlapping
    per_coin_trades = total_trades / 20
    realistic_trades = per_coin_trades * 0.20  # ~20% non-overlapping in live
    realistic_monthly = (overall_ev / 100) * TRADE_USDT * realistic_trades * 20  # 20 coins

    all_signals_monthly = total_profit  # already calculated above
    print(f"  [Theoretical] All signals, ${TRADE_USDT}/trade : +${total_profit:.2f} profit")
    print(f"  [Realistic]   1 trade/coin at a time (~20% signals used): +${realistic_monthly:.2f} profit")
    print(f"  [Conservative] Half of realistic: +${realistic_monthly/2:.2f} profit")
    print()
    print(f"  Monthly Return % on ${CAPITAL}:")
    print(f"    Theoretical : {total_profit/CAPITAL*100:.1f}%")
    print(f"    Realistic   : {realistic_monthly/CAPITAL*100:.1f}%")
    print(f"    Conservative: {realistic_monthly/2/CAPITAL*100:.1f}%")
    print()

    a_coins = grade_groups.get("A", [])
    b_coins = grade_groups.get("B", [])
    print(f"  RECOMMENDED: Run portfolio bot with Grade A+B coins:")
    print(f"  {', '.join(c.replace('USDT','') for c in a_coins+b_coins)}")
    print("=" * 95)


async def main():
    print(f"\nStarting backtest for 20 coins... ({INTERVAL} candles, {START_DT.date()} to {END_DT.date()})")
    print("This may take 3-8 minutes. Please wait...\n")

    all_stats = []

    async with httpx.AsyncClient() as client:
        # Run 4 at a time to avoid overloading
        coins = list(COIN_BEST_STRATEGIES.keys())
        batch_size = 4
        for i in range(0, len(coins), batch_size):
            batch = coins[i:i+batch_size]
            names = [c.replace("USDT","") for c in batch]
            print(f"  Running: {', '.join(names)}...")
            tasks = [run_coin(client, coin, COIN_BEST_STRATEGIES[coin]) for coin in batch]
            results = await asyncio.gather(*tasks)
            for r in results:
                if r["error"]:
                    print(f"    ERROR {r['coin']}: {r['error']}")
                    all_stats.append({"coin": r["coin"], "trades": 0, "wins": 0, "losses": 0,
                                      "win_rate": 0, "total_pnl_pct": 0, "profit_usdt": 0,
                                      "ev_pct": 0, "best_strategy": "error", "best_wr": 0, "grade": "—"})
                else:
                    stat = analyze(r["coin"], r["results"])
                    all_stats.append(stat)
                    coin_short = r["coin"].replace("USDT","")
                    print(f"    OK {coin_short:8s}: {stat['trades']:4d} trades | {stat['win_rate']:5.1f}% WR | grade {stat['grade']}")

    print_report(all_stats)

    # Save JSON report
    report_path = f"scripts/report_{END_DT.strftime('%Y%m%d')}.json"
    with open(report_path, "w") as f:
        json.dump({
            "generated": datetime.now().isoformat(),
            "period": {"start": START_DT.isoformat(), "end": END_DT.isoformat()},
            "settings": {"interval": INTERVAL, "tp_pct": TP_PCT, "sl_pct": SL_PCT,
                         "capital": CAPITAL, "risk_pct": RISK_PCT},
            "coins": all_stats,
        }, f, indent=2)
    print(f"\nJSON report saved: {report_path}")


if __name__ == "__main__":
    asyncio.run(main())

"""
Full Backtest 2024 + 2025 — All 20 Coins, Month by Month
Steps:
  1. Clear backtest_results table in Supabase
  2. Run each coin x each month (Jan 2024 -> Dec 2025 = 24 months)
  3. Print month-by-month + yearly report per coin

Run: python scripts/full_backtest_2024_2025.py
"""
import asyncio, httpx, json, os, sys
from datetime import datetime, timezone
from collections import defaultdict
from supabase import create_client

# ── Config ────────────────────────────────────────────────────────────────────
API              = "http://127.0.0.1:8000"
SUPABASE_URL     = "https://llctmrzftfijdnixcffz.supabase.co"
SUPABASE_KEY     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsY3RtcnpmdGZpamRuaXhjZmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxODQ1MTEsImV4cCI6MjA5Nzc2MDUxMX0.p7YDy01WytZGl2O3AQIG0lJl4er6wnMIj-De-MT7H9Y"

INTERVAL         = "15m"
TP_PCT           = 3.0
TP2_PCT          = 4.5
SL_PCT           = 1.5
USE_TREND_FILTER = True
USE_SESSION      = False
CAPITAL          = 100.0
RISK_PCT         = 5.0
TRADE_USDT       = CAPITAL * RISK_PCT / 100   # $5/trade
BATCH_SIZE       = 4   # coins in parallel

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
ALL_COINS = list(COIN_BEST_STRATEGIES.keys())

# 24 months: Jan 2024 -> Dec 2025
MONTHS = []
for year in [2024, 2025]:
    for month in range(1, 13):
        if month == 12:
            start = datetime(year, 12, 1, tzinfo=timezone.utc)
            end   = datetime(year, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
        else:
            start = datetime(year, month, 1, tzinfo=timezone.utc)
            end   = datetime(year, month + 1, 1, tzinfo=timezone.utc)
        MONTHS.append((start, end, f"{year}-{month:02d}"))

PROGRESS_FILE = "scripts/backtest_progress.json"


# ── DB helpers ────────────────────────────────────────────────────────────────
def clear_db():
    print("Clearing backtest_results table...")
    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    # Delete all rows — Supabase requires a filter; use neq on a guaranteed field
    db.table("backtest_results").delete().neq("id", 0).execute()
    print("  Done — table cleared.\n")


def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {"done": [], "results": {}}   # done = ["2024-01_BTCUSDT", ...]


def save_progress(prog):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(prog, f, indent=2)


# ── Backtest call ─────────────────────────────────────────────────────────────
async def run_one(client, coin, start, end):
    payload = {
        "coins":              [coin],
        "start_dt":           start.isoformat(),
        "end_dt":             end.isoformat(),
        "strategies":         COIN_BEST_STRATEGIES[coin],
        "tp_pct":             TP_PCT,
        "tp2_pct":            TP2_PCT,
        "sl_pct":             SL_PCT,
        "interval":           INTERVAL,
        "use_trend_filter":   USE_TREND_FILTER,
        "use_session_filter": USE_SESSION,
        "min_confluence":     1,
    }
    for attempt in range(3):  # retry up to 3 times
        try:
            r = await client.post(f"{API}/backtest/run", json=payload, timeout=360)
            return r.json().get("results", [])
        except Exception as e:
            if attempt < 2:
                print(f"    RETRY {attempt+1} {coin}: {e}")
                await asyncio.sleep(3)
            else:
                print(f"    SKIP {coin} after 3 fails: {e}")
                return []


# ── Stat helpers ──────────────────────────────────────────────────────────────
def empty_stat():
    return {"trades": 0, "wins": 0, "losses": 0, "pnl": 0.0}

def add_results(stat, results):
    for r in results:
        stat["trades"] += 1
        if r["win_loss_rate"] == "Win":
            stat["wins"] += 1
        else:
            stat["losses"] += 1
        stat["pnl"] += r["profit_rate"]

def wr(stat):
    t = stat["trades"]
    return stat["wins"] / t * 100 if t else 0.0

def ev(stat):
    w = wr(stat) / 100
    return round(w * TP_PCT - (1 - w) * SL_PCT, 3)

def grade(stat):
    w = wr(stat)
    if w >= 58: return "A"
    if w >= 50: return "B"
    if w >= 45: return "C"
    if w >= 33.4: return "D"
    return "F"

def profit_usd(stat):
    return round(stat["pnl"] / 100 * TRADE_USDT, 2)


# ── Report ────────────────────────────────────────────────────────────────────
def print_monthly_per_coin(all_monthly):
    """all_monthly[coin][month_label] = stat"""
    print()
    print("=" * 130)
    print("  MONTH-BY-MONTH REPORT PER COIN — 2024 + 2025")
    print(f"  15m | EMA200 ON | 24/7 | TP={TP_PCT}% SL={SL_PCT}% | ${TRADE_USDT}/trade")
    print("=" * 130)

    coin_yearly = {}   # coin -> {2024: stat, 2025: stat}

    for coin in ALL_COINS:
        monthly = all_monthly.get(coin, {})
        if not monthly:
            continue
        short = coin.replace("USDT", "")
        print(f"\n  {short}")
        print(f"  {'Month':<10} {'Trades':>7} {'Wins':>5} {'Loss':>5} {'WR%':>7} {'EV%':>7} {'Profit$':>9}  Grade")
        print(f"  {'-'*65}")

        yearly = {"2024": empty_stat(), "2025": empty_stat()}
        for _, _, label in MONTHS:
            year = label[:4]
            stat = monthly.get(label, empty_stat())
            yearly[year]["trades"]  += stat["trades"]
            yearly[year]["wins"]    += stat["wins"]
            yearly[year]["losses"]  += stat["losses"]
            yearly[year]["pnl"]     += stat["pnl"]

            t = stat["trades"]
            if t == 0:
                print(f"  {label:<10} {'—':>7}")
                continue
            w    = wr(stat)
            e    = ev(stat)
            p    = profit_usd(stat)
            g    = grade(stat)
            p_str = (f"+${p:.2f}" if p >= 0 else f"-${abs(p):.2f}")
            e_str = (f"+{e:.2f}%" if e >= 0 else f"{e:.2f}%")
            g_tag = {"A":"[A]","B":"[B]","C":"[C]","D":"[D]","F":"[F]"}.get(g,"")
            print(f"  {label:<10} {t:>7} {stat['wins']:>5} {stat['losses']:>5} {w:>6.1f}% {e_str:>7} {p_str:>9}  {g_tag}")

        # Year subtotals
        for yr in ["2024", "2025"]:
            ys = yearly[yr]
            t  = ys["trades"]
            if t == 0:
                print(f"  {'  '+yr+' TOTAL':<10} {'—':>7}")
                continue
            w  = wr(ys); e = ev(ys); p = profit_usd(ys); g = grade(ys)
            p_str = (f"+${p:.2f}" if p >= 0 else f"-${abs(p):.2f}")
            e_str = (f"+{e:.2f}%" if e >= 0 else f"{e:.2f}%")
            g_tag = {"A":"[A]","B":"[B]","C":"[C]","D":"[D]","F":"[F]"}.get(g,"")
            print(f"  {'  '+yr+' TOTAL':<10} {t:>7} {ys['wins']:>5} {ys['losses']:>5} {w:>6.1f}% {e_str:>7} {p_str:>9}  {g_tag}  <<")

        coin_yearly[coin] = yearly

    # ── Overall ranking ──
    print()
    print("=" * 130)
    print("  OVERALL RANKING — Best Coins (2024+2025 combined)")
    print("=" * 130)
    print(f"  {'Coin':<12} {'Trades':>7} {'WR%':>7} {'EV%':>7} {'2024 $':>9} {'2025 $':>9} {'Total $':>9}  Grade")
    print(f"  {'-'*75}")

    rows = []
    for coin in ALL_COINS:
        if coin not in coin_yearly:
            continue
        y24 = coin_yearly[coin]["2024"]
        y25 = coin_yearly[coin]["2025"]
        combined = {
            "trades":  y24["trades"]  + y25["trades"],
            "wins":    y24["wins"]    + y25["wins"],
            "losses":  y24["losses"]  + y25["losses"],
            "pnl":     y24["pnl"]     + y25["pnl"],
        }
        rows.append((coin, y24, y25, combined))

    rows.sort(key=lambda x: wr(x[3]), reverse=True)
    for coin, y24, y25, combined in rows:
        short = coin.replace("USDT","")
        t     = combined["trades"]
        w     = wr(combined)
        e     = ev(combined)
        p24   = profit_usd(y24)
        p25   = profit_usd(y25)
        ptot  = profit_usd(combined)
        g     = grade(combined)
        g_tag = {"A":"[A]","B":"[B]","C":"[C]","D":"[D]","F":"[F]"}.get(g,"")
        p24s  = (f"+${p24:.2f}" if p24 >= 0 else f"-${abs(p24):.2f}")
        p25s  = (f"+${p25:.2f}" if p25 >= 0 else f"-${abs(p25):.2f}")
        ptots = (f"+${ptot:.2f}" if ptot >= 0 else f"-${abs(ptot):.2f}")
        es    = (f"+{e:.2f}%" if e >= 0 else f"{e:.2f}%")
        print(f"  {short:<12} {t:>7} {w:>6.1f}% {es:>7} {p24s:>9} {p25s:>9} {ptots:>9}  {g_tag}")

    print()
    print("  Grade: A>=58% | B>=50% | C>=45% | D>=33.4% | F<33.4% (below break-even)")
    print("=" * 130)


# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    # Step 1: Clear DB
    try:
        clear_db()
    except Exception as e:
        print(f"DB clear failed: {e} — continuing anyway")

    # Step 2: Load progress (resume if interrupted)
    prog = load_progress()
    done_set = set(prog["done"])
    all_monthly = prog.get("results", {})   # coin -> {month -> stat}

    total_calls = len(ALL_COINS) * len(MONTHS)
    done_count  = len(done_set)
    print(f"Progress: {done_count}/{total_calls} already done.")
    print(f"Running {total_calls - done_count} remaining calls...\n")

    async with httpx.AsyncClient() as client:
        for start, end, label in MONTHS:
            print(f"\n  === {label} ===")
            for i in range(0, len(ALL_COINS), BATCH_SIZE):
                batch = ALL_COINS[i:i+BATCH_SIZE]
                todo = [c for c in batch if f"{label}_{c}" not in done_set]
                if not todo:
                    print(f"    {', '.join(c.replace('USDT','') for c in batch)} — skipped")
                    continue
                try:
                    tasks = [run_one(client, coin, start, end) for coin in todo]
                    batch_results = await asyncio.gather(*tasks, return_exceptions=True)
                except Exception as e:
                    print(f"  BATCH ERROR {label} batch {i}: {e} — skipping")
                    continue

                for coin, results in zip(todo, batch_results):
                    if isinstance(results, Exception):
                        print(f"    SKIP {coin}: {results}")
                        results = []
                    stat = empty_stat()
                    add_results(stat, results)
                    if coin not in all_monthly:
                        all_monthly[coin] = {}
                    all_monthly[coin][label] = stat
                    done_set.add(f"{label}_{coin}")
                    short = coin.replace("USDT","")
                    w = wr(stat)
                    g = grade(stat)
                    print(f"    {short:<8}: {stat['trades']:4d} trades | {w:5.1f}% WR | {g}")

                # Save after every batch — crash-safe
                prog["done"]    = list(done_set)
                prog["results"] = all_monthly
                save_progress(prog)

    print("\n\nAll backtests complete!\n")
    print_monthly_per_coin(all_monthly)

    # Save final JSON
    out = {
        "generated": datetime.now().isoformat(),
        "settings":  {"interval": INTERVAL, "tp_pct": TP_PCT, "sl_pct": SL_PCT,
                      "capital": CAPITAL, "risk_pct": RISK_PCT},
        "monthly":   all_monthly,
    }
    with open("scripts/report_2024_2025.json", "w") as f:
        json.dump(out, f, indent=2)
    print("\nFull report saved: scripts/report_2024_2025.json")


if __name__ == "__main__":
    # Clear old progress if fresh run requested
    if "--fresh" in sys.argv and os.path.exists(PROGRESS_FILE):
        os.remove(PROGRESS_FILE)
        print("Old progress cleared.\n")
    asyncio.run(main())

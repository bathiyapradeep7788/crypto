"""
AlgoBot Local Runner — Chrome-Automated Backtesting Engine
==========================================================
Runs LOCALLY on your machine (no Vercel 10s timeout).

What it does:
  1. Clears any leftover Chrome tabs → clean slate
  2. For each of 20 coins:
     a. Opens TradingView chart tab (visual tracking)
     b. Fetches Binance OHLCV data directly
     c. Runs all 10 strategies (pure-Python, fast)
     d. Grid-searches TP/SL to find optimal parameters
     e. Saves trade signals → backtest_results (Supabase)
     f. Saves best-strategy summary → coin_best_strategies (Supabase)
     g. Closes the chart tab
  3. Opens live Dashboard at the end to verify results
  4. Auto-closes Chrome after CLOSE_DELAY_SEC seconds

Usage:
  pip install selenium webdriver-manager httpx supabase
  python local_runner.py
  -- or with custom dates --
  python local_runner.py 2024-01-01 2024-06-01 15m
"""

import sys
import os
import time
import asyncio
import argparse
from datetime import datetime, timezone

# Force UTF-8 output on Windows to avoid cp1252 UnicodeEncodeError
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr.encoding and sys.stderr.encoding.lower() != "utf-8":
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Load .env file from project root (keeps secrets out of source code)
from pathlib import Path
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_path)
else:
    print(f"[WARNING] .env file not found at {_env_path}")
    print("          Copy .env.example to .env and fill in your credentials.")
    sys.exit(1)

# ── Selenium ──────────────────────────────────────────────────────────────────
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import WebDriverException

try:
    from webdriver_manager.chrome import ChromeDriverManager
    from selenium.webdriver.chrome.service import Service
    USE_WDM = True
except ImportError:
    USE_WDM = False

# ── Supabase ──────────────────────────────────────────────────────────────────
from supabase import create_client

# ── Strategy engine (reuse backend code) ─────────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
from app.services.strategy_engine import STRATEGY_MAP, get_signal
from app.services.trade_simulator import simulate_trade

# ══════════════════════════════════════════════════════════════════════════════
# CONFIG — edit these or pass as CLI args
# ══════════════════════════════════════════════════════════════════════════════

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

BINANCE_BASE  = os.getenv("BINANCE_BASE_URL", "https://data-api.binance.vision")
DASHBOARD_URL = "https://algobot-frontend.vercel.app/dashboard"
TV_BASE       = "https://www.tradingview.com/chart/?symbol=BINANCE:"

CLOSE_DELAY_SEC = 15      # seconds to show dashboard before auto-close
CANDLE_LIMIT    = 1000    # Binance max per request

COINS = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT",
    "LINKUSDT", "UNIUSDT", "LTCUSDT", "ATOMUSDT", "NEARUSDT",
    "APTUSDT", "ARBUSDT", "OPUSDT", "INJUSDT", "TIAUSDT",
]

STRATEGY_LABELS = {
    "rsi_macd":            "RSI + MACD",
    "ema_crossover":       "EMA 21/55 Crossover",
    "bollinger_squeeze":   "Bollinger Band Squeeze",
    "vwap_mean_reversion": "VWAP Mean Reversion",
    "support_resistance":  "S/R Bounce",
    "ichimoku":            "Ichimoku Cloud",
    "stoch_rsi_volume":    "Stoch RSI + Volume",
    "ict_order_block":     "ICT Order Block + FVG",
    "fibonacci":           "Fibonacci Retracement",
    "volume_momentum":     "Volume-Momentum Breakout",
}

# TP/SL grid — all combos are tested on the winning strategy
TP_GRID  = [1.5, 2.0, 2.5, 3.0]
TP2_GRID = [3.0, 4.0, 5.0]
SL_GRID  = [1.0, 1.5, 2.0]


# ══════════════════════════════════════════════════════════════════════════════
# CHROME HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def launch_chrome() -> webdriver.Chrome:
    """Launch a visible Chrome window."""
    opts = Options()
    opts.add_argument("--start-maximized")
    opts.add_argument("--disable-notifications")
    opts.add_argument("--disable-popup-blocking")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)

    if USE_WDM:
        svc = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=svc, options=opts)
    else:
        driver = webdriver.Chrome(options=opts)

    print("[Chrome] Browser launched.")
    return driver


def close_all_extra_tabs(driver: webdriver.Chrome):
    """Keep only the first (index 0) tab; close everything else."""
    handles = driver.window_handles
    if len(handles) <= 1:
        return
    for h in handles[1:]:
        driver.switch_to.window(h)
        driver.close()
    driver.switch_to.window(driver.window_handles[0])
    print(f"[Chrome] Cleared {len(handles) - 1} extra tab(s) → clean slate.")


def open_tab(driver: webdriver.Chrome, url: str) -> str:
    """Open a new tab and return its handle."""
    driver.execute_script(f"window.open('{url}', '_blank');")
    new_handle = driver.window_handles[-1]
    driver.switch_to.window(new_handle)
    return new_handle


def close_tab(driver: webdriver.Chrome, handle: str):
    """Close a specific tab and return focus to the first tab."""
    try:
        driver.switch_to.window(handle)
        driver.close()
    except WebDriverException:
        pass
    driver.switch_to.window(driver.window_handles[0])


# ══════════════════════════════════════════════════════════════════════════════
# BINANCE DATA FETCH (sync wrapper around async httpx)
# ══════════════════════════════════════════════════════════════════════════════

import httpx

def fetch_klines_sync(symbol: str, interval: str, start_dt: datetime, end_dt: datetime):
    """Fetch OHLCV candles from Binance via data-api mirror (no geo-block)."""
    url = f"{BINANCE_BASE}/api/v3/klines"
    start_ms = int(start_dt.timestamp() * 1000)
    end_ms   = int(end_dt.timestamp() * 1000)
    all_candles = []
    cursor = start_ms

    with httpx.Client(timeout=60) as client:
        while cursor < end_ms:
            resp = client.get(url, params={
                "symbol":    symbol,
                "interval":  interval,
                "startTime": cursor,
                "endTime":   end_ms,
                "limit":     CANDLE_LIMIT,
            })
            resp.raise_for_status()
            raw = resp.json()
            if not raw:
                break
            for c in raw:
                all_candles.append({
                    "open_time":  datetime.utcfromtimestamp(c[0] / 1000),
                    "open":       float(c[1]),
                    "high":       float(c[2]),
                    "low":        float(c[3]),
                    "close":      float(c[4]),
                    "volume":     float(c[5]),
                    "close_time": datetime.utcfromtimestamp(c[6] / 1000),
                })
            cursor = raw[-1][0] + 1
            if len(raw) < CANDLE_LIMIT:
                break

    return all_candles


# ══════════════════════════════════════════════════════════════════════════════
# DB SAVE HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _ts(val) -> str:
    return val.isoformat() if hasattr(val, "isoformat") else str(val)


def db_bulk_save_trades(client, trades: list):
    if not trades:
        return
    rows = [{
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
    } for t in trades]
    client.table("backtest_results").insert(rows).execute()


def db_save_optimization(client, data: dict):
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
            "updated_at":     datetime.utcnow().isoformat(),
        },
        on_conflict="coin",
    ).execute()


# ══════════════════════════════════════════════════════════════════════════════
# CORE OPTIMISATION LOGIC (per coin)
# ══════════════════════════════════════════════════════════════════════════════

def optimise_coin(coin: str, candles: list, start_dt: str, end_dt: str, interval: str):
    """
    Returns a dict with best strategy, optimised TP/SL, trade list,
    and per-strategy breakdown.
    """
    WINDOW  = 60
    D_TP, D_TP2, D_SL = 2.0, 4.0, 1.5

    # ── Step 1: run all 10 strategies with default TP/SL ─────────────────────
    all_strats  = []
    signal_cache = {}

    for strategy_id in STRATEGY_MAP:
        sigs = []
        for i in range(WINDOW, len(candles)):
            sig = get_signal(strategy_id, {}, candles[max(0, i - WINDOW): i + 1])
            if sig:
                direction, _ = sig
                sigs.append((candles[i], candles[i + 1:], direction))
        signal_cache[strategy_id] = sigs

        res   = [simulate_trade(ec, fc, d, D_TP, D_TP2, D_SL) for ec, fc, d in sigs]
        total = len(res)
        wins  = sum(1 for r in res if r["win_loss_rate"] == "Win")
        pnl   = sum(r["profit_rate"] for r in res)
        wr    = round((wins / total * 100) if total else 0.0, 2)

        all_strats.append({
            "strategy":       strategy_id,
            "strategy_label": STRATEGY_LABELS.get(strategy_id, strategy_id),
            "win_rate":       wr,
            "total_pnl_pct":  round(pnl, 4),
            "total_trades":   total,
        })

    if not all_strats:
        return None

    best_s  = max(all_strats, key=lambda x: (x["win_rate"], x["total_pnl_pct"]))
    best_id = best_s["strategy"]
    sigs    = signal_cache[best_id]

    # ── Step 2: grid-search TP/SL on winning strategy ────────────────────────
    opt_tp, opt_tp2, opt_sl = D_TP, D_TP2, D_SL
    opt_wr, opt_pnl = best_s["win_rate"], best_s["total_pnl_pct"]

    for tp in TP_GRID:
        for tp2 in TP2_GRID:
            if tp2 <= tp:
                continue
            for sl in SL_GRID:
                res   = [simulate_trade(ec, fc, d, tp, tp2, sl) for ec, fc, d in sigs]
                total = len(res)
                wins  = sum(1 for r in res if r["win_loss_rate"] == "Win")
                pnl   = sum(r["profit_rate"] for r in res)
                wr    = round((wins / total * 100) if total else 0.0, 2)
                if (wr, pnl) > (opt_wr, opt_pnl):
                    opt_wr, opt_pnl   = wr, pnl
                    opt_tp, opt_tp2, opt_sl = tp, tp2, sl

    # ── Step 3: collect final trade signals ──────────────────────────────────
    label  = STRATEGY_LABELS.get(best_id, best_id)
    trades = []
    for ec, fc, direction in sigs:
        r = simulate_trade(ec, fc, direction, opt_tp, opt_tp2, opt_sl)
        r["coin"]                 = coin
        r["strategy"]             = label
        r["complete_calculation"] = {}
        trades.append(r)

    return {
        "coin":           coin,
        "strategy_id":    best_id,
        "strategy_label": label,
        "tp_pct":         opt_tp,
        "tp2_pct":        opt_tp2,
        "sl_pct":         opt_sl,
        "win_rate":       round(opt_wr, 2),
        "total_pnl_pct":  round(opt_pnl, 4),
        "total_trades":   len(trades),
        "trades":         trades,
        "all_strategies": sorted(all_strats, key=lambda x: x["win_rate"], reverse=True),
        "start_dt":       start_dt,
        "end_dt":         end_dt,
        "interval":       interval,
    }


# ══════════════════════════════════════════════════════════════════════════════
# PROGRESS DISPLAY
# ══════════════════════════════════════════════════════════════════════════════

def print_header():
    print("\n" + "═" * 70)
    print("  AlgoBot Local Runner — Chrome-Automated Backtesting Engine")
    print("═" * 70)

def print_coin_result(result: dict, idx: int, total: int):
    bar = "█" * idx + "░" * (total - idx)
    pnl_sign = "+" if result["total_pnl_pct"] >= 0 else ""
    print(f"\n  [{idx}/{total}]  {result['coin']:<12} ▶  {result['strategy_label']}")
    print(f"         Win Rate : {result['win_rate']:.1f}%")
    print(f"         PnL      : {pnl_sign}{result['total_pnl_pct']:.2f}%")
    print(f"         Trades   : {result['total_trades']}")
    print(f"         Params   : TP={result['tp_pct']}%  TP2={result['tp2_pct']}%  SL={result['sl_pct']}%")
    print(f"  [{bar}]")

def print_summary(results: list):
    print("\n" + "═" * 70)
    print(f"{'COIN':<12}  {'STRATEGY':<30}  {'WR':>6}  {'PnL':>8}  {'TRADES':>6}")
    print("─" * 70)
    for r in sorted(results, key=lambda x: x["win_rate"], reverse=True):
        pnl_s = f"+{r['total_pnl_pct']:.2f}%" if r["total_pnl_pct"] >= 0 else f"{r['total_pnl_pct']:.2f}%"
        print(f"{r['coin']:<12}  {r['strategy_label']:<30}  {r['win_rate']:>5.1f}%  {pnl_s:>8}  {r['total_trades']:>6}")
    print("═" * 70)
    avg_wr  = sum(r["win_rate"] for r in results) / len(results) if results else 0
    tot_pnl = sum(r["total_pnl_pct"] for r in results)
    pnl_s   = f"+{tot_pnl:.2f}%" if tot_pnl >= 0 else f"{tot_pnl:.2f}%"
    print(f"{'AVERAGE / TOTAL':<12}  {'':30}  {avg_wr:>5.1f}%  {pnl_s:>8}")
    print("═" * 70 + "\n")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN RUNNER
# ══════════════════════════════════════════════════════════════════════════════

def run(start_dt_str: str, end_dt_str: str, interval: str):
    print_header()
    print(f"  Period   : {start_dt_str}  →  {end_dt_str}")
    print(f"  Interval : {interval}")
    print(f"  Coins    : {len(COINS)}")
    print(f"  Strategies: {len(STRATEGY_MAP)}")
    print()

    start_dt = datetime.fromisoformat(start_dt_str)
    end_dt   = datetime.fromisoformat(end_dt_str)

    # ── Supabase client ───────────────────────────────────────────────────────
    print("[DB] Connecting to Supabase…")
    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("[DB] Connected ✓\n")

    # ── Chrome: launch + initial tab cleanup ──────────────────────────────────
    driver = launch_chrome()

    # Open a blank progress page first, then kill leftover tabs
    driver.get("about:blank")
    time.sleep(1)
    close_all_extra_tabs(driver)

    # Set the first tab as a simple status page
    driver.execute_script("""
        document.body.style.background='#0d1117';
        document.body.style.color='#e6edf3';
        document.body.style.fontFamily='monospace';
        document.body.style.padding='40px';
        document.body.innerHTML='<h2 id="status">⚡ AlgoBot Local Runner — Starting…</h2>'
                              + '<p id="sub" style="color:#8b949e">Preparing to process 20 coins…</p>';
    """)

    def update_status(msg: str, sub: str = ""):
        try:
            main_handle = driver.window_handles[0]
            current     = driver.current_window_handle
            driver.switch_to.window(main_handle)
            driver.execute_script(
                "document.getElementById('status').innerText = arguments[0];"
                "document.getElementById('sub').innerText = arguments[1];",
                msg, sub
            )
            driver.switch_to.window(current)
        except Exception:
            pass

    # ── Process each coin ─────────────────────────────────────────────────────
    all_results  = []
    failed_coins = []

    for idx, coin in enumerate(COINS, start=1):
        print(f"\n{'─'*60}")
        print(f"[{idx:02d}/{len(COINS)}] {coin}")

        update_status(
            f"⚡ [{idx}/{len(COINS)}] Processing {coin}…",
            "Fetching candles from Binance…"
        )

        # Open TradingView chart tab for this coin (visual reference)
        tv_url    = f"{TV_BASE}{coin.replace('USDT','')}"
        tv_handle = open_tab(driver, tv_url)
        print(f"  [Chrome] TradingView tab opened: {tv_url}")

        # Give chart a moment to load (visual only — we don't scrape TV)
        time.sleep(2)

        # Fetch candles locally (direct Binance — no Vercel timeout)
        try:
            print(f"  [Binance] Fetching {interval} candles…", end=" ", flush=True)
            candles = fetch_klines_sync(coin, interval, start_dt, end_dt)
            print(f"{len(candles)} candles fetched ✓")
        except Exception as e:
            print(f"\n  [ERROR] Binance fetch failed: {e}")
            failed_coins.append(coin)
            close_tab(driver, tv_handle)
            continue

        if len(candles) < 60:
            print(f"  [SKIP] Only {len(candles)} candles — insufficient data")
            failed_coins.append(coin)
            close_tab(driver, tv_handle)
            continue

        update_status(
            f"⚡ [{idx}/{len(COINS)}] {coin} — Running strategies…",
            f"{len(candles)} candles  |  10 strategies + TP/SL grid search"
        )

        # Run strategies + grid search
        print(f"  [Backtest] Running 10 strategies + TP/SL grid search…", end=" ", flush=True)
        result = optimise_coin(coin, candles, start_dt_str, end_dt_str, interval)
        if result is None:
            print("no signals generated — skipping")
            failed_coins.append(coin)
            close_tab(driver, tv_handle)
            continue
        print("done ✓")

        # Save to Supabase
        update_status(
            f"⚡ [{idx}/{len(COINS)}] {coin} — Saving to database…",
            f"Best: {result['strategy_label']}  WR={result['win_rate']}%"
        )
        print(f"  [DB] Saving {result['total_trades']} trades…", end=" ", flush=True)
        try:
            db_bulk_save_trades(db, result["trades"])
            db_save_optimization(db, result)
            print("saved ✓")
        except Exception as e:
            print(f"\n  [ERROR] DB save failed: {e}")

        print_coin_result(result, idx, len(COINS))
        all_results.append(result)

        # Close TradingView tab — done with this coin
        close_tab(driver, tv_handle)
        print(f"  [Chrome] Chart tab closed.")

    # ── All coins done ────────────────────────────────────────────────────────
    print_summary(all_results)

    if failed_coins:
        print(f"  ⚠  Failed coins: {', '.join(failed_coins)}")

    # Open final dashboard
    update_status("✅ All coins complete — loading Dashboard…", "")
    print(f"[Chrome] Opening Dashboard: {DASHBOARD_URL}")
    driver.switch_to.window(driver.window_handles[0])
    driver.get(DASHBOARD_URL)

    # Wait for page to load and refresh (dashboard auto-loads from DB)
    time.sleep(5)
    try:
        driver.refresh()
        time.sleep(3)
    except Exception:
        pass

    print(f"\n✅ Done! Results visible at: {DASHBOARD_URL}")
    print(f"   Closing Chrome in {CLOSE_DELAY_SEC} seconds…")

    for i in range(CLOSE_DELAY_SEC, 0, -1):
        try:
            driver.execute_script(
                f"document.title = '✅ AlgoBot — Closing in {i}s';"
            )
        except Exception:
            break
        time.sleep(1)

    # Auto-close all Chrome windows
    try:
        driver.quit()
        print("[Chrome] Browser closed. Goodbye!")
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AlgoBot Local Chrome Runner")
    parser.add_argument("start",    nargs="?", default="2024-01-01", help="Start date YYYY-MM-DD")
    parser.add_argument("end",      nargs="?", default="2024-06-01", help="End date YYYY-MM-DD")
    parser.add_argument("interval", nargs="?", default="15m",         help="Candle interval (15m/1h/4h/1d)")
    args = parser.parse_args()

    try:
        run(args.start, args.end, args.interval)
    except KeyboardInterrupt:
        print("\n\n[Interrupted] Shutting down…")
        sys.exit(0)

"""
Local signal scan: Jan–May 2025, 10 coins, 15m, all 10 strategies.
Saves every signal to Supabase signal_logs table.
Runs locally — no Vercel 10s limit.
"""
import sys, os, asyncio
from datetime import datetime, timezone

# add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
os.chdir(os.path.join(os.path.dirname(__file__), 'backend'))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

from app.services.strategy_engine import STRATEGY_MAP, get_signal
from app.services.binance_client import fetch_klines
from app.services.trade_simulator import simulate_trade
from app.config import settings
from supabase import create_client

COINS = [
    "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT",
    "ADAUSDT","TRXUSDT","LINKUSDT","DOGEUSDT","XLMUSDT",
]

MONTHS = [
    # Jan already done — skip to avoid duplicates
    ("2025-02-01T00:00:00", "2025-03-01T00:00:00", "Feb 2025"),
    ("2025-03-01T00:00:00", "2025-04-01T00:00:00", "Mar 2025"),
    ("2025-04-01T00:00:00", "2025-05-01T00:00:00", "Apr 2025"),
    ("2025-05-01T00:00:00", "2025-06-01T00:00:00", "May 2025"),
]

STRATEGY_LABELS = {
    "rsi_macd":            "RSI+MACD",
    "ema_crossover":       "EMA Cross",
    "bollinger_squeeze":   "Bollinger",
    "vwap_mean_reversion": "VWAP MR",
    "support_resistance":  "S/R Bounce",
    "ichimoku":            "Ichimoku",
    "stoch_rsi_volume":    "Stoch RSI",
    "ict_order_block":     "ICT OB",
    "fibonacci":           "Fibonacci",
    "volume_momentum":     "Vol Mom",
}

WINDOW   = 60
TP_PCT   = 2.0
TP2_PCT  = 4.0
SL_PCT   = 1.5
INTERVAL = "15m"

def _ts(val) -> str:
    return val.isoformat() if hasattr(val, "isoformat") else str(val)


async def scan_month(client, coin: str, start_dt: str, end_dt: str, month_label: str):
    start = datetime.fromisoformat(start_dt)
    end   = datetime.fromisoformat(end_dt)
    candles = await fetch_klines(coin, INTERVAL, start, end)
    if not candles or len(candles) < WINDOW + 1:
        print(f"  [{month_label}] {coin}: insufficient candles ({len(candles) if candles else 0})")
        return 0

    rows = []
    for strategy_id in STRATEGY_MAP:
        label = STRATEGY_LABELS.get(strategy_id, strategy_id)
        for i in range(WINDOW, len(candles) - 1):
            sig = get_signal(strategy_id, {}, candles[max(0, i - WINDOW): i + 1])
            if sig is None:
                continue
            direction, _ = sig
            entry_candle = candles[i]
            future       = candles[i + 1:]
            sim = simulate_trade(entry_candle, future, direction, TP_PCT, TP2_PCT, SL_PCT)
            rows.append({
                "coin":         coin,
                "signal_date":  _ts(entry_candle["open_time"]),
                "strategy":     label,
                "strategy_id":  strategy_id,
                "direction":    direction,
                "entry":        sim["entry"],
                "tp":           sim["tp"],
                "tp2":          sim["tp2"],
                "sl":           sim["sl"],
                "start_dt":     start_dt,
                "end_dt":       end_dt,
                "outcome":      sim["win_loss_rate"],
                "profit_pct":   sim["profit_rate"],
                "end_position": sim["end_position"],
                "checked_at":   datetime.now(timezone.utc).isoformat(),
            })

    if rows:
        # batch insert in chunks of 500
        for i in range(0, len(rows), 500):
            client.table("signal_logs").insert(rows[i:i+500]).execute()

    print(f"  [{month_label}] {coin}: {len(rows)} signals logged  OK")
    return len(rows)


async def main():
    client = create_client(settings.supabase_url, settings.supabase_key)

    print("Starting scan (table already empty)...\n")

    total_all = 0
    month_stats: dict = {}

    for start_dt, end_dt, month_label in MONTHS:
        print(f"\n=== {month_label} ===")
        month_total = 0
        coin_stats = {}
        for coin in COINS:
            count = await scan_month(client, coin, start_dt, end_dt, month_label)
            month_total += count
            coin_stats[coin] = count
        month_stats[month_label] = {"total": month_total, "coins": coin_stats}
        total_all += month_total
        print(f"  >> {month_label} total: {month_total} signals")

    print(f"\n{'='*50}")
    print(f"SCAN COMPLETE - {total_all} signals saved to Supabase")
    print(f"{'='*50}\n")

    # Month-wise summary
    print(f"{'Month':<12} {'Signals':>8}")
    print("-" * 22)
    for month_label, stats in month_stats.items():
        print(f"{month_label:<12} {stats['total']:>8}")


if __name__ == "__main__":
    asyncio.run(main())

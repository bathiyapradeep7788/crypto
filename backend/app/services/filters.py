import math
from datetime import datetime
from typing import List, Dict, Optional


def trend_direction(candles: List[Dict], period: int = 200) -> Optional[str]:
    """Bull if close > EMA(period), bear otherwise. None if not enough candles."""
    if len(candles) < period:
        return None
    closes = [c["close"] for c in candles]
    k = 2 / (period + 1)
    ema = sum(closes[:period]) / period
    for v in closes[period:]:
        ema = v * k + ema * (1 - k)
    return "bull" if closes[-1] > ema else "bear"


def market_regime(candles: List[Dict], period: int = 20) -> str:
    """Returns 'trending' or 'ranging' based on Bollinger Band width."""
    if len(candles) < period:
        return "unknown"
    closes = [c["close"] for c in candles[-period:]]
    mean = sum(closes) / period
    if mean == 0:
        return "unknown"
    std = math.sqrt(sum((x - mean) ** 2 for x in closes) / period)
    bw = (4 * std) / mean
    return "trending" if bw > 0.04 else "ranging"


def in_active_session(candle_time: datetime) -> bool:
    """True during UTC 08:00-20:00 (London + NY overlap, highest crypto liquidity)."""
    return 8 <= candle_time.hour < 20


def compute_atr(candles: List[Dict], period: int = 14) -> Optional[float]:
    """Returns the latest ATR value, or None if not enough data."""
    if len(candles) < period + 1:
        return None
    tr_list = []
    for i, c in enumerate(candles):
        if i == 0:
            tr_list.append(c["high"] - c["low"])
        else:
            prev_close = candles[i - 1]["close"]
            tr = max(
                c["high"] - c["low"],
                abs(c["high"] - prev_close),
                abs(c["low"] - prev_close),
            )
            tr_list.append(tr)
    atr = sum(tr_list[:period]) / period
    for tr in tr_list[period:]:
        atr = (atr * (period - 1) + tr) / period
    return atr

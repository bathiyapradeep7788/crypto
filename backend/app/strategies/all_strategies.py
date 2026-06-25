from typing import List, Dict, Optional, Tuple
from app.strategies.base import BaseStrategy

# ── VWAP Mean Reversion ──────────────────────────────────────────────────────
class VwapMeanReversionStrategy(BaseStrategy):
    def generate_signal(self, candles: List[Dict]) -> Optional[Tuple[str, Dict]]:
        if len(candles) < 20:
            return None
        closes  = self._closes(candles)
        volumes = self._volumes(candles)
        pv = sum(c * v for c, v in zip(closes, volumes))
        vwap = pv / sum(volumes) if sum(volumes) else closes[-1]
        deviation = self.params.get("vwap_deviation", 0.5)
        last = closes[-1]
        meta = {"vwap": round(vwap, 4), "close": round(last, 4)}
        if last < vwap * (1 - deviation / 100):
            return ("long", meta)
        if last > vwap * (1 + deviation / 100):
            return ("short", meta)
        return None

# ── Support / Resistance Bounce ───────────────────────────────────────────────
class SupportResistanceStrategy(BaseStrategy):
    def generate_signal(self, candles: List[Dict]) -> Optional[Tuple[str, Dict]]:
        if len(candles) < 30:
            return None
        highs  = self._highs(candles[:-1])
        lows   = self._lows(candles[:-1])
        resistance = max(highs[-20:])
        support    = min(lows[-20:])
        last = candles[-1]["close"]
        tolerance = self.params.get("sr_tolerance", 0.3) / 100
        meta = {"support": round(support, 4), "resistance": round(resistance, 4)}
        if abs(last - support) / support <= tolerance:
            return ("long", meta)
        if abs(last - resistance) / resistance <= tolerance:
            return ("short", meta)
        return None

# ── Ichimoku ──────────────────────────────────────────────────────────────────
class IchimokuStrategy(BaseStrategy):
    def generate_signal(self, candles: List[Dict]) -> Optional[Tuple[str, Dict]]:
        if len(candles) < 60:
            return None
        highs = self._highs(candles)
        lows  = self._lows(candles)
        tenkan = (max(highs[-9:])  + min(lows[-9:]))  / 2
        kijun  = (max(highs[-26:]) + min(lows[-26:])) / 2
        close  = candles[-1]["close"]
        meta = {"tenkan": round(tenkan, 4), "kijun": round(kijun, 4)}
        if tenkan > kijun and close > tenkan:
            return ("long", meta)
        if tenkan < kijun and close < tenkan:
            return ("short", meta)
        return None

# ── Stochastic RSI + Volume ───────────────────────────────────────────────────
class StochRsiVolumeStrategy(BaseStrategy):
    def generate_signal(self, candles: List[Dict]) -> Optional[Tuple[str, Dict]]:
        if len(candles) < 30:
            return None
        closes  = self._closes(candles)
        volumes = self._volumes(candles)
        rsi_vals = self._rsi(closes, 14)
        valid_rsi = [r for r in rsi_vals if r is not None]
        if len(valid_rsi) < 14:
            return None
        rsi_window = valid_rsi[-14:]
        rsi_min, rsi_max = min(rsi_window), max(rsi_window)
        stoch_rsi = (valid_rsi[-1] - rsi_min) / (rsi_max - rsi_min + 1e-9) * 100
        avg_vol = sum(volumes[-10:]) / 10
        last_vol = volumes[-1]
        meta = {"stoch_rsi": round(stoch_rsi, 2), "vol_ratio": round(last_vol / avg_vol, 2)}
        ob = self.params.get("stoch_overbought", 80)
        os_ = self.params.get("stoch_oversold", 20)
        if stoch_rsi < os_ and last_vol > avg_vol * 1.5:
            return ("long", meta)
        if stoch_rsi > ob and last_vol > avg_vol * 1.5:
            return ("short", meta)
        return None

# ── ICT Order Block + FVG ────────────────────────────────────────────────────
class IctOrderBlockStrategy(BaseStrategy):
    def generate_signal(self, candles: List[Dict]) -> Optional[Tuple[str, Dict]]:
        if len(candles) < 15:
            return None
        c = candles
        last = c[-1]

        bullish_ob = False
        bearish_ob = False

        # Scan last 12 candles for order block: bearish candle followed by 2+
        # bullish candles (impulse up) = bullish OB; price returning to that zone = long
        for j in range(max(1, len(c) - 12), len(c) - 2):
            if c[j]["close"] < c[j]["open"]:  # bearish candle = potential bullish OB
                if c[j+1]["close"] > c[j+1]["open"] and c[j+2]["close"] > c[j+2]["open"]:
                    if c[j]["low"] <= last["close"] <= c[j]["high"]:
                        bullish_ob = True
                        break
            elif c[j]["close"] > c[j]["open"]:  # bullish candle = potential bearish OB
                if c[j+1]["close"] < c[j+1]["open"] and c[j+2]["close"] < c[j+2]["open"]:
                    if c[j]["low"] <= last["close"] <= c[j]["high"]:
                        bearish_ob = True
                        break

        # FVG: gap between 3-candle window (extra confluence)
        fvg_bull = c[-3]["high"] < c[-1]["low"]
        fvg_bear = c[-3]["low"]  > c[-1]["high"]

        meta = {"bullish_ob": bullish_ob, "bearish_ob": bearish_ob,
                "fvg_bull": fvg_bull, "fvg_bear": fvg_bear}

        if (bullish_ob or fvg_bull) and last["close"] > last["open"]:
            return ("long", meta)
        if (bearish_ob or fvg_bear) and last["close"] < last["open"]:
            return ("short", meta)
        return None

# ── Fibonacci Retracement ────────────────────────────────────────────────────
class FibonacciStrategy(BaseStrategy):
    def generate_signal(self, candles: List[Dict]) -> Optional[Tuple[str, Dict]]:
        if len(candles) < 50:
            return None
        window = candles[-50:]
        lookback = 3

        # Detect proper pivot highs/lows using left/right bar comparison
        pivot_highs, pivot_lows = [], []
        for j in range(lookback, len(window) - lookback):
            h = window[j]["high"]
            l = window[j]["low"]
            if all(h > window[k]["high"] for k in range(j - lookback, j)) and \
               all(h > window[k]["high"] for k in range(j + 1, j + lookback + 1)):
                pivot_highs.append(h)
            if all(l < window[k]["low"] for k in range(j - lookback, j)) and \
               all(l < window[k]["low"] for k in range(j + 1, j + lookback + 1)):
                pivot_lows.append(l)

        swing_high = max(pivot_highs) if pivot_highs else max(c["high"] for c in window)
        swing_low  = min(pivot_lows)  if pivot_lows  else min(c["low"]  for c in window)

        diff = swing_high - swing_low
        if diff == 0:
            return None

        fib_618 = swing_high - 0.618 * diff
        fib_382 = swing_high - 0.382 * diff
        fib_500 = swing_high - 0.500 * diff
        last = candles[-1]["close"]
        tol = self.params.get("fib_tolerance", 0.5) / 100  # wider tolerance vs old 0.3

        meta = {"fib_618": round(fib_618, 4), "fib_382": round(fib_382, 4),
                "fib_500": round(fib_500, 4)}

        if abs(last - fib_618) / fib_618 <= tol:
            return ("long", meta)
        if abs(last - fib_382) / fib_382 <= tol:
            return ("short", meta)
        return None

# ── Volume Momentum Breakout ─────────────────────────────────────────────────
class VolumeMomentumStrategy(BaseStrategy):
    def generate_signal(self, candles: List[Dict]) -> Optional[Tuple[str, Dict]]:
        if len(candles) < 20:
            return None
        closes  = self._closes(candles)
        volumes = self._volumes(candles)
        avg_vol  = sum(volumes[-20:]) / 20
        momentum = closes[-1] - closes[-5]
        vol_spike = self.params.get("vol_spike_mult", 2.0)
        meta = {
            "momentum": round(momentum, 4),
            "vol_ratio": round(volumes[-1] / avg_vol, 2),
        }
        if volumes[-1] > avg_vol * vol_spike and momentum > 0:
            return ("long", meta)
        if volumes[-1] > avg_vol * vol_spike and momentum < 0:
            return ("short", meta)
        return None

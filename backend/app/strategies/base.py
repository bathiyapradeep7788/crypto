from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Tuple

class BaseStrategy(ABC):
    def __init__(self, params: dict):
        self.params = params

    @abstractmethod
    def generate_signal(self, candles: List[Dict]) -> Optional[Tuple[str, Dict]]:
        """
        Returns (direction, metadata) where direction = 'long' | 'short'
        or None if no signal. metadata = indicator values used.
        """
        pass

    def _closes(self, candles): return [c["close"] for c in candles]
    def _highs(self, candles):  return [c["high"]  for c in candles]
    def _lows(self, candles):   return [c["low"]   for c in candles]
    def _volumes(self, candles):return [c["volume"] for c in candles]

    def _ema(self, data: list, period: int) -> list:
        ema = []
        k = 2 / (period + 1)
        for i, val in enumerate(data):
            if i < period - 1:
                ema.append(None)
            elif i == period - 1:
                ema.append(sum(data[:period]) / period)
            else:
                ema.append(val * k + ema[-1] * (1 - k))
        return ema

    def _rsi(self, data: list, period: int = 14) -> list:
        rsi = [None] * period
        for i in range(period, len(data)):
            gains = [max(data[j] - data[j-1], 0) for j in range(i - period + 1, i + 1)]
            losses= [max(data[j-1] - data[j], 0) for j in range(i - period + 1, i + 1)]
            avg_gain = sum(gains) / period
            avg_loss = sum(losses) / period
            if avg_loss == 0:
                rsi.append(100)
            else:
                rs = avg_gain / avg_loss
                rsi.append(100 - (100 / (1 + rs)))
        return rsi

    def _atr(self, candles: list, period: int = 14) -> list:
        trs = []
        for i, c in enumerate(candles):
            if i == 0:
                trs.append(c["high"] - c["low"])
            else:
                prev_close = candles[i-1]["close"]
                trs.append(max(c["high"] - c["low"], abs(c["high"] - prev_close), abs(c["low"] - prev_close)))
        atr = [None] * period
        for i in range(period, len(trs) + 1):
            atr.append(sum(trs[i-period:i]) / period)
        return atr[:len(candles)]

    def _dm_di(self, candles: list, period: int = 14):
        """Returns (plus_di, minus_di) lists for ADX/DI calculations."""
        plus_dm, minus_dm, trs = [0.0], [0.0], [candles[0]["high"] - candles[0]["low"]]
        for i in range(1, len(candles)):
            up = candles[i]["high"] - candles[i-1]["high"]
            down = candles[i-1]["low"] - candles[i]["low"]
            plus_dm.append(up if (up > down and up > 0) else 0.0)
            minus_dm.append(down if (down > up and down > 0) else 0.0)
            prev_close = candles[i-1]["close"]
            trs.append(max(candles[i]["high"] - candles[i]["low"],
                            abs(candles[i]["high"] - prev_close),
                            abs(candles[i]["low"] - prev_close)))

        def _smooth(vals):
            out = [None] * period
            s = sum(vals[:period])
            out.append(s)
            for i in range(period, len(vals) - 1):
                s = s - (s / period) + vals[i + 1]
                out.append(s)
            return out

        sm_tr = _smooth(trs)
        sm_plus = _smooth(plus_dm)
        sm_minus = _smooth(minus_dm)
        plus_di, minus_di = [], []
        for tr, pdm, mdm in zip(sm_tr, sm_plus, sm_minus):
            if tr is None or tr == 0:
                plus_di.append(None); minus_di.append(None)
            else:
                plus_di.append(pdm / tr * 100)
                minus_di.append(mdm / tr * 100)
        return plus_di, minus_di

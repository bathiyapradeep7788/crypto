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

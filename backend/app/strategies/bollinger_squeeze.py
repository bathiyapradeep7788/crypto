from typing import List, Dict, Optional, Tuple
import math
from app.strategies.base import BaseStrategy

class BollingerSqueezeStrategy(BaseStrategy):
    def generate_signal(self, candles: List[Dict]) -> Optional[Tuple[str, Dict]]:
        if len(candles) < 25:
            return None

        period = int(self.params.get("bb_period", 20))
        std_mult = self.params.get("bb_std", 2.0)

        closes = self._closes(candles)
        window = closes[-period:]
        mean   = sum(window) / period
        std    = math.sqrt(sum((x - mean) ** 2 for x in window) / period)

        upper = mean + std_mult * std
        lower = mean - std_mult * std
        band_width = (upper - lower) / mean

        prev_window = closes[-period - 1:-1]
        prev_mean = sum(prev_window) / period
        prev_std  = math.sqrt(sum((x - prev_mean) ** 2 for x in prev_window) / period)
        prev_bw   = ((prev_mean + std_mult * prev_std) - (prev_mean - std_mult * prev_std)) / prev_mean

        last_close = closes[-1]
        meta = {
            "bb_upper": round(upper, 4),
            "bb_lower": round(lower, 4),
            "bb_mean":  round(mean, 4),
            "band_width": round(band_width, 6),
        }

        # Squeeze breakout: bandwidth expanding + price breaks upper/lower
        if band_width > prev_bw:
            if last_close > upper:
                return ("long", meta)
            if last_close < lower:
                return ("short", meta)

        return None

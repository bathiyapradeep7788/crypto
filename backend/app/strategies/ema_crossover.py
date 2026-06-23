from typing import List, Dict, Optional, Tuple
from app.strategies.base import BaseStrategy

class EmaCrossoverStrategy(BaseStrategy):
    def generate_signal(self, candles: List[Dict]) -> Optional[Tuple[str, Dict]]:
        if len(candles) < 60:
            return None

        fast = int(self.params.get("ema_fast", 21))
        slow = int(self.params.get("ema_slow", 55))

        closes   = self._closes(candles)
        ema_fast = self._ema(closes, fast)
        ema_slow = self._ema(closes, slow)

        if ema_fast[-1] is None or ema_slow[-1] is None:
            return None
        if ema_fast[-2] is None or ema_slow[-2] is None:
            return None

        meta = {
            "ema_fast": round(ema_fast[-1], 4),
            "ema_slow": round(ema_slow[-1], 4),
        }

        # Golden cross
        if ema_fast[-2] <= ema_slow[-2] and ema_fast[-1] > ema_slow[-1]:
            return ("long", meta)

        # Death cross
        if ema_fast[-2] >= ema_slow[-2] and ema_fast[-1] < ema_slow[-1]:
            return ("short", meta)

        return None

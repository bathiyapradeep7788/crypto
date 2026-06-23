from typing import List, Dict, Optional, Tuple
from app.strategies.base import BaseStrategy

class RsiMacdStrategy(BaseStrategy):
    def generate_signal(self, candles: List[Dict]) -> Optional[Tuple[str, Dict]]:
        if len(candles) < 40:
            return None

        rsi_period    = int(self.params.get("rsi_period", 14))
        overbought    = self.params.get("rsi_overbought", 70)
        oversold      = self.params.get("rsi_oversold", 30)
        macd_fast     = int(self.params.get("macd_fast", 12))
        macd_slow     = int(self.params.get("macd_slow", 26))
        macd_signal   = int(self.params.get("macd_signal", 9))

        closes = self._closes(candles)
        rsi    = self._rsi(closes, rsi_period)
        ema_fast = self._ema(closes, macd_fast)
        ema_slow = self._ema(closes, macd_slow)

        macd_line = [
            (f - s) if f and s else None
            for f, s in zip(ema_fast, ema_slow)
        ]
        valid_macd = [m for m in macd_line if m is not None]
        signal_line = self._ema(valid_macd, macd_signal)

        last_rsi  = rsi[-1]
        last_macd = macd_line[-1]
        if last_rsi is None or last_macd is None or not signal_line:
            return None

        last_signal = signal_line[-1]
        prev_macd   = macd_line[-2]
        prev_valid  = [m for m in macd_line[:-1] if m is not None]
        prev_sig    = self._ema(prev_valid, macd_signal)
        prev_signal = prev_sig[-1] if prev_sig else None

        meta = {
            "rsi": round(last_rsi, 2),
            "macd": round(last_macd, 6),
            "macd_signal": round(last_signal, 6),
        }

        # Long: RSI oversold + MACD crosses above signal
        if last_rsi < oversold and prev_signal and last_macd > last_signal and prev_macd <= prev_signal:
            return ("long", meta)

        # Short: RSI overbought + MACD crosses below signal
        if last_rsi > overbought and prev_signal and last_macd < last_signal and prev_macd >= prev_signal:
            return ("short", meta)

        return None

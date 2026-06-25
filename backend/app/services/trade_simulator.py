from typing import List, Dict, Optional

def simulate_trade(
    signal_candle: Dict,
    future_candles: List[Dict],
    direction: str,
    tp_pct: float,
    tp2_pct: float,
    sl_pct: float,
    atr: Optional[float] = None,
    atr_tp_mult: float = 2.0,
    atr_sl_mult: float = 1.0,
) -> Dict:
    entry = signal_candle["close"]
    multiplier = 1 if direction == "long" else -1

    if atr and atr > 0:
        # ATR-based dynamic TP/SL — adapts to current market volatility
        tp  = entry + multiplier * atr * atr_tp_mult
        tp2 = entry + multiplier * atr * atr_tp_mult * 2
        sl  = entry - multiplier * atr * atr_sl_mult
    else:
        # Fixed percentage TP/SL
        tp  = entry * (1 + multiplier * tp_pct  / 100)
        tp2 = entry * (1 + multiplier * tp2_pct / 100)
        sl  = entry * (1 - multiplier * sl_pct  / 100)

    for candle in future_candles:
        high, low = candle["high"], candle["low"]

        if (direction == "long"  and low  <= sl) or \
           (direction == "short" and high >= sl):
            return _build_result(signal_candle, candle, entry, tp, tp2, sl, "Hit SL", "Loss")

        if (direction == "long"  and high >= tp2) or \
           (direction == "short" and low  <= tp2):
            return _build_result(signal_candle, candle, entry, tp, tp2, sl, "Hit TP2", "Win")

        if (direction == "long"  and high >= tp) or \
           (direction == "short" and low  <= tp):
            return _build_result(signal_candle, candle, entry, tp, tp2, sl, "Hit TP1", "Win")

    last = future_candles[-1] if future_candles else signal_candle
    profit = (last["close"] - entry) / entry * 100 * multiplier
    return _build_result(signal_candle, last, entry, tp, tp2, sl, "Expired",
                         "Win" if profit > 0 else "Loss", profit)


def _build_result(entry_c, exit_c, entry, tp, tp2, sl, end_position, win_loss, profit=None):
    if profit is None:
        if end_position == "Hit SL":
            profit = -abs(entry - sl) / entry * 100
        else:
            target = tp if end_position == "Hit TP1" else tp2
            profit = abs(target - entry) / entry * 100

    return {
        "signal_date_time": entry_c["open_time"],
        "entry":  round(entry, 8),
        "tp":     round(tp, 8),
        "tp2":    round(tp2, 8),
        "sl":     round(sl, 8),
        "end_time":      exit_c["close_time"],
        "end_position":  end_position,
        "win_loss_rate": win_loss,
        "profit_rate":   round(profit, 4),
    }

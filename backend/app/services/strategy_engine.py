from typing import List, Dict, Optional, Tuple
from app.strategies.rsi_macd import RsiMacdStrategy
from app.strategies.ema_crossover import EmaCrossoverStrategy
from app.strategies.bollinger_squeeze import BollingerSqueezeStrategy
from app.strategies.all_strategies import (
    VwapMeanReversionStrategy, SupportResistanceStrategy,
    IchimokuStrategy, StochRsiVolumeStrategy, IctOrderBlockStrategy,
    FibonacciStrategy, VolumeMomentumStrategy,
)

STRATEGY_MAP = {
    "rsi_macd":            RsiMacdStrategy,
    "ema_crossover":       EmaCrossoverStrategy,
    "bollinger_squeeze":   BollingerSqueezeStrategy,
    "vwap_mean_reversion": VwapMeanReversionStrategy,
    "support_resistance":  SupportResistanceStrategy,
    "ichimoku":            IchimokuStrategy,
    "stoch_rsi_volume":    StochRsiVolumeStrategy,
    "ict_order_block":     IctOrderBlockStrategy,
    "fibonacci":           FibonacciStrategy,
    "volume_momentum":     VolumeMomentumStrategy,
}

def get_signal(
    strategy_id: str,
    params: dict,
    candles: List[Dict],
    secondary_id: Optional[str] = None,
) -> Optional[Tuple[str, Dict]]:
    """
    Returns (direction, metadata) or None.
    If secondary_id is set, both strategies must agree on direction.
    """
    cls = STRATEGY_MAP.get(strategy_id)
    if not cls:
        return None

    result = cls(params).generate_signal(candles)
    if result is None:
        return None

    if secondary_id:
        cls2 = STRATEGY_MAP.get(secondary_id)
        if cls2:
            result2 = cls2(params).generate_signal(candles)
            if result2 is None or result2[0] != result[0]:
                return None  # no confluence
            # merge metadata
            merged_meta = {**result[1], **{f"s2_{k}": v for k, v in result2[1].items()}}
            return (result[0], merged_meta)

    return result

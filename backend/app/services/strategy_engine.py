from typing import List, Dict, Optional, Tuple
from app.strategies.rsi_macd import RsiMacdStrategy
from app.strategies.ema_crossover import EmaCrossoverStrategy
from app.strategies.bollinger_squeeze import BollingerSqueezeStrategy
from app.strategies.all_strategies import (
    VwapMeanReversionStrategy, SupportResistanceStrategy,
    IchimokuStrategy, StochRsiVolumeStrategy, IctOrderBlockStrategy,
    FibonacciStrategy, VolumeMomentumStrategy,
)
from app.services.combined_store import COMBO_PREFIX, get_combined

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

    `strategy_id` may be:
      • a built-in strategy id (e.g. "rsi_macd")
      • a combined-strategy id "combo_<uuid>" — resolved to its two
        underlying strategies, combined with AND logic.

    If `secondary_id` is set (legacy single-run confluence), both strategies
    must agree on direction.
    """
    # Combined strategy → resolve to A AND B
    if strategy_id.startswith(COMBO_PREFIX):
        combo = get_combined(strategy_id[len(COMBO_PREFIX):])
        if not combo:
            return None
        combo_params = {**(combo.get("params") or {}), **params}
        return _confluence(combo["strategy_a"], combo["strategy_b"], combo_params, candles)

    cls = STRATEGY_MAP.get(strategy_id)
    if not cls:
        return None

    result = cls(params).generate_signal(candles)
    if result is None:
        return None

    if secondary_id:
        return _confluence(strategy_id, secondary_id, params, candles)

    return result


def _confluence(
    id_a: str, id_b: str, params: dict, candles: List[Dict]
) -> Optional[Tuple[str, Dict]]:
    """AND logic: signal fires only when both strategies agree on direction."""
    cls_a = STRATEGY_MAP.get(id_a)
    cls_b = STRATEGY_MAP.get(id_b)
    if not cls_a or not cls_b:
        return None

    res_a = cls_a(params).generate_signal(candles)
    if res_a is None:
        return None
    res_b = cls_b(params).generate_signal(candles)
    if res_b is None or res_b[0] != res_a[0]:
        return None  # no confluence

    merged_meta = {**res_a[1], **{f"s2_{k}": v for k, v in res_b[1].items()}}
    return (res_a[0], merged_meta)

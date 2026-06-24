from typing import List, Dict, Optional, Tuple
from app.strategies.rsi_macd import RsiMacdStrategy
from app.strategies.ema_crossover import EmaCrossoverStrategy
from app.strategies.bollinger_squeeze import BollingerSqueezeStrategy
from app.strategies.all_strategies import (
    VwapMeanReversionStrategy, SupportResistanceStrategy,
    IchimokuStrategy, StochRsiVolumeStrategy, IctOrderBlockStrategy,
    FibonacciStrategy, VolumeMomentumStrategy,
)
from app.services.combined_store import COMBO_PREFIX, get_combined, members_of

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
    # Combined strategy → resolve to AND across all member strategies
    if strategy_id.startswith(COMBO_PREFIX):
        combo = get_combined(strategy_id[len(COMBO_PREFIX):])
        if not combo:
            return None
        combo_params = {**(combo.get("params") or {}), **params}
        return _confluence(members_of(combo), combo_params, candles)

    cls = STRATEGY_MAP.get(strategy_id)
    if not cls:
        return None

    result = cls(params).generate_signal(candles)
    if result is None:
        return None

    if secondary_id:
        return _confluence([strategy_id, secondary_id], params, candles)

    return result


def _confluence(
    ids: List[str], params: dict, candles: List[Dict]
) -> Optional[Tuple[str, Dict]]:
    """AND logic: a signal fires only when EVERY member strategy produces a
    signal in the same direction. Metadata from all members is merged."""
    ids = [i for i in ids if i in STRATEGY_MAP]
    if len(ids) < 2:
        return None

    direction = None
    merged: Dict = {}
    for idx, sid in enumerate(ids):
        res = STRATEGY_MAP[sid](params).generate_signal(candles)
        if res is None:
            return None
        d, meta = res
        if direction is None:
            direction = d
        elif d != direction:
            return None  # members disagree → no signal
        prefix = "" if idx == 0 else f"s{idx + 1}_"
        merged.update({f"{prefix}{k}": v for k, v in meta.items()})
    return (direction, merged)

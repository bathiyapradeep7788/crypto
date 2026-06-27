from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class StrategyParam(BaseModel):
    key: str
    value: float

class BacktestRequest(BaseModel):
    coins: List[str]
    start_dt: datetime
    end_dt: datetime
    strategies: List[str] = []
    strategy_primary: Optional[str] = None
    strategy_secondary: Optional[str] = None
    params: List[StrategyParam] = []
    tp_pct: float = 2.0
    tp2_pct: float = 4.0
    sl_pct: float = 1.5
    interval: str = "1h"

    # ── Smart Filters ──────────────────────────────────────────
    # Trend filter: only allow signals aligned with EMA(period) direction
    use_trend_filter: bool = False
    trend_ema_period: int = 200

    # Session filter: only trade during UTC 08:00-20:00 (London+NY overlap)
    use_session_filter: bool = False

    # ATR-based TP/SL: overrides fixed % when enabled
    use_atr_tp_sl: bool = False
    atr_tp_mult: float = 2.0
    atr_sl_mult: float = 1.0

    # Voting / confluence: require N strategies to agree (1 = no voting, use normal mode)
    min_confluence: int = 1

    def resolved_strategies(self) -> List[str]:
        if self.strategies:
            return self.strategies
        if self.strategy_primary:
            return [self.strategy_primary]
        return []

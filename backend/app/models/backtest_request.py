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
    # New multi-select field: run several strategies in one job.
    # Each entry is either a built-in strategy id (e.g. "rsi_macd")
    # or a combined-strategy id prefixed with "combo_<uuid>".
    strategies: List[str] = []
    # Legacy single-strategy fields (kept for backward compatibility).
    strategy_primary: Optional[str] = None
    strategy_secondary: Optional[str] = None
    params: List[StrategyParam] = []
    tp_pct: float = 2.0
    tp2_pct: float = 4.0
    sl_pct: float = 1.5
    interval: str = "1h"

    def resolved_strategies(self) -> List[str]:
        """Return the list of strategy ids to run, supporting both the new
        `strategies` list and the legacy `strategy_primary` field."""
        if self.strategies:
            return self.strategies
        if self.strategy_primary:
            return [self.strategy_primary]
        return []

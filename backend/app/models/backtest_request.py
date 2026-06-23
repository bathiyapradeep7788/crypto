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
    strategy_primary: str
    strategy_secondary: Optional[str] = None
    params: List[StrategyParam] = []
    tp_pct: float = 2.0
    tp2_pct: float = 4.0
    sl_pct: float = 1.5
    interval: str = "1h"

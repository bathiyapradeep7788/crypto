from pydantic import BaseModel
from typing import Optional

class TradeSessionRequest(BaseModel):
    coin: str
    strategy_primary: str
    strategy_secondary: Optional[str] = None
    interval: str = "15m"
    tp_pct: float = 2.0
    tp2_pct: float = 4.0
    sl_pct: float = 1.5
    trade_usdt: float = 100.0
    virtual_balance: float = 10000.0  # for paper trade only
    ai_min_confidence: int = 65

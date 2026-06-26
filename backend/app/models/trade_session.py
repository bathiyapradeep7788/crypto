from pydantic import BaseModel
from typing import List, Optional

class TradeSessionRequest(BaseModel):
    coin: str
    strategy_primary: str
    strategy_secondary: Optional[str] = None
    strategies: List[str] = []          # multi-strategy voting list
    interval: str = "15m"
    tp_pct: float = 2.0
    tp2_pct: float = 4.0
    sl_pct: float = 1.5
    trade_usdt: float = 100.0
    virtual_balance: float = 10000.0   # paper trade only
    position_pct: float = 0.0          # 0 = use fixed trade_usdt; >0 = % of balance (compound mode)

    # Smart filters
    use_trend_filter: bool = True
    trend_ema_period: int = 200
    use_session_filter: bool = True
    min_confluence: int = 1             # 1 = single strategy, 2+ = voting mode
    ai_min_confidence: int = 60

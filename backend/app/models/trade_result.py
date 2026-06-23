from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class TradeResult(BaseModel):
    coin: str
    strategy: str
    complete_calculation: dict
    signal_date_time: datetime
    entry: float
    tp: float
    tp2: float
    sl: float
    end_time: datetime
    end_position: str
    win_loss_rate: str
    profit_rate: float

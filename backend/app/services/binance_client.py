import httpx
from datetime import datetime
from typing import List, Dict
from app.config import settings
from app.core.logger import emit_log

async def fetch_klines(
    symbol: str,
    interval: str,
    start_dt: datetime,
    end_dt: datetime,
    limit: int = 1000
) -> List[Dict]:
    url = f"{settings.binance_data_url}/api/v3/klines"
    start_ms = int(start_dt.timestamp() * 1000)
    end_ms = int(end_dt.timestamp() * 1000)
    all_candles = []

    async with httpx.AsyncClient(timeout=30) as client:
        cursor = start_ms
        while cursor < end_ms:
            try:
                resp = await client.get(url, params={
                    "symbol": symbol,
                    "interval": interval,
                    "startTime": cursor,
                    "endTime": end_ms,
                    "limit": limit,
                })
                resp.raise_for_status()
                raw = resp.json()

                if not raw:
                    break

                candles = [_parse_candle(c) for c in raw]
                all_candles.extend(candles)
                cursor = raw[-1][0] + 1

                if len(raw) < limit:
                    break

            except httpx.HTTPError as e:
                await emit_log("ERROR", f"Binance fetch failed for {symbol}: {str(e)}")
                break

    await emit_log("INFO", f"Fetched {len(all_candles)} candles for {symbol}")
    return all_candles


def _parse_candle(raw: list) -> Dict:
    return {
        "open_time":  datetime.utcfromtimestamp(raw[0] / 1000),
        "open":       float(raw[1]),
        "high":       float(raw[2]),
        "low":        float(raw[3]),
        "close":      float(raw[4]),
        "volume":     float(raw[5]),
        "close_time": datetime.utcfromtimestamp(raw[6] / 1000),
    }

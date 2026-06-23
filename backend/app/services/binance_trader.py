import hmac
import hashlib
import time
import httpx
from app.config import settings
from app.core.logger import emit_log
from app.services.binance_client import _parse_candle


def _sign(query_string: str) -> str:
    return hmac.new(
        settings.binance_api_secret.encode("utf-8"),
        query_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _auth_headers() -> dict:
    return {"X-MBX-APIKEY": settings.binance_api_key}


async def fetch_current_price(symbol: str) -> float:
    url = f"{settings.binance_base_url}/api/v3/ticker/price"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, params={"symbol": symbol})
        resp.raise_for_status()
        return float(resp.json()["price"])


async def fetch_recent_klines(symbol: str, interval: str, limit: int = 100) -> list:
    url = f"{settings.binance_base_url}/api/v3/klines"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params={"symbol": symbol, "interval": interval, "limit": limit})
        resp.raise_for_status()
        return [_parse_candle(c) for c in resp.json()]


async def place_demo_order(symbol: str, side: str, quantity: float) -> dict:
    """Place market order on Binance demo/testnet."""
    params = {
        "symbol": symbol,
        "side": side.upper(),
        "type": "MARKET",
        "quantity": f"{quantity:.6f}",
        "timestamp": int(time.time() * 1000),
    }
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    params["signature"] = _sign(qs)

    url = f"{settings.binance_demo_url}/api/v3/order"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(url, params=params, headers=_auth_headers())
        if resp.status_code != 200:
            await emit_log("ERROR", f"Binance order failed: {resp.text}")
            raise Exception(f"Binance order error {resp.status_code}: {resp.text}")
        return resp.json()


async def get_demo_balance() -> dict:
    """Get USDT balance from Binance demo/testnet."""
    params = {"timestamp": int(time.time() * 1000)}
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    params["signature"] = _sign(qs)

    url = f"{settings.binance_demo_url}/api/v3/account"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params=params, headers=_auth_headers())
        resp.raise_for_status()
        data = resp.json()
        return {b["asset"]: float(b["free"]) for b in data.get("balances", []) if float(b["free"]) > 0}


def calc_quantity(usdt_amount: float, price: float, symbol: str) -> float:
    """Calculate coin quantity from USDT amount."""
    qty = usdt_amount / price
    # Apply standard lot size rounding
    if price > 10000:
        return round(qty, 5)
    elif price > 100:
        return round(qty, 4)
    elif price > 1:
        return round(qty, 3)
    else:
        return round(qty, 2)

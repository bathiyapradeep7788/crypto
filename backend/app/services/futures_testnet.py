"""
Binance Futures Testnet client.
Base URL: https://testnet.binancefuture.com/fapi/v1
Supports: set leverage, set margin type, place market order (long/short), close position.
Falls back silently if API keys not configured.
"""
import hmac
import hashlib
import time
import httpx
from app.config import settings
from app.core.logger import emit_log

_FAPI = "https://testnet.binancefuture.com/fapi/v1"


def _sign(params: dict) -> str:
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return hmac.new(
        settings.binance_api_secret.encode(),
        qs.encode(),
        hashlib.sha256,
    ).hexdigest()


def _headers() -> dict:
    return {"X-MBX-APIKEY": settings.binance_api_key}


def _has_keys() -> bool:
    return bool(settings.binance_api_key and settings.binance_api_secret)


async def setup_symbol(symbol: str, leverage: int = 1):
    """Set ISOLATED margin + 1x leverage for a symbol (once per session)."""
    if not _has_keys():
        return
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            ts = int(time.time() * 1000)
            # Set margin type
            p = {"symbol": symbol, "marginType": "ISOLATED", "timestamp": ts}
            p["signature"] = _sign(p)
            await c.post(f"{_FAPI}/marginType", params=p, headers=_headers())
            # Set leverage
            ts = int(time.time() * 1000)
            p2 = {"symbol": symbol, "leverage": leverage, "timestamp": ts}
            p2["signature"] = _sign(p2)
            await c.post(f"{_FAPI}/leverage", params=p2, headers=_headers())
    except Exception as e:
        await emit_log("WARN", f"[Futures] Setup {symbol} failed: {e}")


async def place_order(symbol: str, side: str, usdt_amount: float, price: float) -> dict:
    """
    Place a MARKET order on futures testnet.
    side = 'BUY' (long) or 'SELL' (short)
    Returns order dict or empty dict if keys missing.
    """
    if not _has_keys():
        return {}
    try:
        qty = _calc_qty(usdt_amount, price, symbol)
        ts  = int(time.time() * 1000)
        params = {
            "symbol":   symbol,
            "side":     side.upper(),
            "type":     "MARKET",
            "quantity": str(qty),
            "timestamp": ts,
        }
        params["signature"] = _sign(params)
        async with httpx.AsyncClient(timeout=15) as c:
            resp = await c.post(f"{_FAPI}/order", params=params, headers=_headers())
            if resp.status_code == 200:
                data = resp.json()
                await emit_log("INFO", f"[Futures] {side} {symbol} qty={qty} orderId={data.get('orderId')}")
                return data
            else:
                await emit_log("ERROR", f"[Futures] Order error {resp.status_code}: {resp.text[:200]}")
                return {}
    except Exception as e:
        await emit_log("ERROR", f"[Futures] place_order failed: {e}")
        return {}


async def close_position(symbol: str, direction: str, usdt_amount: float, price: float) -> dict:
    """Close an open position by placing opposite side order."""
    close_side = "SELL" if direction == "long" else "BUY"
    return await place_order(symbol, close_side, usdt_amount, price)


async def get_futures_balance() -> float:
    """Get available USDT balance from futures testnet account."""
    if not _has_keys():
        return 0.0
    try:
        ts = int(time.time() * 1000)
        params = {"timestamp": ts}
        params["signature"] = _sign(params)
        async with httpx.AsyncClient(timeout=10) as c:
            resp = await c.get(f"{_FAPI}/account", params=params, headers=_headers())
            if resp.status_code == 200:
                data = resp.json()
                return float(data.get("availableBalance", 0))
    except Exception as e:
        await emit_log("ERROR", f"[Futures] get_balance failed: {e}")
    return 0.0


def _calc_qty(usdt: float, price: float, symbol: str) -> float:
    if price <= 0:
        return 0
    qty = usdt / price
    if price > 10000:
        return round(qty, 3)
    elif price > 1000:
        return round(qty, 3)
    elif price > 100:
        return round(qty, 2)
    elif price > 1:
        return round(qty, 1)
    else:
        return round(qty, 0)

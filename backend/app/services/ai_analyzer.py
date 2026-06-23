import json
from app.config import settings
from app.core.logger import emit_log


async def analyze_signal(
    symbol: str,
    direction: str,
    strategy: str,
    candles: list,
    meta: dict,
) -> dict:
    """
    Use Claude AI to validate a trading signal.
    Returns {confidence: 0-100, recommendation: 'trade'|'skip', analysis: str}
    Falls back to {confidence: 70, recommendation: 'trade'} if no API key.
    """
    if not settings.anthropic_api_key or settings.anthropic_api_key == "your_anthropic_api_key_here":
        return {"confidence": 70, "recommendation": "trade", "analysis": "AI analysis skipped (no API key)"}

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        last_10 = candles[-10:] if len(candles) >= 10 else candles
        candle_summary = [
            {
                "time": c["open_time"].strftime("%Y-%m-%d %H:%M") if hasattr(c["open_time"], "strftime") else str(c["open_time"]),
                "open": round(c["open"], 4),
                "high": round(c["high"], 4),
                "low": round(c["low"], 4),
                "close": round(c["close"], 4),
                "volume": round(c["volume"], 2),
            }
            for c in last_10
        ]

        current_price = candles[-1]["close"]
        price_change_pct = ((candles[-1]["close"] - candles[-10]["close"]) / candles[-10]["close"] * 100) if len(candles) >= 10 else 0

        prompt = f"""You are a professional crypto trading analyst. Analyze this trading signal and give your assessment.

Symbol: {symbol}
Direction: {direction.upper()} (strategy wants to go {direction})
Strategy: {strategy}
Current Price: {current_price}
Price change (last 10 candles): {price_change_pct:.2f}%
Strategy indicators: {json.dumps(meta, default=str)}

Last 10 candles (OHLCV):
{json.dumps(candle_summary, indent=2)}

Assess this signal. Consider:
1. Is the direction consistent with recent price action?
2. Are the indicators reliable in this market context?
3. What is the risk level?

Respond ONLY with a JSON object (no markdown, no explanation outside JSON):
{{"confidence": <0-100>, "recommendation": "<trade|skip>", "analysis": "<1-2 sentence reason>"}}

confidence >= 65 means trade. Be decisive."""

        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = message.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw.strip())

        await emit_log("INFO", f"AI [{symbol}] {direction}: confidence={result.get('confidence')}% → {result.get('recommendation')} | {result.get('analysis','')[:80]}")
        return result

    except Exception as e:
        await emit_log("WARN", f"AI analysis failed for {symbol}: {str(e)} — using fallback")
        return {"confidence": 65, "recommendation": "trade", "analysis": f"AI fallback: {str(e)[:60]}"}

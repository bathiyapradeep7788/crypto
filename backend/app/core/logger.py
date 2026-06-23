import asyncio
import json
from datetime import datetime, timezone

_log_queue: asyncio.Queue = asyncio.Queue(maxsize=500)

async def emit_log(level: str, message: str):
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "message": message,
    }
    try:
        _log_queue.put_nowait(entry)
    except asyncio.QueueFull:
        pass

async def log_stream_generator():
    while True:
        entry = await _log_queue.get()
        yield f"data: {json.dumps(entry)}\n\n"

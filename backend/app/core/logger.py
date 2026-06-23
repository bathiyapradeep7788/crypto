from collections import deque
from datetime import datetime, timezone
from threading import Lock

# Recent-logs ring buffer. Polling-based (serverless-friendly) — Vercel
# functions cannot hold the long-lived SSE connection the old design used.
_MAX = 500
_logs: deque = deque(maxlen=_MAX)
_seq = 0
_lock = Lock()


async def emit_log(level: str, message: str):
    global _seq
    with _lock:
        _seq += 1
        _logs.append({
            "id": _seq,
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "message": message,
        })


def get_recent_logs(after_id: int = 0):
    """Return logs with id greater than `after_id` (chronological order)."""
    with _lock:
        return [entry for entry in _logs if entry["id"] > after_id]

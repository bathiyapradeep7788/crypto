from collections import deque
from datetime import datetime, timezone
from threading import Lock
from app.config import settings

# In-memory ring buffer for the running instance, plus durable persistence to
# Supabase (system_logs) so logs survive cold starts and are visible from any
# serverless instance — the logs page reads the persisted rows.
_MAX = 500
_logs: deque = deque(maxlen=_MAX)
_seq = 0
_lock = Lock()
_flushed_upto = 0
_since_flush = 0


def _sb():
    if not settings.supabase_url or not settings.supabase_key:
        return None
    try:
        from supabase import create_client
        return create_client(settings.supabase_url, settings.supabase_key)
    except Exception:
        return None


async def emit_log(level: str, message: str):
    global _seq, _since_flush
    with _lock:
        _seq += 1
        _logs.append({
            "id": _seq,
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "message": message,
        })
        _since_flush += 1
        due = _since_flush >= 30
    # Flush in batches so long-running contexts persist without a DB write per log.
    if due:
        flush_to_db()


def get_recent_logs(after_id: int = 0):
    with _lock:
        return [entry for entry in _logs if entry["id"] > after_id]


def flush_to_db():
    """Bulk-insert buffered logs that haven't been persisted yet."""
    global _flushed_upto, _since_flush
    with _lock:
        pending = [e for e in _logs if e["id"] > _flushed_upto]
        if pending:
            _flushed_upto = pending[-1]["id"]
        _since_flush = 0
    if not pending:
        return
    client = _sb()
    if not client:
        return
    try:
        client.table("system_logs").insert(
            [{"ts": e["ts"], "level": e["level"], "message": e["message"]} for e in pending]
        ).execute()
    except Exception:
        pass


def get_persisted_logs(after_id: int = 0, limit: int = 200):
    """Read persisted logs from Supabase.

    after_id == 0 → newest `limit` rows (initial load).
    after_id > 0  → rows newer than after_id (incremental poll).
    Always returned in ascending id order.
    """
    client = _sb()
    if not client:
        return []
    try:
        if after_id > 0:
            res = (client.table("system_logs")
                   .select("*").gt("id", after_id)
                   .order("id", desc=False).limit(limit).execute())
            return res.data or []
        res = (client.table("system_logs")
               .select("*")
               .order("id", desc=True).limit(limit).execute())
        return list(reversed(res.data or []))
    except Exception:
        return []

"""
Supabase-backed backtest job store.

On Vercel the API runs as stateless serverless functions — an in-memory job
dict isn't shared between the instance that starts a backtest and the instance
that serves a status poll (caused `not_found`). Persisting job state to
Supabase lets any instance read it. An in-memory cache fronts it so the running
instance avoids a DB round-trip on every progress tick.
"""
from typing import Optional
from app.config import settings

_cache: dict = {}
_TABLE = "backtest_jobs"


def _client():
    if not settings.supabase_url or not settings.supabase_key:
        return None
    from supabase import create_client
    return create_client(settings.supabase_url, settings.supabase_key)


def create_job(job_id: str, total: int):
    state = {"status": "running", "processed": 0, "total": total}
    _cache[job_id] = state
    client = _client()
    if client:
        try:
            client.table(_TABLE).insert({"id": job_id, **state}).execute()
        except Exception:
            pass
    return state


def update_progress(job_id: str, processed: int, total: int):
    if job_id in _cache:
        _cache[job_id].update({"processed": processed, "total": total})
    client = _client()
    if client:
        try:
            client.table(_TABLE).update(
                {"processed": processed, "total": total}
            ).eq("id", job_id).execute()
        except Exception:
            pass


def finish_job(job_id: str, status: str, results=None):
    if job_id in _cache:
        _cache[job_id].update({"status": status, "results": results})
    client = _client()
    if client:
        try:
            client.table(_TABLE).update(
                {"status": status, "results": results}
            ).eq("id", job_id).execute()
        except Exception:
            pass


def get_job(job_id: str) -> Optional[dict]:
    client = _client()
    if client:
        try:
            res = client.table(_TABLE).select("*").eq("id", job_id).execute()
            if res.data:
                row = res.data[0]
                return {
                    "status": row["status"],
                    "processed": row["processed"],
                    "total": row["total"],
                    "results": row.get("results"),
                }
        except Exception:
            pass
    return _cache.get(job_id, {"status": "not_found"})

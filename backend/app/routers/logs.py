from fastapi import APIRouter, Query
from app.core.logger import get_recent_logs, get_persisted_logs

router = APIRouter()


@router.get("/recent")
async def recent_logs(after_id: int = Query(default=0)):
    """Polling endpoint — persisted (Supabase) logs newer than `after_id`.

    Reading from Supabase makes logs survive cold starts and be visible from
    any serverless instance. Falls back to the in-memory buffer if the DB has
    nothing yet (e.g. local dev without Supabase).
    """
    logs = get_persisted_logs(after_id)
    if not logs:
        mem = get_recent_logs(after_id)
        last_id = mem[-1]["id"] if mem else after_id
        return {"logs": mem, "last_id": last_id}
    last_id = logs[-1]["id"] if logs else after_id
    return {"logs": logs, "last_id": last_id}

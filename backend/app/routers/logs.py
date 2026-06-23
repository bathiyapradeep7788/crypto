from fastapi import APIRouter, Query
from app.core.logger import get_recent_logs

router = APIRouter()


@router.get("/recent")
async def recent_logs(after_id: int = Query(default=0)):
    """Polling endpoint — returns logs newer than `after_id`.

    Replaces the old SSE `/stream` endpoint, which could not run on serverless
    (no long-lived connections). The frontend polls this every couple seconds.
    """
    logs = get_recent_logs(after_id)
    last_id = logs[-1]["id"] if logs else after_id
    return {"logs": logs, "last_id": last_id}

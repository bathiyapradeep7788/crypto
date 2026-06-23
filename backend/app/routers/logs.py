from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.core.logger import log_stream_generator

router = APIRouter()

@router.get("/stream")
async def stream_logs():
    return StreamingResponse(
        log_stream_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

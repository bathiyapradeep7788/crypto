import uuid
from fastapi import APIRouter
from app.models.backtest_request import BacktestRequest
from app.core.task_runner import run_backtest_pipeline
from app.services import job_store

router = APIRouter()


@router.post("/run")
async def run_backtest(req: BacktestRequest):
    """Run the backtest synchronously and return results in the response.

    Serverless functions are frozen after the HTTP response is sent, so a
    background task can't reliably finish a long job. Running inline keeps the
    function alive for the whole computation. The frontend sends one strategy
    per request to keep each call within the function time limit.
    """
    job_id = str(uuid.uuid4())
    total = max(1, len(req.resolved_strategies())) * len(req.coins)
    job_store.create_job(job_id, total)
    results = await run_backtest_pipeline(job_id, req)
    return {"job_id": job_id, "status": "done", "processed": total, "total": total, "results": results}


@router.get("/status/{job_id}")
async def get_status(job_id: str):
    return job_store.get_job(job_id)

import uuid
from fastapi import BackgroundTasks, APIRouter
from app.models.backtest_request import BacktestRequest
from app.core.task_runner import run_backtest_pipeline

router = APIRouter()
_active_jobs: dict = {}

@router.post("/run")
async def run_backtest(req: BacktestRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    total = max(1, len(req.resolved_strategies())) * len(req.coins)
    _active_jobs[job_id] = {"status": "running", "processed": 0, "total": total}
    background_tasks.add_task(run_backtest_pipeline, job_id, req, _active_jobs)
    return {"job_id": job_id}

@router.get("/status/{job_id}")
async def get_status(job_id: str):
    return _active_jobs.get(job_id, {"status": "not_found"})

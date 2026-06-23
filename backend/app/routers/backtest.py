import uuid
from fastapi import BackgroundTasks, APIRouter
from app.models.backtest_request import BacktestRequest
from app.core.task_runner import run_backtest_pipeline
from app.services import job_store

router = APIRouter()


@router.post("/run")
async def run_backtest(req: BacktestRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    total = max(1, len(req.resolved_strategies())) * len(req.coins)
    job_store.create_job(job_id, total)
    background_tasks.add_task(run_backtest_pipeline, job_id, req)
    return {"job_id": job_id}


@router.get("/status/{job_id}")
async def get_status(job_id: str):
    return job_store.get_job(job_id)

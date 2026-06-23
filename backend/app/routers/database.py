from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.config import settings

router = APIRouter()

ALLOWED_TABLES = {"backtest_results", "paper_trades", "live_trades"}


def _get_client():
    if not settings.supabase_url or not settings.supabase_key:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    from supabase import create_client
    return create_client(settings.supabase_url, settings.supabase_key)


@router.get("/rows/{table}")
async def get_rows(
    table: str,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0),
    coin: Optional[str] = Query(default=None),
    strategy: Optional[str] = Query(default=None),
    win_loss: Optional[str] = Query(default=None),
):
    if table not in ALLOWED_TABLES:
        raise HTTPException(status_code=400, detail="Invalid table")
    client = _get_client()

    def _apply(q):
        if coin:
            q = q.eq("coin", coin)
        if strategy:
            q = q.eq("strategy", strategy)
        if win_loss and table == "backtest_results":
            q = q.eq("win_loss_rate", win_loss)
        return q

    query = _apply(client.table(table).select("*")).order("created_at", desc=True)
    res = query.range(offset, offset + limit - 1).execute()
    count_res = _apply(client.table(table).select("id", count="exact")).execute()
    return {"rows": res.data, "total": count_res.count}


@router.get("/distinct/{table}/{column}")
async def get_distinct(table: str, column: str):
    """Distinct values for a column — powers the filter dropdowns."""
    if table not in ALLOWED_TABLES:
        raise HTTPException(status_code=400, detail="Invalid table")
    if column not in {"coin", "strategy"}:
        raise HTTPException(status_code=400, detail="Invalid column")
    client = _get_client()
    res = client.table(table).select(column).limit(2000).execute()
    values = sorted({r[column] for r in res.data if r.get(column)})
    return {"values": values}


@router.delete("/rows/{table}/{row_id}")
async def delete_row(table: str, row_id: str):
    if table not in ALLOWED_TABLES:
        raise HTTPException(status_code=400, detail="Invalid table")
    client = _get_client()
    client.table(table).delete().eq("id", row_id).execute()
    return {"deleted": row_id}


@router.delete("/rows/{table}")
async def delete_all_rows(table: str):
    if table not in ALLOWED_TABLES:
        raise HTTPException(status_code=400, detail="Invalid table")
    client = _get_client()
    client.table(table).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    return {"cleared": table}


@router.get("/stats")
async def get_stats():
    client = _get_client()
    result = {}
    for table in ALLOWED_TABLES:
        try:
            res = client.table(table).select("id", count="exact").execute()
            result[table] = res.count or 0
        except Exception:
            result[table] = 0
    return result

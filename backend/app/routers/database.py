from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.config import settings

router = APIRouter()

ALLOWED_TABLES = {"backtest_results", "paper_trades", "live_trades", "monitor_positions", "monitor_trades"}


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
    filter_col: Optional[str] = Query(default=None),
    filter_val: Optional[str] = Query(default=None),
):
    if table not in ALLOWED_TABLES:
        raise HTTPException(status_code=400, detail="Invalid table")
    client = _get_client()
    query = client.table(table).select("*").order("created_at", desc=True)
    count_query = client.table(table).select("id", count="exact")
    if filter_col and filter_val is not None:
        query = query.eq(filter_col, filter_val)
        count_query = count_query.eq(filter_col, filter_val)
    res = query.range(offset, offset + limit - 1).execute()
    count_res = count_query.execute()
    return {"rows": res.data, "total": count_res.count}


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

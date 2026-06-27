from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.config import settings

router = APIRouter()

ALLOWED_TABLES = {"backtest_results", "paper_trades", "live_trades", "paper_trade_sessions"}


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
    direction: Optional[str] = Query(default=None),
    exit_reason: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    min_pnl: Optional[float] = Query(default=None),
    max_pnl: Optional[float] = Query(default=None),
):
    if table not in ALLOWED_TABLES:
        raise HTTPException(status_code=400, detail="Invalid table")
    client = _get_client()

    # Determine the timestamp column for this table
    ts_col = "created_at" if table == "backtest_results" else "opened_at"
    pnl_col = "profit_rate" if table == "backtest_results" else "profit_pct"

    def _apply(q):
        if coin:
            q = q.eq("coin", coin)
        if strategy:
            q = q.eq("strategy", strategy)
        if win_loss and table == "backtest_results":
            q = q.eq("win_loss_rate", win_loss)
        if direction and table != "backtest_results":
            q = q.eq("direction", direction)
        if exit_reason and table != "backtest_results":
            q = q.eq("exit_reason", exit_reason)
        if date_from:
            q = q.gte(ts_col, date_from)
        if date_to:
            q = q.lte(ts_col, date_to + "T23:59:59")
        if min_pnl is not None:
            q = q.gte(pnl_col, min_pnl)
        if max_pnl is not None:
            q = q.lte(pnl_col, max_pnl)
        return q

    order_col = ts_col
    query = _apply(client.table(table).select("*")).order(order_col, desc=True)
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
    # backtest_results can have hundreds of thousands of rows — use a DB-side
    # DISTINCT function. Other tables are small, so paginate them.
    if table == "backtest_results":
        rpc = "distinct_backtest_coins" if column == "coin" else "distinct_backtest_strategies"
        res = client.rpc(rpc).execute()
        vals = []
        for row in res.data or []:
            vals.append(row if isinstance(row, str) else list(row.values())[0])
        return {"values": sorted(v for v in vals if v)}

    values: set = set()
    offset, page = 0, 1000
    while offset < 50000:
        res = client.table(table).select(column).range(offset, offset + page - 1).execute()
        batch = res.data or []
        for r in batch:
            if r.get(column):
                values.add(r[column])
        if len(batch) < page:
            break
        offset += page
    return {"values": sorted(values)}


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
    # TRUNCATE via RPC — a row-by-row DELETE times out on large tables
    # (backtest_results can have hundreds of thousands of rows).
    try:
        client.rpc("clear_table", {"tbl": table}).execute()
    except Exception:
        # Fallback for environments without the RPC
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


@router.get("/export/{table}")
async def export_table(
    table: str,
    coin: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
):
    """Export table as CSV text — used by Reports text download."""
    if table not in ALLOWED_TABLES:
        raise HTTPException(status_code=400, detail="Invalid table")
    client = _get_client()
    ts_col = "created_at" if table == "backtest_results" else "opened_at"
    q = client.table(table).select("*")
    if coin:
        q = q.eq("coin", coin)
    if date_from:
        q = q.gte(ts_col, date_from)
    if date_to:
        q = q.lte(ts_col, date_to + "T23:59:59")
    rows = q.order(ts_col, desc=True).limit(5000).execute().data
    if not rows:
        return {"text": "No records found."}
    cols = list(rows[0].keys())
    lines = ["\t".join(cols)]
    for r in rows:
        lines.append("\t".join(str(r.get(c, "")) for c in cols))
    return {"text": "\n".join(lines), "rows": len(rows)}

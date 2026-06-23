"""
CRUD helpers for user-defined combined strategies stored in Supabase.

A combined strategy joins two built-in strategies with AND logic — a signal
fires only when BOTH underlying strategies agree on the same direction.
Combined strategies are referenced elsewhere by the id form "combo_<uuid>".
"""
from typing import List, Dict, Optional
from app.config import settings

COMBO_PREFIX = "combo_"
_cache: Dict[str, dict] = {}


def _client():
    if not settings.supabase_url or not settings.supabase_key:
        return None
    from supabase import create_client
    return create_client(settings.supabase_url, settings.supabase_key)


def list_combined() -> List[dict]:
    client = _client()
    if not client:
        return []
    res = client.table("combined_strategies").select("*").order("created_at", desc=True).execute()
    rows = res.data or []
    for row in rows:
        _cache[row["id"]] = row
    return rows


def create_combined(name: str, strategy_a: str, strategy_b: str,
                    params: Optional[dict] = None) -> dict:
    client = _client()
    if not client:
        raise RuntimeError("Supabase not configured")
    data = {
        "name": name,
        "strategy_a": strategy_a,
        "strategy_b": strategy_b,
        "logic": "AND",
        "params": params or {},
    }
    res = client.table("combined_strategies").insert(data).execute()
    row = res.data[0]
    _cache[row["id"]] = row
    return row


def update_combined(combo_id: str, fields: dict) -> dict:
    client = _client()
    if not client:
        raise RuntimeError("Supabase not configured")
    allowed = {k: v for k, v in fields.items()
               if k in {"name", "strategy_a", "strategy_b", "params"}}
    res = client.table("combined_strategies").update(allowed).eq("id", combo_id).execute()
    row = res.data[0]
    _cache[row["id"]] = row
    return row


def delete_combined(combo_id: str) -> None:
    client = _client()
    if not client:
        raise RuntimeError("Supabase not configured")
    client.table("combined_strategies").delete().eq("id", combo_id).execute()
    _cache.pop(combo_id, None)


def get_combined(combo_id: str) -> Optional[dict]:
    """Look up a combined strategy by its raw uuid (cache first, then DB)."""
    if combo_id in _cache:
        return _cache[combo_id]
    client = _client()
    if not client:
        return None
    res = client.table("combined_strategies").select("*").eq("id", combo_id).execute()
    if res.data:
        _cache[combo_id] = res.data[0]
        return res.data[0]
    return None

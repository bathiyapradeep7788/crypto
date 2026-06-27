"""
CRUD helpers for user-defined combined strategies stored in Supabase.

A combined strategy joins TWO OR MORE built-in strategies with AND logic — a
signal fires only when ALL member strategies agree on the same direction.
Combined strategies are referenced elsewhere by the id form "combo_<uuid>".
The member list lives in `members` (jsonb array); strategy_a/strategy_b are
kept populated from the first two members for backward compatibility.
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


def members_of(combo: dict) -> List[str]:
    """Return the member strategy ids, tolerating old rows that only have a/b."""
    m = combo.get("members") or []
    if m:
        return m
    return [s for s in (combo.get("strategy_a"), combo.get("strategy_b")) if s]


def list_combined() -> List[dict]:
    client = _client()
    if not client:
        return []
    res = client.table("combined_strategies").select("*").order("created_at", desc=True).execute()
    rows = res.data or []
    for row in rows:
        _cache[row["id"]] = row
    return rows


def create_combined(name: str, members: List[str],
                    params: Optional[dict] = None) -> dict:
    client = _client()
    if not client:
        raise RuntimeError("Supabase not configured")
    data = {
        "name": name,
        "members": members,
        "strategy_a": members[0] if len(members) > 0 else None,
        "strategy_b": members[1] if len(members) > 1 else None,
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
               if k in {"name", "members", "params"}}
    if "members" in allowed:
        m = allowed["members"]
        allowed["strategy_a"] = m[0] if len(m) > 0 else None
        allowed["strategy_b"] = m[1] if len(m) > 1 else None
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

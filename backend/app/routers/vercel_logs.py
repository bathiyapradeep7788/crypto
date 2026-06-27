from fastapi import APIRouter, Query
import httpx
import os

router = APIRouter()

VERCEL_TOKEN = os.getenv("VERCEL_TOKEN", "")
VERCEL_TEAM = os.getenv("VERCEL_TEAM_ID", "")
VERCEL_API = "https://api.vercel.com"


def _params(extra: dict | None = None) -> dict:
    p = {}
    if VERCEL_TEAM:
        p["teamId"] = VERCEL_TEAM
    if extra:
        p.update(extra)
    return p


def _headers() -> dict:
    return {"Authorization": f"Bearer {VERCEL_TOKEN}"}


@router.get("/deployments")
async def get_deployments(limit: int = Query(default=20, le=100)):
    """List recent Vercel deployments (acts like Render's service/deploy list)."""
    if not VERCEL_TOKEN:
        return {"error": "VERCEL_TOKEN not configured", "deployments": []}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{VERCEL_API}/v6/deployments",
            headers=_headers(),
            params=_params({"limit": limit}),
        )
        if r.status_code != 200:
            return {"error": f"Vercel API error {r.status_code}: {r.text}", "deployments": []}
        data = r.json()
        deps = [
            {
                "id": d.get("uid"),
                "name": d.get("name"),
                "url": d.get("url"),
                "state": d.get("state") or d.get("readyState"),
                "created": d.get("created") or d.get("createdAt"),
            }
            for d in data.get("deployments", [])
        ]
        return {"deployments": deps}


@router.get("/logs/{deployment_id}")
async def get_logs(deployment_id: str, limit: int = Query(default=200, le=1000)):
    """Get build/runtime event logs for a deployment."""
    if not VERCEL_TOKEN:
        return {"error": "VERCEL_TOKEN not configured", "logs": []}
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(
            f"{VERCEL_API}/v3/deployments/{deployment_id}/events",
            headers=_headers(),
            params=_params({"limit": limit}),
        )
        if r.status_code != 200:
            return {"error": f"Vercel API error {r.status_code}: {r.text}", "logs": []}
        raw = r.json()
        rows = raw if isinstance(raw, list) else raw.get("events", [])
        logs = []
        for e in rows:
            text = e.get("text") or e.get("message") or ""
            payload = e.get("payload") or {}
            if not text and isinstance(payload, dict):
                text = payload.get("text") or payload.get("message") or ""
            logs.append({
                "timestamp": e.get("created") or e.get("date"),
                "message": text,
                "type": e.get("type", ""),
            })
        return {"logs": logs}

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
import httpx
import os

router = APIRouter()

RENDER_API_KEY = os.getenv("RENDER_API_KEY", "")
RENDER_API_BASE = "https://api.render.com/v1"


@router.get("/services")
async def get_services():
    """List all Render services for this account."""
    if not RENDER_API_KEY:
        return {"error": "RENDER_API_KEY not configured", "services": []}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{RENDER_API_BASE}/services",
            headers={"Authorization": f"Bearer {RENDER_API_KEY}"},
        )
        if r.status_code != 200:
            return {"error": f"Render API error {r.status_code}", "services": []}
        data = r.json()
        return {"services": [{"id": s["service"]["id"], "name": s["service"]["name"], "status": s["service"]["suspended"]} for s in data]}


@router.get("/logs/{service_id}")
async def get_logs(service_id: str, limit: int = Query(default=100, le=500)):
    """Get recent logs from a Render service."""
    if not RENDER_API_KEY:
        return {"error": "RENDER_API_KEY not configured", "logs": []}
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{RENDER_API_BASE}/services/{service_id}/logs",
            headers={"Authorization": f"Bearer {RENDER_API_KEY}"},
            params={"limit": limit},
        )
        if r.status_code != 200:
            return {"error": f"Render API error {r.status_code}: {r.text}", "logs": []}
        return r.json()


@router.get("/deploys/{service_id}")
async def get_deploys(service_id: str):
    """Get recent deploys for a Render service."""
    if not RENDER_API_KEY:
        return {"error": "RENDER_API_KEY not configured", "deploys": []}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{RENDER_API_BASE}/services/{service_id}/deploys",
            headers={"Authorization": f"Bearer {RENDER_API_KEY}"},
            params={"limit": 10},
        )
        if r.status_code != 200:
            return {"error": f"Render API error {r.status_code}", "deploys": []}
        return r.json()

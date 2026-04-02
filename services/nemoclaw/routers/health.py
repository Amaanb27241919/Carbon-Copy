from fastapi import APIRouter
from fastapi.responses import PlainTextResponse
from datetime import datetime, timezone

router = APIRouter()


@router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "nemoclaw",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return (
        "# HELP nemoclaw_up NemoClaw service up\n"
        "# TYPE nemoclaw_up gauge\n"
        "nemoclaw_up 1\n"
    )

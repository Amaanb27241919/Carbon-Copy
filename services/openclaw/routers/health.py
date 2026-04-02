from fastapi import APIRouter
from datetime import datetime, timezone

router = APIRouter()


@router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "openclaw",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/metrics")
async def metrics():
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(
        "# HELP openclaw_up OpenClaw service up\n"
        "# TYPE openclaw_up gauge\n"
        "openclaw_up 1\n"
    )

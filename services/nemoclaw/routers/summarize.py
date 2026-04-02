from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import logging

from services.llm_client import summarize_text
from services.data_client import save_output

router = APIRouter()
logger = logging.getLogger("nemoclaw")


class SummarizeRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to summarize")
    max_length: Optional[int] = Field(default=200, ge=20, le=2000, description="Approximate max words in summary")
    style: Optional[str] = Field(default="concise", description="Summarization style: concise, detailed, bullet-points")


class SummarizeResponse(BaseModel):
    summary: str
    tokens_used: int
    output_id: str


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize_endpoint(request: SummarizeRequest):
    if len(request.text) > 200000:
        raise HTTPException(status_code=413, detail="Text too long (max 200,000 characters)")

    try:
        result = await summarize_text(request.text, request.max_length or 200, request.style or "concise")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM service error: {str(exc)}") from exc

    try:
        output_id = await save_output(
            input_data={"text_length": len(request.text), "max_length": request.max_length, "style": request.style},
            output_data={"summary": result["summary"]},
            metadata={"tokens_used": result["tokens_used"]},
        )
    except Exception as exc:
        logger.warning("Failed to persist summarize output: %s", str(exc))
        output_id = "not-persisted"

    return SummarizeResponse(
        summary=result["summary"],
        tokens_used=result["tokens_used"],
        output_id=output_id,
    )

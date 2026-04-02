from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import logging

from services.llm_client import classify_text
from services.data_client import save_output

router = APIRouter()
logger = logging.getLogger("nemoclaw")


class ClassifyRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to classify")
    labels: list[str] = Field(..., min_length=1, description="Candidate labels")
    multi_label: bool = Field(default=False, description="Allow multiple labels")


class LabelScore(BaseModel):
    label: str
    confidence: float


class ClassifyResponse(BaseModel):
    labels: list[LabelScore]
    output_id: str


@router.post("/classify", response_model=ClassifyResponse)
async def classify_endpoint(request: ClassifyRequest):
    if len(request.text) > 50000:
        raise HTTPException(status_code=413, detail="Text too long (max 50,000 characters)")
    if len(request.labels) > 50:
        raise HTTPException(status_code=400, detail="Too many labels (max 50)")

    try:
        result = await classify_text(request.text, request.labels, request.multi_label)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM service error: {str(exc)}") from exc

    try:
        output_id = await save_output(
            input_data={"text_length": len(request.text), "labels": request.labels, "multi_label": request.multi_label},
            output_data={"labels": [l.model_dump() for l in result]},
            metadata={},
        )
    except Exception as exc:
        logger.warning("Failed to persist classify output: %s", str(exc))
        output_id = "not-persisted"

    return ClassifyResponse(labels=result, output_id=output_id)

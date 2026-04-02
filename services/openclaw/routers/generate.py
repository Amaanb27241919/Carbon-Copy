from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import logging

from services.llm_client import generate_code
from services.data_client import save_output
from config import settings

router = APIRouter()
logger = logging.getLogger("openclaw")


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="Natural-language description of the code to generate")
    language: Optional[str] = Field(None, description="Target programming language")
    context: Optional[str] = Field(None, description="Additional context or existing code to build upon")


class GenerateResponse(BaseModel):
    code: str
    explanation: str
    language: str
    tokens_used: int
    output_id: str


@router.post("/generate", response_model=GenerateResponse)
async def generate_endpoint(request: GenerateRequest):
    if request.context and len(request.context) > settings.max_code_length_chars:
        raise HTTPException(
            status_code=413,
            detail=f"Context exceeds maximum length of {settings.max_code_length_chars} characters",
        )

    language = request.language or "python"

    try:
        result = await generate_code(request.prompt, language, request.context)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM service error: {str(exc)}") from exc

    try:
        output_id = await save_output(
            project="openclaw",
            input_data={"prompt": request.prompt, "language": language},
            output_data={"code": result["code"], "explanation": result["explanation"]},
            metadata={"tokens_used": result["tokens_used"], "model": settings.llm_model},
        )
    except Exception as exc:
        logger.warning("Failed to persist output: %s", str(exc))
        output_id = "not-persisted"

    return GenerateResponse(
        code=result["code"],
        explanation=result["explanation"],
        language=language,
        tokens_used=result["tokens_used"],
        output_id=output_id,
    )

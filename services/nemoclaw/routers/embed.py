from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import logging

from services.llm_client import embed_texts
from services.data_client import save_output

router = APIRouter()
logger = logging.getLogger("nemoclaw")


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=100, description="List of texts to embed")


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    model: str
    output_id: str


@router.post("/embed", response_model=EmbedResponse)
async def embed_endpoint(request: EmbedRequest):
    if not request.texts:
        raise HTTPException(status_code=400, detail="texts list cannot be empty")
    if len(request.texts) > 100:
        raise HTTPException(status_code=400, detail="Too many texts (max 100 per request)")

    # Sanity check individual text lengths
    for i, text in enumerate(request.texts):
        if len(text) > 8192:
            raise HTTPException(
                status_code=413,
                detail=f"Text at index {i} exceeds 8,192 characters",
            )

    try:
        result = await embed_texts(request.texts)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Embedding service error: {str(exc)}") from exc

    try:
        output_id = await save_output(
            input_data={"text_count": len(request.texts), "total_chars": sum(len(t) for t in request.texts)},
            output_data={"embedding_dimensions": len(result["embeddings"][0]) if result["embeddings"] else 0},
            metadata={"model": result["model"]},
        )
    except Exception as exc:
        logger.warning("Failed to persist embed output: %s", str(exc))
        output_id = "not-persisted"

    return EmbedResponse(
        embeddings=result["embeddings"],
        model=result["model"],
        output_id=output_id,
    )

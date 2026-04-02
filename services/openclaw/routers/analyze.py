from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import re

from services.llm_client import analyze_code
from services.data_client import save_output
from config import settings

router = APIRouter()

# ─── Language Detection ───────────────────────────────────────────────────────
LANGUAGE_SIGNATURES = {
    "python": [r"\bdef \w+\(", r"\bimport \w+", r"\bclass \w+:", r"print\(", r"#!.*python"],
    "javascript": [r"\bconst \w+", r"\blet \w+", r"\bvar \w+", r"=>\s*\{", r"require\(", r"module\.exports"],
    "typescript": [r": string", r": number", r": boolean", r"interface \w+", r"type \w+ =", r"<T>"],
    "java": [r"public class", r"public static void main", r"System\.out\.println", r"@Override"],
    "go": [r"\bfunc \w+\(", r"\bpackage main\b", r":=", r"\bfmt\.Print"],
    "rust": [r"\bfn \w+\(", r"\blet mut\b", r"\bimpl \w+", r"println!"],
    "cpp": [r"#include\s*<", r"\bstd::", r"cout\s*<<", r"\bvoid\s+\w+\("],
    "c": [r"#include\s*<stdio\.h>", r"\bprintf\(", r"\bint main\("],
    "ruby": [r"\bdef \w+", r"\bend\b", r"\bputs\b", r"\.each\b"],
    "php": [r"<\?php", r"\$\w+\s*=", r"echo\s+"],
    "bash": [r"#!/bin/bash", r"#!/bin/sh", r"\$\{.*\}", r"\becho\b.*\$"],
    "sql": [r"\bSELECT\b.*\bFROM\b", r"\bINSERT INTO\b", r"\bCREATE TABLE\b"],
    "html": [r"<html", r"<body", r"<div", r"<!DOCTYPE"],
    "css": [r"\.\w+\s*\{", r"#\w+\s*\{", r"@media\b"],
}


def detect_language(code: str) -> str:
    """Heuristic language detection based on code patterns."""
    scores: dict[str, int] = {}
    for lang, patterns in LANGUAGE_SIGNATURES.items():
        score = sum(1 for p in patterns if re.search(p, code, re.IGNORECASE | re.MULTILINE))
        if score > 0:
            scores[lang] = score

    if not scores:
        return "unknown"
    return max(scores, key=lambda k: scores[k])


# ─── Request / Response models ────────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    code: str = Field(..., min_length=1, description="Source code to analyze")
    language: Optional[str] = Field(None, description="Programming language (auto-detected if omitted)")
    options: Optional[dict] = Field(None, description="Additional analysis options")


class AnalyzeResponse(BaseModel):
    analysis: str
    language: str
    tokens_used: int
    output_id: str


# ─── Endpoint ─────────────────────────────────────────────────────────────────
@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_endpoint(request: AnalyzeRequest):
    if len(request.code) > settings.max_code_length_chars:
        raise HTTPException(
            status_code=413,
            detail=f"Code exceeds maximum length of {settings.max_code_length_chars} characters",
        )

    language = request.language or detect_language(request.code)

    try:
        result = await analyze_code(request.code, language)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM service error: {str(exc)}") from exc

    try:
        output_id = await save_output(
            project="openclaw",
            input_data={"code_length": len(request.code), "language": language, "options": request.options},
            output_data={"analysis": result["analysis"]},
            metadata={"tokens_used": result["tokens_used"], "model": settings.llm_model},
        )
    except Exception as exc:
        # Non-fatal — log and continue without persisting
        import logging
        logging.getLogger("openclaw").warning("Failed to persist output: %s", str(exc))
        output_id = "not-persisted"

    return AnalyzeResponse(
        analysis=result["analysis"],
        language=language,
        tokens_used=result["tokens_used"],
        output_id=output_id,
    )

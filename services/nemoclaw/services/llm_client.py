import json
import logging
import urllib.request
import urllib.error
from config import settings

logger = logging.getLogger("nemoclaw")

MODEL_ROUTER_URL = "http://model-router:3004"


def _call_model_router(messages: list, max_tokens: int = 512, temperature: float = 0.3) -> dict:
    """Call the Carbon-Copy model-router via OpenAI-compatible endpoint."""
    payload = json.dumps({
        "model": settings.llm_model,
        "messages": messages,
        "max_tokens": max_tokens,
        "options": {"temperature": temperature},
    }).encode()
    req = urllib.request.Request(
        f"{MODEL_ROUTER_URL}/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        tokens = result.get("usage", {}).get("total_tokens", 0)
        return {"content": content, "tokens_used": tokens}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        logger.error(f"Model router error {e.code}: {body}")
        raise RuntimeError(f"LLM service error: {body}")
    except Exception as e:
        logger.error(f"Model router call failed: {e}")
        raise RuntimeError(f"LLM service error: {e}")


async def classify_text(text: str, labels: list[str], multi_label: bool) -> list:
    """Classify text into provided labels using the model router."""
    from routers.classify import LabelScore

    label_list = ", ".join(f'"{l}"' for l in labels)
    mode = "one or more" if multi_label else "exactly one"

    system_prompt = (
        "You are a precise text classification assistant. "
        f"Classify the provided text into {mode} of the given labels. "
        "Return a JSON array of objects, each with 'label' (string) and 'confidence' (float 0.0-1.0). "
        "Sort by confidence descending. Return only the JSON array, no other text."
    )
    user_prompt = f"Labels: [{label_list}]\n\nText to classify:\n{text}"

    result = _call_model_router(
        [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
        max_tokens=512,
        temperature=0.0,
    )
    raw = result["content"] or "[]"

    try:
        parsed = json.loads(raw)
        items = parsed if isinstance(parsed, list) else parsed.get("labels", parsed.get("classifications", []))
    except json.JSONDecodeError:
        logger.warning("classify_text: failed to parse LLM JSON response")
        items = []

    results = []
    for item in items:
        if isinstance(item, dict) and "label" in item:
            label = str(item["label"])
            confidence = float(item.get("confidence", 0.5))
            confidence = max(0.0, min(1.0, confidence))
            if label in labels:
                results.append(LabelScore(label=label, confidence=confidence))
    return results


async def summarize_text(text: str, max_length: int, style: str) -> dict:
    """Summarize text using the model router."""
    style_instructions = {
        "concise": f"Provide a concise summary in approximately {max_length} words.",
        "detailed": f"Provide a detailed, comprehensive summary in approximately {max_length} words.",
        "bullet-points": f"Summarize using bullet points. Aim for {max_length // 20} key points.",
    }.get(style, f"Summarize in approximately {max_length} words.")

    system_prompt = (
        "You are an expert summarization assistant. "
        f"{style_instructions} "
        "Preserve key information, names, dates, and conclusions. "
        "Return only the summary text."
    )

    result = _call_model_router(
        [{"role": "system", "content": system_prompt}, {"role": "user", "content": text}],
        max_tokens=max_length * 2,
        temperature=0.3,
    )
    return {"summary": result["content"], "tokens_used": result["tokens_used"]}


async def embed_texts(texts: list[str]) -> dict:
    """
    Generate embeddings — fallback to simple hash-based vectors when no embedding model.
    Full embedding support requires a dedicated embedding service.
    """
    logger.warning("embed_texts: using fallback (no embedding model configured)")
    # Return zero vectors as placeholder — real embeddings need text-embedding model
    dim = 384
    embeddings = [[0.0] * dim for _ in texts]
    return {"embeddings": embeddings, "model": "fallback-zeros"}

import json
import logging
from openai import AsyncOpenAI
from config import settings

logger = logging.getLogger("nemoclaw")

_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            base_url=settings.llm_api_base_url,
            api_key=settings.llm_api_key,
        )
    return _client


async def classify_text(text: str, labels: list[str], multi_label: bool) -> list:
    """
    Classify text into provided labels using an LLM.

    Returns:
        list of LabelScore-like dicts with 'label' and 'confidence' keys.
    """
    from routers.classify import LabelScore

    label_list = ", ".join(f'"{l}"' for l in labels)
    mode = "one or more" if multi_label else "exactly one"

    system_prompt = (
        "You are a precise text classification assistant. "
        f"Classify the provided text into {mode} of the given labels. "
        "Return a JSON array of objects, each with 'label' (string) and 'confidence' (float 0.0–1.0). "
        "Sort by confidence descending. Return only the JSON array, no other text."
    )

    user_prompt = f"Labels: [{label_list}]\n\nText to classify:\n{text}"

    client = get_client()
    response = await client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.0,
        max_tokens=512,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content or "[]"

    try:
        parsed = json.loads(raw)
        # Handle both {"labels": [...]} and plain [...] responses
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
            if label in labels:  # only return labels from the original set
                results.append(LabelScore(label=label, confidence=confidence))

    return results


async def summarize_text(text: str, max_length: int, style: str) -> dict:
    """
    Summarize text using an LLM.

    Returns:
        dict with keys: summary (str), tokens_used (int)
    """
    style_instructions = {
        "concise": f"Provide a concise summary in approximately {max_length} words.",
        "detailed": f"Provide a detailed, comprehensive summary in approximately {max_length} words.",
        "bullet-points": f"Summarize using bullet points. Aim for {max_length // 20} key points.",
    }.get(style, f"Summarize in approximately {max_length} words.")

    system_prompt = (
        "You are an expert summarization assistant. "
        f"{style_instructions} "
        "Preserve key information, names, dates, and conclusions. "
        "Return only the summary text — no preamble, no labels."
    )

    client = get_client()
    response = await client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
        temperature=0.3,
        max_tokens=max_length * 2,  # generous buffer for word count approximation
    )

    summary = response.choices[0].message.content or ""
    tokens_used = response.usage.total_tokens if response.usage else 0

    return {"summary": summary, "tokens_used": tokens_used}


async def embed_texts(texts: list[str]) -> dict:
    """
    Generate embeddings for a list of texts.

    Returns:
        dict with keys: embeddings (list[list[float]]), model (str)
    """
    client = get_client()
    response = await client.embeddings.create(
        model=settings.embedding_model,
        input=texts,
    )

    embeddings = [item.embedding for item in sorted(response.data, key=lambda x: x.index)]
    model = response.model

    return {"embeddings": embeddings, "model": model}
